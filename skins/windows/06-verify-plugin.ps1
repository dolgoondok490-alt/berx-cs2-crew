# 06 — Plugin ачаалагдсан эсэхийг RCON-оор шалгах (зөвхөн уншина: css_plugins list, meta list, wp_refresh usage)
. "$PSScriptRoot\common.ps1"
if (-not (Get-ServerProcess)) { Bad 'CS2 сервер ажиллаагүй байна (launcher-ээр START)'; exit 1 }
$rcon = Join-Path $BERX.ToolsDir 'rcon.js'
Step 'css_plugins list'
$out = & node $rcon $BERX.AgentDir 'css_plugins list'; $out | ForEach-Object { Info $_ }
foreach ($p in 'WeaponPaints', 'MatchZy') { if ($out -match $p) { Ok "$p ачаалагдсан" } else { Bad "$p ачаалагдаагүй" } }
foreach ($p in 'MenuManager', 'PlayerSettings', 'AnyBaseLib') { if ($out -match $p) { Ok "$p ачаалагдсан" } else { Warn "$p жагсаалтад алга (shared library байж болно — WeaponPaints ачаалагдсан бол OK)" } }
Step 'meta list'
& node $rcon $BERX.AgentDir 'meta list' | ForEach-Object { Info $_ }
Step 'wp_refresh (console команд бүртгэгдсэн эсэх)'
$w = & node $rcon $BERX.AgentDir 'wp_refresh'
if ($w -match 'Usage: wp_refresh') { Ok 'wp_refresh бэлэн (CommandWpEnabled=true)' } elseif ($w -match 'Unknown command') { Bad 'wp_refresh алга — WeaponPaints ачаалагдаагүй' } else { Warn "Хариу: $w (SkinEnabled/CommandWpEnabled false эсвэл MySQL холбогдоогүй байж магадгүй)" }
Info 'Серверийн консол/log-д "[WeaponPaints]" алдаа (MySQL, gamedata) байгаа эсэхийг мөн харна уу.'
