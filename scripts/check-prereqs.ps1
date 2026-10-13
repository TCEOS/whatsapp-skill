#Requires -Version 5.1
# check-prereqs.ps1 — verify Bun + skill scripts (no server, no HTTP, no DB).
$Fail = $false
function Ok($m) { Write-Host "OK: $m" }
function Missing($m) { Write-Host "MISSING: $m"; $script:Fail = $true }
function Info($m) { Write-Host "INFO: $m" }

try { $v = (bun --version) 2>$null; if ($v) { Ok "bun $v" } else { Missing "Bun >=1.0 (irm bun.sh/install.ps1 | iex)" } }
catch { Missing "Bun >=1.0 (irm bun.sh/install.ps1 | iex)" }

try { $v = (python --version) 2>$null; if ($v) { Ok "$v (for verify/install helpers)" } else { Info "python not found (optional)" } }
catch { Info "python not found (optional)" }

if (Test-Path "SKILL.md") { Ok "SKILL.md exists" } else { Missing "SKILL.md missing" }
if (Test-Path "references/messages.md") { Ok "operation reference documents exist" } else { Missing "operation reference documents missing" }
if (Test-Path "scripts") { Ok "scripts/ exists" } else { Missing "scripts/ missing" }
if (Test-Path "scripts/package.json") { Ok "scripts/package.json exists" } else { Missing "scripts/package.json missing" }
if (Test-Path "scripts/node_modules") { Ok "scripts dependencies installed" } else { Missing "run: cd scripts; bun install" }
if (Test-Path "references") { Ok "references/ exists" } else { Missing "references/ missing" }

foreach ($s in @("pair", "send", "groups", "contacts", "status", "react", "business", "poll-results", "poll-watch", "delete", "chats", "labels")) {
  try {
    bun "scripts/$s.mjs" --help > $null 2>&1
    if ($LASTEXITCODE -eq 0) { Ok "scripts/$s.mjs --help" } else { Missing "scripts/$s.mjs --help failed" }
  } catch { Missing "scripts/$s.mjs --help failed" }
}

if ($Fail) { Write-Host "RESULT: prerequisites INCOMPLETE"; exit 1 }
Write-Host "RESULT: prerequisites OK"
