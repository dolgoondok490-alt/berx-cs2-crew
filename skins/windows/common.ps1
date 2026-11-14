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
  # Staging хийх archive бүр. Expect = addons\counterstrikesharp\-ээс доош ЗААВАЛ байх файлууд (03, 05, тест шалгана)
  Archives = @(
    @{ Name = 'WeaponPaints';   Repo = 'Nereziel/cs2-WeaponPaints';    Tag = 'build-472'; Asset = '^WeaponPaints\.zip$'
       Expect = @('plugins\WeaponPaints\WeaponPaints.dll', 'gamedata\weaponpaints.json') },
    @{ Name = 'MenuManagerCS2'; Repo = 'NickFox007/MenuManagerCS2';    Tag = '1.4.1'; Asset = '\.zip$'
       Expect = @('plugins\MenuManagerCore\MenuManagerCore.dll', 'shared\MenuManagerApi\MenuManagerApi.dll') },
    @{ Name = 'PlayerSettingsCS2'; Repo = 'NickFox007/PlayerSettingsCS2'; Tag = '0.9.4'; Asset = '\.zip$'
       Expect = @('plugins\PlayerSettings\PlayerSettings.dll', 'shared\PlayerSettingsApi\PlayerSettingsApi.dll') },
    @{ Name = 'AnyBaseLibCS2';  Repo = 'NickFox007/AnyBaseLibCS2';     Tag = '0.9.4'; Asset = '\.zip$'
       Expect = @('shared\AnyBaseLib\AnyBaseLib.dll') }
  )
  MinCssVersion = [version]'1.0.378'
}
# Хэрэглэгч өөрчлөх бол: $env:BERX_CS2_DIR, $env:BERX_AGENT_DIR
if ($env:BERX_CS2_DIR)   { $BERX.Cs2Dir = $env:BERX_CS2_DIR }
if ($env:BERX_AGENT_DIR) { $BERX.AgentDir = $env:BERX_AGENT_DIR }
if ($env:BERX_WORK_DIR)  { $BERX.WorkDir = $env:BERX_WORK_DIR }      # тест/CI-д: production C:\berx-skins-д хүрэхгүй
$BERX.CsgoDir    = Join-Path $BERX.Cs2Dir 'game\csgo'
$BERX.CssDir     = Join-Path $BERX.CsgoDir 'addons\counterstrikesharp'
$BERX.StagingDir = Join-Path $BERX.WorkDir 'staging'
$BERX.BackupDir  = Join-Path $BERX.WorkDir 'backups'
$BERX.SecretsDir = Join-Path $BERX.WorkDir 'secrets'
$BERX.Manifest   = Join-Path $BERX.WorkDir 'install-manifest.json'
$BERX.ToolsDir   = Join-Path $PSScriptRoot '..\tools'
# Payload нь game\csgo-тэй ЯГ ижил бүтэцтэй: payload\addons\counterstrikesharp\{plugins,shared,gamedata,configs}\...
$BERX.CssRel      = 'addons\counterstrikesharp'
$BERX.CssRoots    = @('plugins', 'shared', 'gamedata', 'configs')
$BERX.ProtectedRe = '^addons\\(metamod|counterstrikesharp\\(api|bin|dotnet)|counterstrikesharp\\plugins\\MatchZy)'
$BERX.RequiredStaged = @($BERX.Archives | ForEach-Object { $_.Expect } | ForEach-Object { Join-Path $BERX.CssRel $_ })

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
function New-DbCredential([string]$User, [string]$Plain) {
  $ss = New-Object System.Security.SecureString
  foreach ($ch in $Plain.ToCharArray()) { $ss.AppendChar($ch) }
  $ss.MakeReadOnly()
  New-Object System.Management.Automation.PSCredential($User, $ss)
}
function Invoke-Mysql([System.Management.Automation.PSCredential]$Credential, [string]$Sql, [string]$Database = '') {
  $User = $Credential.UserName; $Password = $Credential.GetNetworkCredential().Password
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

# ======================================================================================================
# Staging (03) / суулгалт (05)-ийн нийтлэг логик. Copy-Item-ийн "хавтас байхгүй бол нэрийг нь сольж хуулна"
# зан төлөвөөс (addons\counterstrikesharp → addons болж алга болсон алдаа) зайлсхийхийн тулд файл бүрийг
# тодорхой зорилтот зам руу ганц ганцаар хуулна. Бүх зам game\csgo-оос эхэлсэн харьцангуй зам.
# ======================================================================================================

# $Root доторх $Full файлын харьцангуй зам (Windows PowerShell 5.1-д GetRelativePath байхгүй)
function Get-RelPath([string]$Root, [string]$Full) {
  $r = [IO.Path]::GetFullPath($Root).TrimEnd('\', '/') + '\'
  $f = [IO.Path]::GetFullPath($Full)
  if (-not $f.StartsWith($r, [StringComparison]::OrdinalIgnoreCase)) { throw "Зам '$Root'-ийн гадна байна: $Full" }
  return $f.Substring($r.Length)
}

# GitHub release-ээс asset татна (зөвхөн api.github.com-д GITHUB_TOKEN илгээнэ — CI rate limit-д)
function Get-PluginRelease([string]$Repo, [string]$Tag, [string]$AssetPattern, [string]$DownloadDir) {
  $ProgressPreference = 'SilentlyContinue'
  $hdr = @{ 'User-Agent' = 'berx-skins-installer'; 'Accept' = 'application/vnd.github+json' }
  $api = @{} + $hdr; if ($env:GITHUB_TOKEN) { $api['Authorization'] = "Bearer $($env:GITHUB_TOKEN)" }
  $rel = Invoke-RestMethod "https://api.github.com/repos/$Repo/releases/tags/$Tag" -Headers $api
  $assets = @($rel.assets | Where-Object { $_.name -match $AssetPattern })
  if (-not $assets) { throw "$Repo $Tag : '$AssetPattern' asset олдсонгүй (байгаа: $($rel.assets.name -join ', '))" }
  $a = $assets[0]
  New-Item -ItemType Directory -Force $DownloadDir | Out-Null
  $file = Join-Path $DownloadDir ("{0}-{1}-{2}" -f ($Repo -replace '^.*/', ''), $Tag, $a.name)
  Invoke-WebRequest $a.browser_download_url -OutFile $file -Headers $hdr -UseBasicParsing
  $sha = (Get-FileHash -LiteralPath $file -Algorithm SHA256).Hash
  Ok "$Repo $Tag → $($a.name) ($([math]::Round($a.size/1KB)) KB) sha256 $sha"
  Info "release огноо: $($rel.published_at)  prerelease: $($rel.prerelease)"
  return $file
}

# Задалсан archive дотор CounterStrikeSharp-ийн үндэс хавтсыг олно (хамгийн гүехэн нь):
#   1) ...\addons\counterstrikesharp\  эсвэл ...\counterstrikesharp\
#   2) plugins / shared / gamedata / configs-ийг ШУУД агуулсан хавтас (тэр нь counterstrikesharp-ийн оронд)
function Find-CssRoot([string]$Dir) {
  $dirs = @(Get-Item -LiteralPath $Dir) + @(Get-ChildItem -LiteralPath $Dir -Recurse -Directory)
  $byDepth = { ($_.FullName.TrimEnd('\') -split '\\').Count }
  $hit = @($dirs | Where-Object { $_.Name -eq 'counterstrikesharp' } | Sort-Object $byDepth)
  if ($hit) { return $hit[0].FullName }
  $hit = @($dirs | Where-Object {
      $d = $_.FullName
      @($BERX.CssRoots | Where-Object { Test-Path -LiteralPath (Join-Path $d $_) -PathType Container }).Count -gt 0
    } | Sort-Object $byDepth)
  if ($hit) { return $hit[0].FullName }
  return $null
}

# Нэг plugin zip-ийг payload руу: addons\counterstrikesharp\<plugins|shared|gamedata|configs>\... бүтцээр.
# CSS core (api/bin/dotnet), Metamod, бусад зүйлсийг ХЭЗЭЭ Ч staging хийхгүй (алгасаж, жагсааж хэвлэнэ).
# Өөр archive-аас ирсэн ижил замтай, ӨӨР агуулгатай файл байвал зогсоно (аль нь зөв гэдгийг таахгүй).
function Add-ZipToPayload([string]$Zip, [string]$Payload, [string]$ExtractDir, [string[]]$Expect = @()) {
  $leaf = Split-Path $Zip -Leaf
  if (Test-Path -LiteralPath $ExtractDir) { Remove-Item -LiteralPath $ExtractDir -Recurse -Force }
  New-Item -ItemType Directory -Force $ExtractDir | Out-Null
  Expand-Archive -LiteralPath $Zip -DestinationPath $ExtractDir -Force
  $root = Find-CssRoot $ExtractDir
  if (-not $root) { throw "${leaf}: addons\counterstrikesharp / plugins / shared бүтэц танигдсангүй — гараар шалгана уу ($ExtractDir)" }
  $rootRel = '.'; try { $rootRel = Get-RelPath $ExtractDir $root } catch { $rootRel = '.' }
  $staged = New-Object System.Collections.Generic.List[string]; $ignored = New-Object System.Collections.Generic.List[string]
  foreach ($f in Get-ChildItem -LiteralPath $ExtractDir -Recurse -File) {
    $inArchive = Get-RelPath $ExtractDir $f.FullName
    $rel = $null; try { $rel = Get-RelPath $root $f.FullName } catch { $rel = $null }
    if (-not $rel -or ($BERX.CssRoots -notcontains ($rel -split '\\')[0])) { $ignored.Add($inArchive); continue }
    $out = Join-Path $BERX.CssRel $rel
    if ($out -match $BERX.ProtectedRe) { $ignored.Add($inArchive); continue }
    $dest = Join-Path $Payload $out
    if (Test-Path -LiteralPath $dest) {
      if ((Get-FileHash -LiteralPath $dest).Hash -ne (Get-FileHash -LiteralPath $f.FullName).Hash) {
        throw "${leaf}: '$out' өөр archive-аас өөр агуулгатайгаар аль хэдийн staging-д орсон — хувилбарын зөрчил"
      }
    } else {
      New-Item -ItemType Directory -Force (Split-Path $dest -Parent) | Out-Null
      Copy-Item -LiteralPath $f.FullName -Destination $dest
    }
    $staged.Add($out)
  }
  $missing = @($Expect | Where-Object { $staged -notcontains (Join-Path $BERX.CssRel $_) })
  if ($missing) { throw "${leaf}: хүлээгдэж буй файл archive-д алга: $($missing -join ', ') (archive доторх үндэс: $rootRel)" }
  return [pscustomobject]@{ Zip = $Zip; Root = $rootRel; Staged = @($staged); Ignored = @($ignored) }
}

# Staging бүтцийг шалгана. Асуудлын жагсаалт буцаана (хоосон = зөв). 03 болон 05 хоёулаа ашиглана.
function Test-StagedPayload([string]$Payload, [string[]]$Required = $BERX.RequiredStaged) {
  $problems = @()
  if (-not (Test-Path -LiteralPath $Payload)) { return @("payload хавтас алга: $Payload") }
  foreach ($r in $Required) { if (-not (Test-Path -LiteralPath (Join-Path $Payload $r) -PathType Leaf)) { $problems += "алга: $r" } }
  $allowed = '^addons\\counterstrikesharp\\(' + ($BERX.CssRoots -join '|') + ')\\'
  foreach ($f in Get-ChildItem -LiteralPath $Payload -Recurse -File) {
    $rel = Get-RelPath $Payload $f.FullName
    if ($rel -match $BERX.ProtectedRe) { $problems += "хамгаалагдсан зам: $rel" }
    elseif ($rel -notmatch $allowed) { $problems += "буруу байрлал (addons\counterstrikesharp\{plugins,shared,gamedata,configs} биш): $rel" }
  }
  return $problems
}

# Payload → game\csgo зорилтот зам ба төлөв: new / same / overwrite (+ хамгаалагдсан эсэх)
function Get-StagePlan([string]$Payload, [string]$CsgoDir) {
  foreach ($f in Get-ChildItem -LiteralPath $Payload -Recurse -File) {
    $rel = Get-RelPath $Payload $f.FullName
    $target = Join-Path $CsgoDir $rel
    $state = 'new'
    if (Test-Path -LiteralPath $target) { $state = if ((Get-FileHash -LiteralPath $target).Hash -eq (Get-FileHash -LiteralPath $f.FullName).Hash) { 'same' } else { 'overwrite' } }
    [pscustomobject]@{ path = $rel; source = $f.FullName; target = $target; state = $state; protected = [bool]($rel -match $BERX.ProtectedRe) }
  }
}

# 05: ЗӨВХӨН шинэ файлуудыг хуулна. Хамгаалагдсан зам эсвэл дарж бичих шаардлагатай бол юу ч хуулахгүйгээр throw.
function Install-StagedPayload([string]$Payload, [string]$CsgoDir) {
  $problems = @(Test-StagedPayload $Payload)
  if ($problems) { throw "Staging бүтэц буруу — 03-stage-plugin.ps1-ийг дахин ажиллуулна уу:`n  $($problems -join "`n  ")" }
  $plan = @(Get-StagePlan $Payload $CsgoDir)
  $prot = @($plan | Where-Object protected); if ($prot) { throw "Хамгаалагдсан зам: $($prot.path -join ', ')" }
  $over = @($plan | Where-Object state -eq 'overwrite'); if ($over) { throw "Одоо байгаа файлыг дарж бичихгүй: $($over.path -join ', ')" }
  $added = @()
  foreach ($p in @($plan | Where-Object state -eq 'new')) {
    New-Item -ItemType Directory -Force (Split-Path $p.target -Parent) | Out-Null
    Copy-Item -LiteralPath $p.source -Destination $p.target
    $added += $p.path
  }
  return [pscustomobject]@{ Added = $added; Skipped = @($plan | Where-Object state -eq 'same' | ForEach-Object path) }
}
