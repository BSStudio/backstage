#Requires -Version 5.1
#Requires -RunAsAdministrator

# Installs the Backstage workstation agent as a SYSTEM scheduled task. See README.md.

[CmdletBinding()]
param(
    [string]$BaseUrl,
    [string]$Issuer,
    [string]$ClientId,
    [string]$Username,
    [string]$ComputerId,
    [int]$IntervalSeconds = 60,
    [string]$AgentVersion = 'dev',
    [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'

$InstallDir = "$env:ProgramData\BSS\backstage-agent"
$TaskName = 'BSS Backstage Agent'
$EventSource = 'BackstageAgent'
$AgentScript = 'backstage-agent.ps1'

# Unregistering the task does not stop the powershell.exe it already started, and
# -DisallowHardTerminate means asking the task to stop may not either. The agent is an endless
# loop holding its config, its id and its token in memory, so a survivor keeps pinging from a
# machine with nothing installed on it — and a reinstall stacks a second one alongside, the two
# reporting whatever id each was started with.
# The owner is checked as well as the path: an administrator who pasted a snippet naming the
# install directory has it in their own shell's command line, and matching on text alone kills
# the console the uninstall is being typed into. S-1-5-18 is SYSTEM, and unlike the account name
# it is not localised.
function Stop-RunningAgents {
    Get-CimInstance Win32_Process -Filter "Name = 'powershell.exe'" |
        Where-Object {
            if (-not ($_.CommandLine -and $_.CommandLine -like "*$InstallDir\$AgentScript*")) { return $false }
            # A process that exits between the enumeration and this call raises a terminating
            # CimException under $ErrorActionPreference = 'Stop', which would abort the install
            # or the uninstall around it rather than skip one row.
            $sid = $null
            try { $sid = (Invoke-CimMethod -InputObject $_ -MethodName GetOwnerSid).Sid } catch { }
            # An owner that will not resolve is treated as a match rather than skipped: only the
            # install path reaches here, and a console can always read its own owner, so this
            # cannot fall back onto the administrator running the uninstall.
            $sid -eq 'S-1-5-18' -or [string]::IsNullOrEmpty($sid)
        } |
        ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }
}

# ─── Uninstall ───────────────────────────────────────────────────────────────

if ($Uninstall) {
    # Unregister first, so nothing relaunches what is about to be killed.
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
    Stop-RunningAgents
    Remove-Item -Path $InstallDir -Recurse -Force -ErrorAction SilentlyContinue
    Remove-EventLog -Source $EventSource -ErrorAction SilentlyContinue
    Write-Host "Removed. Delete the service account in Authentik to revoke its credential."
    return
}

# ─── Answers ─────────────────────────────────────────────────────────────────

if (-not $BaseUrl) { $BaseUrl = Read-Host 'Backstage URL (e.g. https://backstage.bsstudio.hu)' }
if (-not $Issuer) { $Issuer = Read-Host 'Authentik issuer (AUTHENTIK_ISSUER)' }
if (-not $ClientId) { $ClientId = Read-Host 'Authentik client id (AUTHENTIK_CLIENT_ID)' }
if (-not $Username) { $Username = Read-Host 'Service account username for this workstation' }

if (-not $ComputerId) {
    $suggested = ($env:COMPUTERNAME -replace '[^A-Za-z0-9-]', '').ToLowerInvariant()
    $answer = Read-Host "Computer id [$suggested]"
    if ([string]::IsNullOrWhiteSpace($answer)) { $ComputerId = $suggested } else { $ComputerId = $answer }
}

# The portal shows ids uppercased, so typing the machine name as it is written on the case is
# the obvious mistake. Normalise it rather than refuse it.
$ComputerId = $ComputerId.Trim().ToLowerInvariant()

# Matches ComputerIdSchema. Rejected here rather than at the first ping, which nobody watches —
# and -cnotmatch because -notmatch ignores case, so it passed the one id the server refuses.
if ($ComputerId -cnotmatch '^[a-z0-9][a-z0-9-]{1,31}$') {
    throw "Computer id '$ComputerId' must be 2-32 lowercase letters, digits or hyphens, and start with a letter or digit."
}

$secure = Read-Host "App password for $Username" -AsSecureString
$secret = [Runtime.InteropServices.Marshal]::PtrToStringUni(
    [Runtime.InteropServices.Marshal]::SecureStringToGlobalAllocUnicode($secure))
if ([string]::IsNullOrWhiteSpace($secret)) { throw 'The app password is required.' }

# ─── Files ───────────────────────────────────────────────────────────────────

# Unregistered before it is killed, or the repeating trigger relaunches the agent onto the
# half-written config and secret below. Register-ScheduledTask puts the task back at the end.
Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue

# Before the script it is running is overwritten, and before a second copy can outlive this one.
Stop-RunningAgents

New-Item -ItemType Directory -Path $InstallDir -Force | Out-Null

# The ACL is the real boundary around the credential, so it is set before the secret lands.
# SIDs rather than names: "Administrators" is localised, S-1-5-32-544 is not.
icacls $InstallDir /inheritance:r /grant '*S-1-5-18:(OI)(CI)F' '*S-1-5-32-544:(OI)(CI)F' | Out-Null

Copy-Item -Path (Join-Path $PSScriptRoot 'backstage-agent.ps1') -Destination $InstallDir -Force

@{
    baseUrl         = $BaseUrl.TrimEnd('/')
    issuer          = $Issuer
    clientId        = $ClientId
    username        = $Username
    computerId      = $ComputerId
    intervalSeconds = $IntervalSeconds
    agentVersion    = $AgentVersion
} | ConvertTo-Json | Set-Content -Path (Join-Path $InstallDir 'config.json') -Encoding UTF8

# DPAPI at machine scope, because the agent has to decrypt this with no human present. That
# puts it within reach of anything running as local admin — the ACL above is what keeps
# everyone else out, and deleting the service account in Authentik is what revokes it.
Add-Type -AssemblyName System.Security
[IO.File]::WriteAllBytes(
    (Join-Path $InstallDir 'secret.dat'),
    [Security.Cryptography.ProtectedData]::Protect(
        [Text.Encoding]::UTF8.GetBytes($secret), $null, 'LocalMachine'))

if (-not [Diagnostics.EventLog]::SourceExists($EventSource)) {
    New-EventLog -LogName Application -Source $EventSource
}

# ─── Scheduled task ──────────────────────────────────────────────────────────

$action = New-ScheduledTaskAction `
    -Execute "$env:SystemRoot\System32\WindowsPowerShell\v1.0\powershell.exe" `
    -Argument ('-NoProfile -NonInteractive -ExecutionPolicy Bypass -WindowStyle Hidden ' +
        "-File `"$InstallDir\backstage-agent.ps1`"")

# Two triggers, because they cover different deaths. RestartCount below only fires when the
# task *fails*; the repeating trigger is what picks the agent back up after a silent exit or
# an outright kill, and IgnoreNew keeps it from starting a second copy.
$triggers = @(
    (New-ScheduledTaskTrigger -AtStartup),
    (New-ScheduledTaskTrigger -Once -At (Get-Date) `
        -RepetitionInterval (New-TimeSpan -Minutes 5) `
        -RepetitionDuration (New-TimeSpan -Days 3650))
)

# SYSTEM is what makes this independent of who is signed in, and what puts it out of reach of
# a member who wants it gone: a standard user cannot terminate a SYSTEM process. A local
# administrator still can, and nothing here changes that.
$principal = New-ScheduledTaskPrincipal -UserId 'SYSTEM' -LogonType ServiceAccount -RunLevel Highest

$settings = New-ScheduledTaskSettingsSet -MultipleInstances IgnoreNew -StartWhenAvailable `
    -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries -DisallowHardTerminate `
    -ExecutionTimeLimit ([TimeSpan]::Zero) `
    -RestartCount 999 -RestartInterval (New-TimeSpan -Minutes 1)

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $triggers `
    -Principal $principal -Settings $settings -Force | Out-Null

Start-ScheduledTask -TaskName $TaskName

Write-Host ""
Write-Host "Installed $AgentVersion as '$TaskName', reporting as '$ComputerId' every $IntervalSeconds seconds."
Write-Host "Check it: Get-WinEvent -FilterHashtable @{LogName='Application'; ProviderName='$EventSource'} -MaxEvents 10"
