# BERX SKIN INVENTORY — нийтлэг тохиргоо, туслах функцууд (бусад скрипт dot-source хийнэ)
$ErrorActionPreference = 'Stop'
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12

$BERX = [ordered]@{
  Cs2Dir       = 'C:\cs2-server\steamcmd\steamapps\common\Counter-Strike Global Offensive'
  AgentDir     = Join-Path $env:USERPROFILE 'Downloads\berx-cs2-crew-main\agent'
  WorkDir      = 'C:\berx-skins'                       # staging, backup, manifest (game хавтаснаас тусдаа)
  DbName       = 'berx_weaponpaints'
  DbPluginUser = 'wp_plugin'                           # WeaponPaints plugin (хүснэгт үүсгэх эрхтэй)
  DbAgentUser  = 'berx_agent'                          # BERX Agent (зөвхөн SELECT/INSERT/UPDATE/DELETE)
  # Шалгагдсан хувилбарууд (skins/COMPATIBILITY.md)
  WeaponPaintsTag = 'build-472'
  Deps = @(
    @{ Repo = 'NickFox007/MenuManagerCS2';    Tag = '1.4.1' },
    @{ Repo = 'NickFox007/PlayerSettingsCS2'; Tag = '0.9.4' },
    @{ Repo = 'NickFox007/AnyBaseLibCS2';     Tag = '0.9.4' }
  )
  MinCssVersion = [version]'1.0.378'
}
# Хэрэглэгч өөрчлөх бол: $env:BERX_CS2_DIR, $env:BERX_AGENT_DIR
if ($env:BERX_CS2_DIR)   { $BERX.Cs2Dir = $env:BERX_CS2_DIR }
if ($env:BERX_AGENT_DIR) { $BERX.AgentDir = $env:BERX_AGENT_DIR }
$BERX.CsgoDir    = Join-Path $BERX.Cs2Dir 'game\csgo'
$BERX.CssDir     = Join-Path $BERX.CsgoDir 'addons\counterstrikesharp'
$BERX.StagingDir = Join-Path $BERX.WorkDir 'staging'
$BERX.BackupDir  = Join-Path $BERX.WorkDir 'backups'
$BERX.SecretsDir = Join-Path $BERX.WorkDir 'secrets'
$BERX.Manifest   = Join-Path $BERX.WorkDir 'install-manifest.json'
$BERX.ToolsDir   = Join-Path $PSScriptRoot '..\tools'

function Step($t) { Write-Host "`n==> $t" -ForegroundColor Yellow }
function Ok($t)   { Write-Host "    [OK]   $t" -ForegroundColor Green }
function Warn($t) { Write-Host "    [WARN] $t" -ForegroundColor DarkYellow }
function Bad($t)  { Write-Host "    [FAIL] $t" -ForegroundColor Red }
function Info($t) { Write-Host "           $t" -ForegroundColor Gray }

function Test-Admin { ([Security.Principal.WindowsPrincipal][Security.Principal.WindowsIdentity]::GetCurrent()).IsInRole([Security.Principal.WindowsBuiltInRole]::Administrator) }

# Тохиргооны файлыг ӨӨРЧЛӨХГҮЙ, зөвхөн уншина
function Read-EnvFile($path) {
  $h = @{}
  if (Test-Path $path) {
    foreach ($line in Get-Content $path -Encoding UTF8) {
      if ($line -match '^\s*#') { continue }
      if ($line -match '^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$') { $h[$Matches[1]] = $Matches[2].Trim('"', "'") }
    }
  }
  return $h
}

# Ажиллаж буй CS2 dedicated server (зөвхөн тохиргооны замаас) — хэрэглэгчийн тоглоомыг тоолохгүй
function Get-ServerProcess {
  $exe = (Join-Path $BERX.Cs2Dir 'game\bin\win64\cs2.exe').ToLower()
  Get-CimInstance Win32_Process -Filter "Name = 'cs2.exe'" | Where-Object { $_.ExecutablePath -and $_.ExecutablePath.ToLower() -eq $exe }
}

function Find-MysqlClient {
  $c = Get-Command mysql.exe -ErrorAction SilentlyContinue
  if ($c) { return $c.Source }
  foreach ($root in @($env:ProgramFiles, ${env:ProgramFiles(x86)})) {
    if (-not $root) { continue }
    $hit = Get-ChildItem $root -Directory -ErrorAction SilentlyContinue | Where-Object { $_.Name -match '^(MariaDB|MySQL)' } |
      ForEach-Object { Get-ChildItem $_.FullName -Recurse -Filter mysql.exe -ErrorAction SilentlyContinue } | Select-Object -First 1
    if ($hit) { return $hit.FullName }
  }
  return $null
}

# Нууц үгийг командын мөрөнд гаргахгүйн тулд түр defaults файл (зөвхөн одоогийн хэрэглэгч уншина)
function Invoke-Mysql([string]$User, [string]$Password, [string]$Sql, [string]$Database = '') {
  $client = Find-MysqlClient
  if (-not $client) { throw 'mysql.exe олдсонгүй (MariaDB/MySQL client)' }
  $cnf = Join-Path $env:TEMP ("berx-" + [guid]::NewGuid().ToString('N') + '.cnf')
  $pw = $Password.Replace('\', '\\').Replace('"', '\"')
  Set-Content $cnf "[client]`nuser=$User`npassword=`"$pw`"`nhost=127.0.0.1`nport=3306`n" -Encoding ASCII
  icacls $cnf /inheritance:r /grant:r "$($env:USERNAME):(R,W,D)" | Out-Null
  try {
    $margs = @("--defaults-extra-file=$cnf", '--batch', '--skip-column-names', '-e', $Sql)
    if ($Database) { $margs += $Database }
    $out = & $client @margs 2>&1
    if ($LASTEXITCODE -ne 0) { throw ($out | Out-String) }
    return $out
  } finally { Remove-Item $cnf -Force -ErrorAction SilentlyContinue }
}

function New-Secret([int]$len = 28) {
  $chars = [char[]]'abcdefghijkmnopqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  $bytes = New-Object byte[] $len; [Security.Cryptography.RandomNumberGenerator]::Create().GetBytes($bytes)
  -join ($bytes | ForEach-Object { $chars[$_ % $chars.Length] })
}

function Confirm-Typed([string]$word, [string]$msg) {
  Write-Host "`n$msg" -ForegroundColor Red
  $ans = Read-Host "Үргэлжлүүлэх бол '$word' гэж бичнэ үү"
  if ($ans -ne $word) { Write-Host 'Цуцлагдлаа. Юу ч өөрчлөгдсөнгүй.' -ForegroundColor Yellow; exit 1 }
}

# C:\berx-skins доторх нөөц / нууц хавтсыг зөвхөн одоогийн хэрэглэгч + Administrators уншина
function Protect-Dir($dir) {
  New-Item -ItemType Directory -Force $dir | Out-Null
  icacls $dir /inheritance:r /grant:r "$($env:USERNAME):(OI)(CI)F" "*S-1-5-32-544:(OI)(CI)F" "*S-1-5-18:(OI)(CI)F" | Out-Null
}
