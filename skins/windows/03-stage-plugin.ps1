# 03 — WeaponPaints build-472 + хамаарлуудыг ТАТАЖ STAGING хавтаст бэлтгэх. game хавтсанд ЮУ Ч хуулахгүй.
#      C:\berx-skins\staging\payload\  (game\csgo-тэй ЯГ ижил бүтэц) + plan.json (нэмэх файлууд, зөрчил)
#
#      payload\addons\counterstrikesharp\plugins\...   → game\csgo\addons\counterstrikesharp\plugins\...
#      payload\addons\counterstrikesharp\shared\...    → game\csgo\addons\counterstrikesharp\shared\...
#      payload\addons\counterstrikesharp\gamedata\...  → game\csgo\addons\counterstrikesharp\gamedata\...
#      payload\addons\counterstrikesharp\configs\...   → game\csgo\addons\counterstrikesharp\configs\...  (04 бичнэ)
. "$PSScriptRoot\common.ps1"
$dl = Join-Path $BERX.StagingDir 'downloads'; $payload = Join-Path $BERX.StagingDir 'payload'

# 04-configure-db.ps1-ийн бичсэн WeaponPaints.json-ийг дахин staging хийхэд алдахгүй
$cfgRel = Join-Path $BERX.CssRel 'configs\plugins\WeaponPaints\WeaponPaints.json'
$cfgKeep = $null
if (Test-Path -LiteralPath (Join-Path $payload $cfgRel)) { $cfgKeep = [IO.File]::ReadAllBytes((Join-Path $payload $cfgRel)) }

if (Test-Path $payload) { Remove-Item $payload -Recurse -Force }   # хуучин (буруу бүтэцтэй байж болох) staging-ийг бүрэн цэвэрлэнэ
New-Item -ItemType Directory -Force $dl, $payload | Out-Null

foreach ($a in $BERX.Archives) {
  Step "$($a.Repo) $($a.Tag)"
  $zip = Get-PluginRelease $a.Repo $a.Tag $a.Asset $dl
  $r = Add-ZipToPayload $zip $payload (Join-Path $BERX.StagingDir ('x-' + $a.Name)) $a.Expect
  Ok "$($r.Staged.Count) файл → payload\$($BERX.CssRel)  (archive доторх үндэс: $($r.Root))"
  foreach ($e in $a.Expect) { Info "  ✓ $e" }
  if ($r.Ignored) { Info "Staging хийгээгүй (CSS plugin-ий хэсэг биш): $($r.Ignored -join ', ')" }
}
if ($cfgKeep) {
  $cfgPath = Join-Path $payload $cfgRel
  New-Item -ItemType Directory -Force (Split-Path $cfgPath -Parent) | Out-Null
  [IO.File]::WriteAllBytes($cfgPath, $cfgKeep); $cfgKeep = $null
  Ok '04-ийн үүсгэсэн WeaponPaints.json хадгалагдлаа'
}

Step 'Бүтцийн шалгалт'
$problems = @(Test-StagedPayload $payload)
if ($problems) { foreach ($p in $problems) { Bad $p }; Bad 'Staging бүтэц буруу — суулгах боломжгүй'; exit 1 }
Ok "Бүх шаардлагатай файл зөв байрлалд ($($BERX.RequiredStaged.Count)):"
foreach ($r in $BERX.RequiredStaged) { Info "  $r" }

Step 'game хавтастай харьцуулах (хуулахгүй)'
$plan = @(Get-StagePlan $payload $BERX.CsgoDir)
$plan | Select-Object path, target, state, protected | ConvertTo-Json -Depth 3 | Set-Content (Join-Path $BERX.StagingDir 'plan.json') -Encoding UTF8
Ok "$(@($plan | Where-Object state -eq 'new').Count) шинэ файл, $(@($plan | Where-Object state -eq 'same').Count) ижил"
Info "Зорилтот хавтас: $($BERX.CssDir)"
# CounterStrikeSharp core, MatchZy, Metamod-ийг ХЭЗЭЭ Ч дарж бичихгүй
$conflicts = @($plan | Where-Object { $_.state -eq 'overwrite' -or $_.protected } | ForEach-Object path)
if ($conflicts) { Warn "Одоо байгаа файлтай зөрчилдөх: `n           $($conflicts -join "`n           ")"; Warn '05-install-plugin.ps1 эдгээрийг дарж бичихгүй, суулгалтыг зогсооно.' }
Ok "Staging бэлэн: $payload"
Write-Host "`nДараагийн алхам: 04-configure-db.ps1 (хэрэв хийгээгүй бол). Суулгах нь 05-ыг ЗӨВХӨН зөвшөөрсний дараа." -ForegroundColor Cyan
