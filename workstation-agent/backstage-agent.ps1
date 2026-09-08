#Requires -Version 5.1

# Backstage workstation agent. Runs as SYSTEM under a scheduled task; install-agent.ps1
# puts it there. See README.md.

[CmdletBinding()]
param(
    [string]$ConfigPath = "$env:ProgramData\BSS\backstage-agent\config.json"
)

$ErrorActionPreference = 'Stop'

# Overwritten from the config below with the release tag the bootstrap installed, so the
# portal can say which machines are still on an old agent.
$script:AgentVersion = 'dev'
$EventSource = 'BackstageAgent'

# Windows PowerShell 5.1 on an older .NET still enumerates TLS 1.0, which no current origin
# accepts. SystemDefault (0) is left alone rather than overwritten: it is what lets Windows
# negotiate TLS 1.3, and assigning Tls12 over it would pin this process below what the OS
# already offers. Anything else has 1.2 added to it rather than replaced by it.
if ([Net.ServicePointManager]::SecurityProtocol -ne 0) {
    [Net.ServicePointManager]::SecurityProtocol =
        [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
}

$script:Token = $null
$script:TokenExpiresAt = [DateTime]::MinValue

function Write-AgentLog {
    param(
        [string]$Message,
        [ValidateSet('Information', 'Warning', 'Error')][string]$Level = 'Information',
        [int]$EventId = 1000
    )

    try {
        Write-EventLog -LogName Application -Source $EventSource -EntryType $Level `
            -EventId $EventId -Message $Message
    }
    catch {
        # Running outside the installer, so there is no event source. Still worth saying.
        Write-Output "[$Level] $Message"
    }
}

# Win32_ComputerSystem.UserName names the console session, and an RDP client leaves that session
# locked behind it — so on the machines the studio actually works on remotely it reports either
# nobody or the wrong person. The session table is the only thing that answers for both, and its
# connect state is a numeric enum rather than the localised text `quser` prints.
$WtsSource = @'
using System;
using System.Collections.Generic;
using System.Runtime.InteropServices;

public static class BackstageWts {
    [DllImport("wtsapi32.dll", SetLastError = true, CharSet = CharSet.Unicode, EntryPoint = "WTSEnumerateSessionsW")]
    static extern int WTSEnumerateSessions(IntPtr hServer, int Reserved, int Version, ref IntPtr ppSessionInfo, ref int pCount);

    [DllImport("wtsapi32.dll")]
    static extern void WTSFreeMemory(IntPtr pMemory);

    [DllImport("wtsapi32.dll", SetLastError = true, CharSet = CharSet.Unicode, EntryPoint = "WTSQuerySessionInformationW")]
    static extern bool WTSQuerySessionInformation(IntPtr hServer, int sessionId, int infoClass, out IntPtr ppBuffer, out int pBytesReturned);

    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    struct SessionInfo {
        public int SessionId;
        [MarshalAs(UnmanagedType.LPWStr)] public string WinStationName;
        public int State;
    }

    static string Query(int sessionId, int infoClass) {
        IntPtr buffer;
        int length;
        if (!WTSQuerySessionInformation(IntPtr.Zero, sessionId, infoClass, out buffer, out length)) return "";
        string value = Marshal.PtrToStringUni(buffer);
        WTSFreeMemory(buffer);
        return value == null ? "" : value;
    }

    // "<session id>|<connect state>|<domain>\<user>", the user empty for a session nobody is
    // signed into.
    public static string[] Sessions() {
        IntPtr sessions = IntPtr.Zero;
        int count = 0;
        List<string> rows = new List<string>();
        if (WTSEnumerateSessions(IntPtr.Zero, 0, 1, ref sessions, ref count) == 0) return rows.ToArray();
        try {
            int size = Marshal.SizeOf(typeof(SessionInfo));
            for (int i = 0; i < count; i++) {
                SessionInfo info = (SessionInfo)Marshal.PtrToStructure(new IntPtr(sessions.ToInt64() + i * size), typeof(SessionInfo));
                string user = Query(info.SessionId, 5);
                string domain = Query(info.SessionId, 7);
                string who = user.Length == 0 ? "" : (domain.Length == 0 ? user : domain + "\\" + user);
                rows.Add(info.SessionId + "|" + info.State + "|" + who);
            }
        } finally { WTSFreeMemory(sessions); }
        return rows.ToArray();
    }
}
'@

# A machine where this will not compile still reports its load: Get-Metadata catches the missing
# type and leaves the field out, which the portal renders as "no idea" rather than "free".
try { Add-Type -TypeDefinition $WtsSource -Language CSharp } catch { }

function Get-SessionOccupancy {
    # State 0 is WTSActive: attached to a display, local or remote. Anything else — most often a
    # disconnected RDP session — is somebody who signed in and left.
    $lockedSessions = @(Get-Process LogonUI -ErrorAction SilentlyContinue |
        Select-Object -ExpandProperty SessionId -Unique)

    $signedIn = $null

    foreach ($row in [BackstageWts]::Sessions()) {
        $fields = $row -split '\|'
        $user = $fields[2]
        if (-not $user) { continue }

        # LogonUI per session, not per machine: it is running for the console the whole time
        # somebody works over RDP.
        if ($fields[1] -eq '0' -and $lockedSessions -notcontains [int]$fields[0]) {
            return @{ loggedInUser = $user; locked = $false }
        }
        if (-not $signedIn) { $signedIn = $user }
    }

    if ($signedIn) { return @{ loggedInUser = $signedIn; locked = $true } }
    return @{ loggedInUser = $null; locked = $false }
}

function Get-Metadata {
    $meta = @{ agentVersion = $script:AgentVersion }

    try {
        $os = Get-CimInstance Win32_OperatingSystem
        $meta.os = $os.Caption.Trim()
        if ($os.TotalVisibleMemorySize -gt 0) {
            $used = $os.TotalVisibleMemorySize - $os.FreePhysicalMemory
            $meta.memoryPercent = [math]::Round(($used / $os.TotalVisibleMemorySize) * 100, 1)
        }
    }
    catch { }

    try {
        $load = Get-CimInstance Win32_Processor | Measure-Object -Property LoadPercentage -Average
        if ($null -ne $load.Average) {
            $meta.cpuPercent = [math]::Round($load.Average, 1)
        }
    }
    catch { }

    try {
        $disk = Get-CimInstance Win32_LogicalDisk -Filter "DeviceID='$env:SystemDrive'"
        if ($disk -and $disk.Size -gt 0) {
            $meta.diskPercent = [math]::Round((($disk.Size - $disk.FreeSpace) / $disk.Size) * 100, 1)
        }
    }
    catch { }

    # Left out entirely on failure rather than reported as null, which would claim the machine
    # is free on the strength of a query that did not run.
    try {
        $occupancy = Get-SessionOccupancy
        $meta.loggedInUser = $occupancy.loggedInUser
        $meta.locked = $occupancy.locked
    }
    catch { }

    return $meta
}

function Get-AccessToken {
    param($Config, [string]$Secret)

    if ($script:Token -and (Get-Date) -lt $script:TokenExpiresAt) { return $script:Token }

    # Authentik's issuer ends in a slash. Joining onto it unnormalised yields a double slash
    # that discovery answers 404 to.
    $issuer = $Config.issuer.TrimEnd('/')
    $discovery = Invoke-RestMethod -Method Get -TimeoutSec 30 `
        -Uri "$issuer/.well-known/openid-configuration"

    # The service account's app password is the whole credential; the provider's client
    # secret stays out of the workstation entirely.
    $body = @{
        grant_type = 'client_credentials'
        client_id  = $Config.clientId
        username   = $Config.username
        password   = $Secret
        scope      = 'openid profile'
    }
    $token = Invoke-RestMethod -Method Post -Uri $discovery.token_endpoint -Body $body -TimeoutSec 30

    $script:Token = $token.access_token
    $script:TokenExpiresAt = (Get-Date).AddSeconds([int]$token.expires_in - 60)
    return $script:Token
}

function Send-Ping {
    param($Config, [string]$Secret)

    $token = Get-AccessToken -Config $Config -Secret $Secret
    $body = @{ metadata = (Get-Metadata) } | ConvertTo-Json -Depth 4 -Compress
    $uri = "$($Config.baseUrl.TrimEnd('/'))/api/computers/$($Config.computerId)/ping"

    Invoke-RestMethod -Method Post -Uri $uri -TimeoutSec 30 -ContentType 'application/json' `
        -Headers @{ Authorization = "Bearer $token" } -Body $body | Out-Null
}

# ─── Startup ─────────────────────────────────────────────────────────────────

if (-not (Test-Path $ConfigPath)) {
    Write-AgentLog -Level Error -EventId 1001 -Message `
        "No config at $ConfigPath. Run install-agent.ps1 first."
    exit 1
}

$config = Get-Content -Path $ConfigPath -Raw -Encoding UTF8 | ConvertFrom-Json
$secretPath = Join-Path (Split-Path $ConfigPath -Parent) 'secret.dat'

try {
    Add-Type -AssemblyName System.Security
    $secret = [Text.Encoding]::UTF8.GetString(
        [Security.Cryptography.ProtectedData]::Unprotect(
            [IO.File]::ReadAllBytes($secretPath), $null, 'LocalMachine'))
}
catch {
    Write-AgentLog -Level Error -EventId 1002 -Message `
        "Could not read the app password from $secretPath. $($_.Exception.Message)"
    exit 1
}

# Floored rather than trusted: 0 sleeps not at all and turns the loop into a ping flood the
# rate limiter answers 429 to forever, and a negative value throws out of Start-Sleep — which
# sits outside the try below, so the agent would die until the five-minute trigger restarted it
# into the same crash.
$interval = 60
if ($config.PSObject.Properties.Name -contains 'intervalSeconds') {
    $interval = [Math]::Max(30, [int]$config.intervalSeconds)
}
if ($config.PSObject.Properties.Name -contains 'agentVersion') {
    $script:AgentVersion = $config.agentVersion
}

Write-AgentLog -EventId 1000 -Message "Agent $script:AgentVersion started for $($config.computerId)."

# ─── Loop ────────────────────────────────────────────────────────────────────

$failures = 0
while ($true) {
    try {
        Send-Ping -Config $config -Secret $secret
        if ($failures -gt 0) {
            Write-AgentLog -EventId 1003 -Message "Ping recovered after $failures failed attempts."
        }
        $failures = 0
    }
    catch {
        $failures++
        # Exiting would not fix an unreachable portal or a rejected credential. Only the
        # first failure of a run is logged, or an outage fills the log a line a minute.
        if ($failures -eq 1) {
            Write-AgentLog -Level Warning -EventId 1004 -Message "Ping failed: $($_.Exception.Message)"
        }
        # The token may simply have expired early; drop it so the next attempt re-mints.
        $script:Token = $null
    }

    Start-Sleep -Seconds $interval
}
