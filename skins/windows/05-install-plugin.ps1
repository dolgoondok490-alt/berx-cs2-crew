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
if (-not (Test-Path (Join-Path $payload 'addons\counterstrikesharp\plugins\WeaponPaints\WeaponPaints.dll'))) { Bad 'Staging алга — 03-stage-plugin.ps1'; exit 1 }
if (-not (Test-Path (Join-Path $payload 'addons\counterstrikesharp\configs\plugins\WeaponPaints\WeaponPaints.json'))) { Bad 'WeaponPaints.json staging-д алга — 04-configure-db.ps1'; exit 1 }

Confirm-Typed 'BERX-SKINS' "Та BERX ARENA сервер дээр WeaponPaints суулгах гэж байна.`nValve-ийн Steam Support: тоглогчийн эзэмшдэггүй item/хутга өгдөг сервер GSLT ban авч болно (operator-ийн матчмейкинг/арилжаа түр хязгаарлагдана)."

Step 'Нөөц'
$stamp = & "$PSScriptRoot\01-backup.ps1" | Select-Object -Last 1

Step 'Хуулах төлөвлөгөө'
$added = @(); $skipped = @()
foreach ($f in Get-ChildItem $payload -Recurse -File) {
  $rel = $f.FullName.Substring($payload.Length + 1)
  if ($rel -match '^addons\\(metamod|counterstrikesharp\\(api|bin|dotnet)|counterstrikesharp\\plugins\\MatchZy)') { Bad "Хамгаалагдсан зам: $rel — зогслоо"; exit 1 }
  $target = Join-Path $BERX.CsgoDir $rel
  if (Test-Path $target) {
    if ((Get-FileHash $target).Hash -eq (Get-FileHash $f.FullName).Hash) { $skipped += $rel; continue }
    Bad "Одоо байгаа файлыг дарж бичихгүй: $rel"; Info 'Зөрчлийг гараар шийдээд (эсвэл 99-rollback) дахин ажиллуулна уу.'; exit 1
  }
  $added += $rel
}
Ok "$($added.Count) файл нэмнэ, $($skipped.Count) ижил тул алгасна"

Step 'Хуулж байна'
foreach ($rel in $added) {
  $target = Join-Path $BERX.CsgoDir $rel
  New-Item -ItemType Directory -Force (Split-Path $target) | Out-Null
  Copy-Item (Join-Path $payload $rel) $target
}
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
