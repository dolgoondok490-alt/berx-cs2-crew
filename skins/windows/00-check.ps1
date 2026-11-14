# 00 — Зөвхөн ШАЛГАНА (юу ч өөрчлөхгүй): CS2, Metamod, CounterStrikeSharp, MatchZy, WeaponPaints, DB, Node, agent
. "$PSScriptRoot\common.ps1"
$problems = 0

Step 'CS2 dedicated server'
$inf = Join-Path $BERX.CsgoDir 'steam.inf'
if (Test-Path $inf) { $pv = (Select-String $inf -Pattern '^PatchVersion=(.+)$').Matches.Groups[1].Value; Ok "CS2 PatchVersion $pv ($($BERX.Cs2Dir))" } else { Bad "steam.inf олдсонгүй: $inf"; $problems++ }
$srv = Get-ServerProcess
if ($srv) { Info "CS2 сервер ажиллаж байна (PID $($srv.ProcessId)) — суулгалт хийхээс өмнө owner өөрөө зогсооно" } else { Info 'CS2 сервер одоогоор ажиллаагүй' }

Step 'Metamod:Source'
$mm = Get-ChildItem (Join-Path $BERX.CsgoDir 'addons\metamod\bin') -Recurse -Filter 'metamod.2.cs2.dll' -ErrorAction SilentlyContinue | Select-Object -First 1
if ($mm) { Ok "Metamod $($mm.VersionInfo.ProductVersion)" } else { Bad 'Metamod олдсонгүй'; $problems++ }
$gi = Join-Path $BERX.CsgoDir 'gameinfo.gi'
if ((Test-Path $gi) -and (Select-String $gi -Pattern 'csgo/addons/metamod' -Quiet)) { Ok 'gameinfo.gi → Metamod мөр бий' } else { Warn 'gameinfo.gi-д Metamod мөр алга (CS2 update дараа install-cs2.ps1 дахин ажиллуулна)' }

Step 'CounterStrikeSharp'
$api = Join-Path $BERX.CssDir 'api\CounterStrikeSharp.API.dll'
if (Test-Path $api) {
  $v = (Get-Item $api).VersionInfo
  $num = [regex]::Match("$($v.ProductVersion) $($v.FileVersion)", '1\.0\.(\d+)').Value
  if ($num) { if ([version]$num -ge $BERX.MinCssVersion) { Ok "CounterStrikeSharp $num (WeaponPaints build-472-д $($BERX.MinCssVersion)+ хэрэгтэй)" } else { Bad "CounterStrikeSharp $num хуучин (>= $($BERX.MinCssVersion))"; $problems++ } }
  else { Warn "CounterStrikeSharp хувилбарыг уншиж чадсангүй ($($v.ProductVersion)). Серверийн консолд 'css_plugins list' / 'meta list'" }
} else { Bad "CounterStrikeSharp олдсонгүй: $api"; $problems++ }
$rt = Get-ChildItem (Join-Path $BERX.CssDir 'dotnet\shared\Microsoft.NETCore.App') -Directory -ErrorAction SilentlyContinue | Sort-Object Name | Select-Object -Last 1
if ($rt) { if ($rt.Name -like '10.*') { Ok ".NET runtime $($rt.Name) (WeaponPaints net10.0)" } else { Bad ".NET runtime $($rt.Name) — WeaponPaints build-472 нь .NET 10 шаардана"; $problems++ } } else { Warn 'CSS-ийн .NET runtime хавтас олдсонгүй (with-runtime build мөн үү?)' }
$core = Join-Path $BERX.CssDir 'configs\core.json'
if (Test-Path $core) {
  $fg = (Get-Content $core -Raw | ConvertFrom-Json).FollowCS2ServerGuidelines
  if ($fg -eq $false) { Warn 'FollowCS2ServerGuidelines = false (Valve-ийн хамгаалалт унтраалттай!)' } else { Ok "FollowCS2ServerGuidelines = $fg (хамгаалалт асаалттай — WeaponPaints бүрэн ажиллахгүй)" }
} else { Warn "core.json олдсонгүй: $core" }

Step 'Plugin-ууд'
foreach ($p in 'MatchZy', 'WeaponPaints', 'MenuManagerCore', 'PlayerSettings', 'AnyBaseLib') {
  $d = Join-Path $BERX.CssDir "plugins\$p"; $s = Join-Path $BERX.CssDir "shared\$p"
  if ((Test-Path $d) -or (Test-Path $s)) { Ok "$p суусан" } else { Info "$p суугаагүй" }
}

Step 'MariaDB / MySQL (зөвхөн localhost)'
$svc = Get-Service -ErrorAction SilentlyContinue | Where-Object { $_.Name -match 'maria|mysql' }
if ($svc) { $svc | ForEach-Object { Ok "Service $($_.Name): $($_.Status)" } } else { Info 'MariaDB/MySQL service алга (02-prepare-mariadb.ps1)' }
$listen = Get-NetTCPConnection -LocalPort 3306 -State Listen -ErrorAction SilentlyContinue
foreach ($l in $listen) { if ($l.LocalAddress -in '127.0.0.1', '::1') { Ok "3306 зөвхөн $($l.LocalAddress) дээр" } else { Bad "3306 $($l.LocalAddress) дээр сонсож байна — bind-address=127.0.0.1 болгоно уу"; $problems++ } }
$fw = Get-NetFirewallPortFilter -Protocol TCP -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -eq '3306' } | Get-NetFirewallRule -ErrorAction SilentlyContinue | Where-Object { $_.Enabled -eq 'True' -and $_.Direction -eq 'Inbound' -and $_.Action -eq 'Allow' }
if ($fw) { Bad "Firewall-д 3306 inbound ЗӨВШӨӨРСӨН дүрэм бий: $($fw.DisplayName -join ', ') — устгана уу"; $problems++ } else { Ok 'Firewall: 3306 inbound нээлттэй дүрэм алга' }
Info 'VPS / router дээр 3306 port forward хийгээгүй эсэхийг өөрөө шалгана уу (WireGuard-аар зөвхөн 27015 дамжуулна).'

Step 'Node.js + BERX Agent'
$node = Get-Command node -ErrorAction SilentlyContinue
if ($node) { Ok "Node $(& node --version)" } else { Bad 'Node.js алга'; $problems++ }
if (Test-Path (Join-Path $BERX.AgentDir 'berx-agent.js')) {
  $ver = (Select-String (Join-Path $BERX.AgentDir 'berx-agent.js') -Pattern "const VERSION = '([\d.]+)'").Matches.Groups[1].Value
  if ([version]$ver -ge [version]'1.2.0') { Ok "berx-agent.js v$ver" } else { Warn "berx-agent.js v$ver — skins синкт 1.2.0+ (skins-sync.js) хэрэгтэй" }
} else { Bad "Agent олдсонгүй: $($BERX.AgentDir)"; $problems++ }
if (Test-Path (Join-Path $BERX.AgentDir 'skins-sync.js')) { Ok 'skins-sync.js бий' } else { Info 'skins-sync.js алга (repo-оос хуулна)' }
if (Test-Path (Join-Path $BERX.AgentDir 'node_modules\mysql2')) { Ok 'mysql2 суусан' } else { Info 'mysql2 алга: agent хавтсанд "npm install"' }
if (Test-Path (Join-Path $BERX.AgentDir '.env')) { Ok 'agent\.env бий (хөндөхгүй)' }
$sk = Read-EnvFile (Join-Path $BERX.AgentDir '.env.skins')
if ($sk.Count) { Info "agent\.env.skins: SKINS_SYNC_ENABLED=$($sk.SKINS_SYNC_ENABLED)" } else { Info 'agent\.env.skins алга (04-configure-db.ps1 үүсгэнэ)' }

Write-Host ''
if ($problems) { Write-Host "Нийт $problems асуудал. Засаад дахин шалгана уу." -ForegroundColor Red; exit 1 } else { Write-Host 'Шалгалт OK.' -ForegroundColor Green }
