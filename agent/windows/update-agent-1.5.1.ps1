# =========================================================
# BERX Agent 1.5.0 → 1.5.1 шинэчлэл (Ranked AIM / BERX Guard илрүүлэлтийн засвар)
#   Commit-д pin хийсэн файлууд, SHA-256 шалгалт, `node --check`, backup, rollback.
#   .env, server.cfg, CS2 сервер, BERX Guard плагин, өгөгдлийн сан ХӨНДӨХГҮЙ.
#
# Ашиглах (PowerShell):
#   1) Шалгах (юу ч өөрчлөхгүй):   .\update-agent-1.5.1.ps1
#   2) Суулгах:                      .\update-agent-1.5.1.ps1 -Apply
#   3) Буцаах:                       .\update-agent-1.5.1.ps1 -Rollback "<backup хавтас>"
# Тоглолт явагдаагүй үед ажиллуулна. -Apply нь agent-ийг аюулгүй зогсоох дохио (.berx-stop) өгч, зогсохыг хүлээнэ.
# =========================================================
param(
  [switch]$Apply,
  [string]$Rollback,
  [string]$AgentDir = "$env:USERPROFILE\Downloads\berx-cs2-crew-main\agent"
)
$ErrorActionPreference = 'Stop'
$Commit = '3082a5e52e22c3bdad9fce8498b255183d18fb99'
$Raw = "https://raw.githubusercontent.com/dolgoondok490-alt/berx-cs2-crew/$Commit/agent"
$Files = [ordered]@{
  'berx-agent.js'           = 'da7e9a6048b41f3e976ea79c2b797b0ba84c616c0af510e879ad00a470209e3f'
  'rcon.js'                 = 'f912308f72060ddbea804ef76f794b53a40600a07b3740d574853b1b9274aff1'
  'guard.js'                = '93b7235b7a6e1c678368b6348193116af561b4fcfa966911a07b046c9f30b7d8'
  'match-history.js'        = '042e0a5697c8e82e66220815b909fc7a422baf7c3199db86e5e1d7ecd9862ab7'
  'tools/guard-diagnose.js' = '856a7000354cdcd72b574bbdcdce9736c14d438f7447ebcfead17be38867c911'
}

function Say($m, $c = 'Gray') { Write-Host $m -ForegroundColor $c }
if (-not (Test-Path (Join-Path $AgentDir 'berx-agent.js'))) { throw "Agent хавтас олдсонгүй: $AgentDir" }
$node = (Get-Command node -ErrorAction SilentlyContinue)
if (-not $node) { throw 'Node.js олдсонгүй' }

function Stop-Agent {
  $procs = Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'berx-agent\.js' }
  if (-not $procs) { Say 'Agent ажиллахгүй байна.'; return }
  Say 'Agent-д аюулгүй зогсоох дохио (.berx-stop) өгч байна...' 'Yellow'
  New-Item -ItemType File -Force -Path (Join-Path $AgentDir '.berx-stop') | Out-Null
  for ($i = 0; $i -lt 30; $i++) {
    Start-Sleep -Seconds 1
    if (-not (Get-CimInstance Win32_Process -Filter "Name='node.exe'" | Where-Object { $_.CommandLine -match 'berx-agent\.js' })) { Say 'Agent зогслоо.' 'Green'; return }
  }
  throw 'Agent 30 секундэд зогссонгүй — Launcher-ээс "Stop Agent" дарж зогсоогоод дахин ажиллуулна уу. (start-agent.bat ашигладаг бол тэр цонхыг хаана.)'
}

# ---------- Rollback ----------
if ($Rollback) {
  if (-not (Test-Path $Rollback)) { throw "Backup олдсонгүй: $Rollback" }
  Stop-Agent
  foreach ($f in $Files.Keys) {
    $b = Join-Path $Rollback $f; $t = Join-Path $AgentDir $f
    if (Test-Path $b) { New-Item -ItemType Directory -Force -Path (Split-Path $t) | Out-Null; Copy-Item $b $t -Force; Say "  сэргээв: $f" }
    elseif (Test-Path $t) { Remove-Item $t -Force; Say "  хасав (1.5.0-д байгаагүй): $f" }
  }
  & node --check (Join-Path $AgentDir 'berx-agent.js'); if ($LASTEXITCODE -ne 0) { throw 'Сэргээсэн berx-agent.js syntax алдаатай' }
  Say "✓ 1.5.0 сэргээгдлээ. Launcher-ээс Agent-ийг асаана уу (лог: 'BERX Agent v1.5.0')." 'Green'
  exit 0
}

# ---------- Татах + шалгах (юу ч өөрчлөхгүй) ----------
$stage = Join-Path $env:TEMP ("berx-agent-1.5.1-" + (Get-Date -f yyyyMMdd-HHmmss))
New-Item -ItemType Directory -Force -Path (Join-Path $stage 'tools') | Out-Null
Say "Commit $Commit-аас татаж байна → $stage"
foreach ($f in $Files.Keys) {
  $dst = Join-Path $stage $f
  Invoke-WebRequest -UseBasicParsing -Uri "$Raw/$f" -OutFile $dst
  $h = (Get-FileHash $dst -Algorithm SHA256).Hash.ToLower()
  if ($h -ne $Files[$f]) { throw "SHA-256 таарахгүй: $f`n  хүлээгдсэн $($Files[$f])`n  авсан      $h" }
  Say "  ✓ $f  $h" 'Green'
}
# Бусад agent файлууд (match-recorder.js, arena-modes.js, skins-sync.js, workshop-maps.json) 1.5.0-тай ижил → staging-д хуулж syntax шалгана
foreach ($f in @('match-recorder.js', 'arena-modes.js', 'skins-sync.js', 'workshop-maps.json')) { Copy-Item (Join-Path $AgentDir $f) (Join-Path $stage $f) -Force }
foreach ($f in @('berx-agent.js', 'rcon.js', 'guard.js', 'match-history.js', 'tools/guard-diagnose.js')) {
  & node --check (Join-Path $stage $f); if ($LASTEXITCODE -ne 0) { throw "Syntax алдаа: $f" }
}
& node -e "require('$($stage.Replace('\','/'))/rcon.js'); require('$($stage.Replace('\','/'))/guard.js'); require('$($stage.Replace('\','/'))/match-history.js'); console.log('modules ok')"
if ($LASTEXITCODE -ne 0) { throw 'Модуль ачаалагдсангүй' }
$ver = Select-String -Path (Join-Path $stage 'berx-agent.js') -Pattern "const VERSION = '1\.5\.1'" -Quiet
if (-not $ver) { throw 'Хувилбар 1.5.1 биш' }
Say '✓ Бүх файл баталгаажлаа (SHA-256 + syntax + module load).' 'Green'
if (-not $Apply) { Say "Суулгахын тулд: .\update-agent-1.5.1.ps1 -Apply" 'Yellow'; exit 0 }

# ---------- Суулгах ----------
$backup = Join-Path $AgentDir ("backup-1.5.0-" + (Get-Date -f yyyyMMdd-HHmmss))
New-Item -ItemType Directory -Force -Path (Join-Path $backup 'tools') | Out-Null
foreach ($f in $Files.Keys) { $s = Join-Path $AgentDir $f; if (Test-Path $s) { Copy-Item $s (Join-Path $backup $f) -Force } }
Say "Backup: $backup" 'Cyan'
Stop-Agent
New-Item -ItemType Directory -Force -Path (Join-Path $AgentDir 'tools') | Out-Null
foreach ($f in $Files.Keys) { Copy-Item (Join-Path $stage $f) (Join-Path $AgentDir $f) -Force }
foreach ($f in $Files.Keys) {
  $h = (Get-FileHash (Join-Path $AgentDir $f) -Algorithm SHA256).Hash.ToLower()
  if ($h -ne $Files[$f]) { Say "SHA-256 буруу ($f) — буцааж байна" 'Red'; & $PSCommandPath -Rollback $backup -AgentDir $AgentDir; exit 1 }
}
& node --check (Join-Path $AgentDir 'berx-agent.js'); if ($LASTEXITCODE -ne 0) { & $PSCommandPath -Rollback $backup -AgentDir $AgentDir; exit 1 }
Say "✓ Agent 1.5.1 суулаа. Launcher-ээс Agent-ийг асаана уу (лог: 'BERX Agent v1.5.1')." 'Green'
Say "Буцаах: .\update-agent-1.5.1.ps1 -Rollback `"$backup`"" 'Yellow'
Say "Оношилгоо (зөвхөн уншина): cd `"$AgentDir`"; node tools\guard-diagnose.js 5" 'Yellow'
