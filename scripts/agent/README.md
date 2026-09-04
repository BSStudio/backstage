# Workstation agent

A heartbeat for one editing station. It pings `POST /api/computers/<id>/ping` every minute and
`/computers` renders what it reports: OS, CPU, memory, disk and who is signed in at the console.

Windows PowerShell 5.1, which every Windows box already has. Nothing to install but the scripts here.

## Authentik, once per workstation

One service account per machine, so a stolen credential is scoped to that machine.

1. **Directory → Users → Create service account**, e.g. `nle4-agent`. Keep the generated app
   password — it is shown once, and it is the whole credential.
2. Add the account to the group named by `AUTHENTIK_GROUP_COMPUTER_AGENTS`.
3. Nothing else. The agent authenticates against the same provider Backstage logs in through,
   so there is no second application, provider or redirect URI.

## Install

From an **elevated** PowerShell on the workstation:

```powershell
irm https://raw.githubusercontent.com/BSStudio/backstage/main/scripts/agent/bootstrap.ps1 | iex
```

It installs the latest release, then asks for the Backstage URL, the Authentik issuer and client
id, the service account and its app password, and the computer id — which defaults to the
machine's own name lowercased (`NLE4` → `nle4`).

To pass answers instead of being asked, the pipe has to become a script block:

```powershell
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/BSStudio/backstage/main/scripts/agent/bootstrap.ps1))) `
  -BaseUrl https://backstage.bsstudio.hu `
  -Issuer https://login.bsstudio.hu/application/o/backstage/ `
  -ClientId <client id> -Username nle4-agent
```

`-Ref` installs a specific tag or branch, for testing an unreleased version.

The machine appears on `/computers` within a minute of the first ping. Nothing has to be created
in the portal first — the first ping is what registers it.

## What the installer sets up

Everything lands in `C:\ProgramData\BSS\backstage-agent\`, readable only by SYSTEM and
Administrators. Revoke a machine by deleting its service account in Authentik.

It runs as SYSTEM under a scheduled task named `BSS Backstage Agent`, so it starts before anyone
logs on, survives logoff, and a standard user cannot stop it. It restarts itself on a crash, and a
trigger every five minutes picks it back up if it is killed outright.

The version installed is reported with every ping, so an out-of-date workstation is visible from
the portal.

One workstation cannot impersonate another: the first service account to ping a given id owns it,
and a different account pinging the same id is refused. Re-pairing means deleting the machine from
`/computers` first.

## Check on it

```powershell
Get-ScheduledTask -TaskName 'BSS Backstage Agent'
Get-WinEvent -FilterHashtable @{LogName='Application'; ProviderName='BackstageAgent'} -MaxEvents 10
```

A healthy agent logs once at startup and stays quiet. A failing one logs the first failure of a
run and then goes quiet too, so a weekend outage does not fill the log — it logs again when pings
recover, naming how many were missed.

## When it will not ping

| Symptom | Cause |
| --- | --- |
| `403` | The service account is not in `AUTHENTIK_GROUP_COMPUTER_AGENTS`, or the provider does not issue a `groups` claim — check the scope mappings on the Backstage provider |
| `403` after a working install | Another service account already claimed this computer id |
| `401` | Wrong `clientId`, wrong issuer, or the app password was rotated |
| `400` | The computer id is not 2–32 lowercase letters, digits or hyphens |
| Discovery 404s | A double slash in the issuer — the agent trims a trailing one, so check the value itself |
| Nothing in the event log | The installer did not finish; the event source is registered by it |

## Uninstall

```powershell
& ([scriptblock]::Create((irm https://raw.githubusercontent.com/BSStudio/backstage/main/scripts/agent/bootstrap.ps1))) -Uninstall
```

Removes the task, the folder and the event source. Delete the service account in Authentik to
revoke the credential, and delete the machine from `/computers` — otherwise it sits there offline
forever.
