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

# Windows PowerShell 5.1 still negotiates TLS 1.0 by default, which no current origin accepts.
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

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

    # Logon type 2 is the console and 10 is RDP, and both mean the machine is taken — someone
    # working over RDP still has the timeline open. Win32_ComputerSystem.UserName reports the
    # console only, so it would call an RDP-only machine free. Windows opens several logon
    # sessions per sign-in, hence the dedupe. Null rather than absent says nobody is on it.
    try {
        $accounts = Get-CimInstance Win32_LogonSession -Filter 'LogonType = 2 OR LogonType = 10' |
            ForEach-Object {
                Get-CimAssociatedInstance -InputObject $_ -ResultClassName Win32_Account -ErrorAction SilentlyContinue
            } |
            ForEach-Object { "$($_.Domain)\$($_.Name)" } |
            Sort-Object -Unique

        if ($accounts) { $meta.loggedInUser = ($accounts -join ', ') }
        else { $meta.loggedInUser = $null }
    }
    catch { $meta.loggedInUser = $null }

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

$interval = 60
if ($config.PSObject.Properties.Name -contains 'intervalSeconds') {
    $interval = [int]$config.intervalSeconds
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
        # An unreachable portal is not something to die over, and exiting would not fix a
        # rejected credential either. Only the first failure of a run is logged, or a
        # weekend-long outage fills the event log with one entry a minute.
        if ($failures -eq 1) {
            Write-AgentLog -Level Warning -EventId 1004 -Message "Ping failed: $($_.Exception.Message)"
        }
        # The token may simply have expired early; drop it so the next attempt re-mints.
        $script:Token = $null
    }

    Start-Sleep -Seconds $interval
}
