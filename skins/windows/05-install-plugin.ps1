# 05 — WeaponPaints-ийг PRODUCTION сервер дээр суулгах. ⚠️ ЗӨВХӨН OWNER-ИЙН ТОДОРХОЙ ЗӨВШӨӨРЛӨӨР.
#
#   Шаардлага:
#     -IUnderstandValveGsltRisk     Valve-ийн дүрэм (skins/COMPATIBILITY.md) уншиж, GSLT ban эрсдэлийг хүлээн зөвшөөрсөн
#     CS2 сервер ЗОГССОН байх (энэ скрипт серверийг унтраахгүй/асаахгүй — owner өөрөө launcher-ээр зогсооно)
#     03-stage-plugin.ps1, 04-configure-db.ps1 ажилласан
#
#   Хийх зүйл:  01-backup → staging-ийн ЗӨВХӨН ШИНЭ файлуудыг game\csgo руу хуулна → manifest бичнэ (rollback-д)
#   Хийхгүй:    CounterStrikeSharp core, Metamod, MatchZy, server.cfg, agent\.env-д хүрэхгүй.
#               FollowCS2ServerGuidelines-ийг ӨӨРЧЛӨХГҮЙ — тусдаа -AlsoDisableServerGuidelines switch хэрэгтэй.
param([switch]$IUnderstandValveGsltRisk, [switch]$AlsoDisableServerGuidelines)
. "$PSScriptRoot\common.ps1"

if (-not $IUnderstandValveGsltRisk) {
  Bad 'Суулгалт хийгдсэнгүй. skins\COMPATIBILITY.md-ийн "Valve-ийн дүрэм ба эрсдэл" хэсгийг уншаад:'
  Info '.\05-install-plugin.ps1 -IUnderstandValveGsltRisk'
  exit 1
}
$srv = Get-ServerProcess
if ($srv) { Bad "CS2 сервер ажиллаж байна (PID $($srv.ProcessId)). BERX ARENA Launcher-ээр өөрөө STOP хийгээд дахин ажиллуулна уу. Энэ скрипт серверийг унтраахгүй."; exit 1 }
$payload = Join-Path $BERX.StagingDir 'payload'
if (-not (Test-Path (Join-Path $payload 'addons\counterstrikesharp\configs\plugins\WeaponPaints\WeaponPaints.json'))) { Bad 'WeaponPaints.json staging-д алга — 04-configure-db.ps1'; exit 1 }
# 03-ийн засагдсан бүтэц (addons\counterstrikesharp\...) ба бүх шаардлагатай файлыг дахин шалгана — буруу бол юу ч хуулахгүй
$problems = @(Test-StagedPayload $payload)
if ($problems) { foreach ($p in $problems) { Bad $p }; Bad 'Staging бүтэц буруу/дутуу — 03-stage-plugin.ps1-ийг дахин ажиллуулна уу'; exit 1 }
$plan = @(Get-StagePlan $payload $BERX.CsgoDir)
$blocked = @($plan | Where-Object { $_.protected -or $_.state -eq 'overwrite' })
if ($blocked) { foreach ($b in $blocked) { Bad "Хамгаалагдсан эсвэл одоо байгаа өөр файл: $($b.path)" }; Info 'Зөрчлийг гараар шийдээд (эсвэл 99-rollback) дахин ажиллуулна уу.'; exit 1 }
Ok "$(@($plan | Where-Object state -eq 'new').Count) файл нэмэгдэнэ → $($BERX.CssDir)"

Confirm-Typed 'BERX-SKINS' "Та BERX ARENA сервер дээр WeaponPaints суулгах гэж байна.`nValve-ийн Steam Support: тоглогчийн эзэмшдэггүй item/хутга өгдөг сервер GSLT ban авч болно (operator-ийн матчмейкинг/арилжаа түр хязгаарлагдана)."

Step 'Нөөц'
$stamp = & "$PSScriptRoot\01-backup.ps1" | Select-Object -Last 1

Step 'Хуулж байна (зөвхөн шинэ файл)'
try { $res = Install-StagedPayload $payload $BERX.CsgoDir } catch { Bad $_.Exception.Message; exit 1 }
$added = $res.Added
Ok "$($added.Count) файл нэмэгдлээ, $($res.Skipped.Count) ижил тул алгаслаа"
[ordered]@{ installedAt = (Get-Date).ToString('s'); backup = "$stamp.zip"; weaponPaints = $BERX.WeaponPaintsTag; files = $added; guidelinesChanged = $false } |
  ConvertTo-Json -Depth 3 | Set-Content $BERX.Manifest -Encoding UTF8
Ok "Суулгалаа. Manifest: $($BERX.Manifest)"

if ($AlsoDisableServerGuidelines) {
  Confirm-Typed 'DISABLE-GUIDELINES' 'CounterStrikeSharp core.json-д FollowCS2ServerGuidelines=false болгох гэж байна. Энэ нь Valve-ийн хамгаалалтыг унтраана.'
  $core = Join-Path $BERX.CssDir 'configs\core.json'
  $j = Get-Content $core -Raw | ConvertFrom-Json; $j.FollowCS2ServerGuidelines = $false
  $j | ConvertTo-Json -Depth 10 | Set-Content $core -Encoding UTF8
  $m = Get-Content $BERX.Manifest -Raw | ConvertFrom-Json; $m.guidelinesChanged = $true; $m | ConvertTo-Json -Depth 3 | Set-Content $BERX.Manifest -Encoding UTF8
  Warn 'FollowCS2ServerGuidelines = false'
} else {
  Info 'FollowCS2ServerGuidelines өөрчлөгдөөгүй. WeaponPaints бүрэн ажиллахад false хэрэгтэй (README → "Идэвхжүүлэх").'
}
Write-Host "`nДараа нь: launcher-ээр серверээ START → 06-verify-plugin.ps1" -ForegroundColor Cyan
