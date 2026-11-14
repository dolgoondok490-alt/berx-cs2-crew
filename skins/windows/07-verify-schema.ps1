# 07 — WeaponPaints MySQL schema-г agent-ийн хэрэглэгчээр шалгах (information_schema; юу ч бичихгүй)
. "$PSScriptRoot\common.ps1"
if (-not (Test-Path (Join-Path $BERX.AgentDir 'skins-sync.js'))) { Bad 'agent\skins-sync.js алга — repo-оос хуулна уу'; exit 1 }
if (-not (Test-Path (Join-Path $BERX.AgentDir 'node_modules\mysql2'))) { Step 'mysql2 суулгах (agent хавтсанд)'; Push-Location $BERX.AgentDir; npm install --no-audit --no-fund; Pop-Location }
Step 'Schema'
Push-Location $BERX.AgentDir
node skins-sync.js --check-schema; $code = $LASTEXITCODE
Pop-Location
if ($code -eq 0) { Ok 'Schema таарч байна' } else { Bad 'Schema таарахгүй — agent синк хийхгүй'; exit 1 }
