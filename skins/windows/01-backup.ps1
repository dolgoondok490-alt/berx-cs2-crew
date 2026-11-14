# 01 — Нөөцлөх: CounterStrikeSharp (configs, plugins, shared, gamedata), Metamod, gameinfo.gi, cfg, agent тохиргоо
#      Юу ч өөрчлөхгүй, зөвхөн хуулна → C:\berx-skins\backups\<огноо>.zip
. "$PSScriptRoot\common.ps1"
$stamp = Get-Date -Format 'yyyyMMdd-HHmmss'
$tmp = Join-Path $BERX.BackupDir "tmp-$stamp"
Protect-Dir $BERX.BackupDir
New-Item -ItemType Directory -Force $tmp | Out-Null
Step "Нөөцлөж байна → $($BERX.BackupDir)\$stamp.zip"
$items = @(
  @{ Src = (Join-Path $BERX.CssDir 'configs');  Dst = 'csgo\addons\counterstrikesharp\configs' },
  @{ Src = (Join-Path $BERX.CssDir 'plugins');  Dst = 'csgo\addons\counterstrikesharp\plugins' },
  @{ Src = (Join-Path $BERX.CssDir 'shared');   Dst = 'csgo\addons\counterstrikesharp\shared' },
  @{ Src = (Join-Path $BERX.CssDir 'gamedata'); Dst = 'csgo\addons\counterstrikesharp\gamedata' },
  @{ Src = (Join-Path $BERX.CsgoDir 'addons\metamod'); Dst = 'csgo\addons\metamod' },
  @{ Src = (Join-Path $BERX.CsgoDir 'gameinfo.gi'); Dst = 'csgo\gameinfo.gi' },
  @{ Src = (Join-Path $BERX.CsgoDir 'cfg\server.cfg'); Dst = 'csgo\cfg\server.cfg' },
  @{ Src = (Join-Path $BERX.AgentDir '.env.skins'); Dst = 'agent\.env.skins' }
)
foreach ($i in $items) {
  if (-not (Test-Path $i.Src)) { Info "алга: $($i.Src)"; continue }
  $d = Join-Path $tmp $i.Dst; New-Item -ItemType Directory -Force (Split-Path $d) | Out-Null
  Copy-Item $i.Src $d -Recurse -Force; Ok $i.Src
}
# agent\.env-ийг нөөцөнд хуулахгүй (нууц үг агуулдаг) — өөрчлөгддөггүй тул шаардлагагүй
Compress-Archive -Path (Join-Path $tmp '*') -DestinationPath (Join-Path $BERX.BackupDir "$stamp.zip") -Force
Remove-Item $tmp -Recurse -Force
Ok "Нөөц: $($BERX.BackupDir)\$stamp.zip"
$stamp
