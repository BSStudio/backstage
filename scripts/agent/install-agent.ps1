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

# ─── Uninstall ───────────────────────────────────────────────────────────────

if ($Uninstall) {
    Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
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

# Matches ComputerIdSchema. Rejected here rather than at the first ping, which nobody watches.
if ($ComputerId -notmatch '^[a-z0-9][a-z0-9-]{1,31}$') {
    throw "Computer id '$ComputerId' must be 2-32 lowercase letters, digits or hyphens, and start with a letter or digit."
}

$secure = Read-Host "App password for $Username" -AsSecureString
$secret = [Runtime.InteropServices.Marshal]::PtrToStringUni(
    [Runtime.InteropServices.Marshal]::SecureStringToGlobalAllocUnicode($secure))
if ([string]::IsNullOrWhiteSpace($secret)) { throw 'The app password is required.' }

# ─── Files ───────────────────────────────────────────────────────────────────

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
