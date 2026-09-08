#Requires -Version 5.1

# One-liner installer for the Backstage workstation agent. Resolves the repository's latest
# release and installs the agent as published at that tag. See README.md.

[CmdletBinding()]
param(
    [string]$Ref,
    [string]$BaseUrl,
    [string]$Issuer,
    [string]$ClientId,
    [string]$Username,
    [string]$ComputerId,
    [int]$IntervalSeconds = 60,
    [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'

$Repo = 'BSStudio/backstage'

# Windows PowerShell 5.1 on an older .NET still enumerates TLS 1.0, which GitHub refuses.
# SystemDefault (0) is left alone rather than overwritten: it is what lets Windows negotiate
# TLS 1.3, and assigning Tls12 over it would pin this process below what the OS already offers.
if ([Net.ServicePointManager]::SecurityProtocol -ne 0) {
    [Net.ServicePointManager]::SecurityProtocol =
        [Net.ServicePointManager]::SecurityProtocol -bor [Net.SecurityProtocolType]::Tls12
}

# This script arrives through `iex` and so runs under any policy, but the installer it fetches
# is a file, and a workstation's default policy is Restricted. Process scope dies with this
# session and leaves the machine's own setting alone.
Set-ExecutionPolicy Bypass -Scope Process -Force

# `#Requires -RunAsAdministrator` is not enforced when this arrives through `iex`, so the
# check is explicit. Without it the failure lands halfway through, on the first icacls.
$principal = New-Object Security.Principal.WindowsPrincipal(
    [Security.Principal.WindowsIdentity]::GetCurrent())
if (-not $principal.IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator)) {
    throw 'Run this from an elevated PowerShell (Run as administrator).'
}

if (-not $Ref) {
    # Pinned to a release rather than main: a workstation should not pick up whatever landed
    # on the default branch this afternoon.
    $release = Invoke-RestMethod -TimeoutSec 30 `
        -Uri "https://api.github.com/repos/$Repo/releases/latest" `
        -Headers @{ 'User-Agent' = 'backstage-agent-bootstrap' }
    $Ref = $release.tag_name
}

Write-Host "Installing the Backstage agent from $Repo@$Ref"

$staging = Join-Path ([IO.Path]::GetTempPath()) ("backstage-agent-" + [Guid]::NewGuid().ToString('n'))
New-Item -ItemType Directory -Path $staging -Force | Out-Null

try {
    foreach ($file in @('backstage-agent.ps1', 'install-agent.ps1')) {
        Invoke-WebRequest -UseBasicParsing -TimeoutSec 30 `
            -Uri "https://raw.githubusercontent.com/$Repo/$Ref/workstation-agent/$file" `
            -OutFile (Join-Path $staging $file)
    }

    $installer = Join-Path $staging 'install-agent.ps1'

    if ($Uninstall) {
        & $installer -Uninstall
        return
    }

    # Only what the caller actually passed, so install-agent.ps1 prompts for the rest.
    $installArgs = @{ IntervalSeconds = $IntervalSeconds; AgentVersion = $Ref }
    foreach ($name in @('BaseUrl', 'Issuer', 'ClientId', 'Username', 'ComputerId')) {
        if ($PSBoundParameters.ContainsKey($name)) {
            $installArgs[$name] = $PSBoundParameters[$name]
        }
    }

    & $installer @installArgs
}
finally {
    Remove-Item -Path $staging -Recurse -Force -ErrorAction SilentlyContinue
}
