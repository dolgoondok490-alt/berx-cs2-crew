# 08 — Synchronization шалгах: сайт → agent → MySQL (нэг тоглогчийн SteamID64-аар). Зөвхөн уншина.
param([Parameter(Mandatory = $true)][ValidatePattern('^7656119\d{10}$')][string]$SteamId, [string]$Site = 'https://berx-cs2-crew.vercel.app')
. "$PSScriptRoot\common.ps1"
$sk = Read-EnvFile (Join-Path $BERX.AgentDir '.env.skins')
Step 'Тохиргоо'
if ($sk.SKINS_SYNC_ENABLED -eq '1') { Ok 'agent\.env.skins: SKINS_SYNC_ENABLED=1' } else { Warn 'agent\.env.skins: SKINS_SYNC_ENABLED=0 (синк унтраалттай)' }
try { $h = Invoke-RestMethod "$Site/api/health"; Info "Сайт features: skins=$($h.features.skins) skinsSync=$($h.features.skinsSync)" } catch { Warn "Сайт хүрэгдсэнгүй: $($_.Exception.Message)" }
Step "MySQL мөрүүд ($SteamId)"
$db = $sk.WP_DB_NAME; $u = $sk.WP_DB_USER; $p = $sk.WP_DB_PASSWORD
foreach ($t in 'wp_player_skins', 'wp_player_knife', 'wp_player_gloves', 'wp_player_agents') {
  $n = Invoke-Mysql $u $p "SELECT COUNT(*) FROM $t WHERE steamid = '$SteamId'" $db
  Info "$t : $n мөр"
}
Invoke-Mysql $u $p "SELECT weapon_team, weapon_defindex, weapon_paint_id, ROUND(weapon_wear,4), weapon_seed, weapon_stattrak FROM wp_player_skins WHERE steamid = '$SteamId' ORDER BY weapon_team, weapon_defindex" $db | ForEach-Object { Info $_ }
Step 'Agent log (сүүлийн Skins мөрүүд)'
$log = Join-Path $env:LOCALAPPDATA 'BERX ARENA Launcher\logs\agent.log'
if (Test-Path $log) { Get-Content $log -Tail 400 -Encoding UTF8 | Where-Object { $_ -match 'Skins' } | Select-Object -Last 12 | ForEach-Object { Info $_ } } else { Info 'Launcher-ийн agent.log олдсонгүй (agent-ийг өөр аргаар асаасан байж магадгүй)' }
Info 'Сайтын SKIN INVENTORY хуудсанд «WeaponPaints DB-д бичигдсэн ✓» / «Тоглоомд хэрэгжсэн ✓» гэж харагдах ёстой.'
