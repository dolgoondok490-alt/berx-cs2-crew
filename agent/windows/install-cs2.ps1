# =========================================================
#  BERX ARENA — CS2 Dedicated Server суулгагч (Windows 10/11)
#  PowerShell-ийг "Run as Administrator"-аар нээгээд:
#    Set-ExecutionPolicy -Scope Process Bypass
#    .\install-cs2.ps1 -Dir C:\cs2-server
#  Хийх зүйлс:
#    1) SteamCMD татна  2) CS2 сервер (app 730, ~35GB) суулгана
#    3) Metamod:Source 2.x, CounterStrikeSharp, MatchZy татаж суулгана
#    4) gameinfo.gi-д Metamod нэмнэ  5) server.cfg үүсгэнэ (RCON нууц үг санамсаргүй)
#    6) Windows Firewall-д 27015 порт нээнэ
#  Дахин ажиллуулахад CS2-г шинэчилнэ (тоглоомын update гарсны дараа заавал).
# =========================================================
param(
  [string]$Dir = "C:\cs2-server",
  [string]$Hostname = "BERX ARENA",
  [string]$ServerPassword = "",
  [switch]$SkipPlugins
)
$ErrorActionPreference = "Stop"
[Net.ServicePointManager]::SecurityProtocol = [Net.SecurityProtocolType]::Tls12
function Step($t) { Write-Host "`n==> $t" -ForegroundColor Yellow }
function Ok($t)   { Write-Host "    OK  $t" -ForegroundColor Green }
function Warn($t) { Write-Host "    !!  $t" -ForegroundColor Red }

$steamcmd = Join-Path $Dir "steamcmd"
$csgo = Join-Path $Dir "game\csgo"
New-Item -ItemType Directory -Force -Path $Dir, $steamcmd | Out-Null

# ---------- 1) SteamCMD ----------
Step "SteamCMD"
if (-not (Test-Path "$steamcmd\steamcmd.exe")) {
  Invoke-WebRequest "https://steamcdn-a.akamaihd.net/client/installer/steamcmd.zip" -OutFile "$env:TEMP\steamcmd.zip"
  Expand-Archive "$env:TEMP\steamcmd.zip" -DestinationPath $steamcmd -Force
}
Ok "$steamcmd\steamcmd.exe"

# ---------- 2) CS2 Dedicated Server ----------
Step "CS2 Dedicated Server татаж байна (анх удаа ~35GB, удаан)..."
& "$steamcmd\steamcmd.exe" +force_install_dir "$Dir" +login anonymous +app_update 730 validate +quit
if (-not (Test-Path "$Dir\game\bin\win64\cs2.exe")) { Warn "cs2.exe олдсонгүй. SteamCMD-г дахин ажиллуулна уу."; exit 1 }
Ok "CS2 суулгалаа: $Dir"

# ---------- 3) Plugins ----------
function Get-GhAsset($repo, $pattern, $exclude) {
  $rel = Invoke-RestMethod "https://api.github.com/repos/$repo/releases/latest" -Headers @{ "User-Agent" = "berx-installer" }
  $a = $rel.assets | Where-Object { $_.name -match $pattern -and (-not $exclude -or $_.name -notmatch $exclude) } | Select-Object -First 1
  if (-not $a) { throw "$repo-ээс тохирох файл олдсонгүй" }
  return $a
}
function Install-Zip($url, $name) {
  $zip = Join-Path $env:TEMP $name
  Invoke-WebRequest $url -OutFile $zip
  $tmp = Join-Path $env:TEMP ("berx_" + [IO.Path]::GetFileNameWithoutExtension($name))
  if (Test-Path $tmp) { Remove-Item $tmp -Recurse -Force }
  Expand-Archive $zip -DestinationPath $tmp -Force
  # zip дотор "addons" эсвэл "game/csgo/addons" байж болно
  $root = Get-ChildItem $tmp -Recurse -Directory -Filter "addons" | Select-Object -First 1
  if (-not $root) { throw "$name дотор addons хавтас алга" }
  Copy-Item (Join-Path $root.Parent.FullName "*") $csgo -Recurse -Force
}

if (-not $SkipPlugins) {
  Step "Metamod:Source 2.x"
  try {
    $mm = (Invoke-WebRequest "https://mms.alliedmods.net/mmsdrop/2.0/mmsource-latest-windows" -UseBasicParsing).Content.Trim()
    Install-Zip "https://mms.alliedmods.net/mmsdrop/2.0/$mm" $mm
    Ok $mm
  } catch { Warn "Metamod автоматаар татагдсангүй: https://www.sourcemm.net/downloads.php?branch=dev -> Windows zip -> $csgo руу задла" }

  Step "CounterStrikeSharp (with runtime)"
  try {
    $a = Get-GhAsset "roflmuffin/CounterStrikeSharp" "with-runtime.*windows.*\.zip$" $null
    Install-Zip $a.browser_download_url $a.name; Ok $a.name
  } catch { Warn "CounterStrikeSharp: https://github.com/roflmuffin/CounterStrikeSharp/releases -> with-runtime windows zip -> $csgo руу задла" }

  Step "MatchZy"
  try {
    $a = Get-GhAsset "shobhit-pathak/MatchZy" "^MatchZy-.*\.zip$" "with-cssharp"
    Install-Zip $a.browser_download_url $a.name; Ok $a.name
  } catch { Warn "MatchZy: https://github.com/shobhit-pathak/MatchZy/releases -> MatchZy-x.y.z.zip -> $csgo руу задла" }

  # ---------- 4) gameinfo.gi ----------
  Step "gameinfo.gi -> Metamod"
  $gi = Join-Path $csgo "gameinfo.gi"
  $txt = Get-Content $gi -Raw
  if ($txt -notmatch "csgo/addons/metamod") {
    Copy-Item $gi "$gi.bak" -Force
    $txt = $txt -replace "(\s*)(Game_LowViolence\s+csgo_lv[^\r\n]*)", "`$1`$2`$1Game`tcsgo/addons/metamod"
    Set-Content $gi $txt -NoNewline
    Ok "Нэмлээ (нөөц: gameinfo.gi.bak). CS2 update бүрийн дараа энэ скриптийг дахин ажиллуул."
  } else { Ok "Аль хэдийн нэмэгдсэн" }
}

# ---------- 5) server.cfg ----------
Step "server.cfg"
$cfg = Join-Path $csgo "cfg\server.cfg"
$rcon = -join ((48..57) + (65..90) + (97..122) | Get-Random -Count 24 | ForEach-Object { [char]$_ })
if (Test-Path $cfg) {
  $old = Select-String -Path $cfg -Pattern 'rcon_password\s+"([^"]+)"' | Select-Object -First 1
  if ($old) { $rcon = $old.Matches[0].Groups[1].Value }
}
$tpl = Get-Content (Join-Path $PSScriptRoot "server.cfg") -Raw
$tpl = $tpl.Replace("__HOSTNAME__", $Hostname).Replace("__RCON__", $rcon).Replace("__PASSWORD__", $ServerPassword)
Set-Content $cfg $tpl
Ok "$cfg"

# ---------- 6) Firewall ----------
Step "Windows Firewall 27015 (UDP+TCP)"
try {
  if (-not (Get-NetFirewallRule -DisplayName "BERX CS2 UDP" -ErrorAction SilentlyContinue)) {
    New-NetFirewallRule -DisplayName "BERX CS2 UDP" -Direction Inbound -Protocol UDP -LocalPort 27015 -Action Allow | Out-Null
    New-NetFirewallRule -DisplayName "BERX CS2 TCP" -Direction Inbound -Protocol TCP -LocalPort 27015 -Action Allow | Out-Null
  }
  Ok "Нээлээ"
} catch { Warn "Firewall дүрэм нэмэхэд Administrator эрх хэрэгтэй" }

Write-Host "`n=========================================================" -ForegroundColor Cyan
Write-Host " Бэлэн! CS2_DIR=$Dir" -ForegroundColor Cyan
Write-Host " RCON_PASSWORD=$rcon   <- agent\.env-д хуулна (хэнд ч бүү үзүүл)" -ForegroundColor Cyan
Write-Host " Дараагийн алхам: start-cs2.bat, дараа нь start-agent.bat" -ForegroundColor Cyan
Write-Host "=========================================================" -ForegroundColor Cyan
