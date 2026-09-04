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

# Windows PowerShell 5.1 still negotiates TLS 1.0 by default, which GitHub refuses.
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

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
            -Uri "https://raw.githubusercontent.com/$Repo/$Ref/scripts/agent/$file" `
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
