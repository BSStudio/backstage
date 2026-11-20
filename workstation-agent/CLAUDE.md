# Workstation agent

The scripts run on Windows PowerShell 5.1, not PowerShell 7 (see [Architectural decisions](../docs/decisions.md)). Syntax and parameters added in 7 — `??`, `?:`, `&&` and `||` between commands, `ForEach-Object -Parallel`, `ConvertFrom-Json -AsHashtable` — break on the workstations.

`pnpm check`, the test suite and CI do not cover this folder. Before calling a change done, parse every script with Windows PowerShell 5.1 (`powershell.exe`, not `pwsh`); each must report 0 errors:

```powershell
powershell.exe -NoProfile -Command 'foreach ($f in Get-ChildItem workstation-agent\*.ps1) { $e = $null; [void][System.Management.Automation.Language.Parser]::ParseFile($f.FullName, [ref]$null, [ref]$e); "{0}: {1} errors" -f $f.Name, $e.Count }'
```

Parsing catches 7-only syntax, not 7-only parameters, which fail only when the line runs: run any command you change under `powershell.exe` too.
