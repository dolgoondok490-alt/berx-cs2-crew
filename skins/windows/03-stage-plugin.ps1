# 03 — WeaponPaints build-472 + хамаарлуудыг ТАТАЖ STAGING хавтаст бэлтгэх. game хавтсанд ЮУ Ч хуулахгүй.
#      C:\berx-skins\staging\payload\  (game\csgo-тэй ижил бүтэц) + plan.json (нэмэх файлууд, зөрчил)
. "$PSScriptRoot\common.ps1"
$dl = Join-Path $BERX.StagingDir 'downloads'; $payload = Join-Path $BERX.StagingDir 'payload'
if (Test-Path $payload) { Remove-Item $payload -Recurse -Force }
New-Item -ItemType Directory -Force $dl, $payload | Out-Null
$hdr = @{ 'User-Agent' = 'berx-skins-installer'; 'Accept' = 'application/vnd.github+json' }

function Get-Release($repo, $tag, $assetPattern) {
  $rel = Invoke-RestMethod "https://api.github.com/repos/$repo/releases/tags/$tag" -Headers $hdr
  $assets = @($rel.assets | Where-Object { $_.name -match $assetPattern })
  if (-not $assets) { throw "$repo $tag : '$assetPattern' asset олдсонгүй (байгаа: $($rel.assets.name -join ', '))" }
  $a = $assets[0]; $file = Join-Path $dl $a.name
  Invoke-WebRequest $a.browser_download_url -OutFile $file -Headers $hdr
  $sha = (Get-FileHash $file -Algorithm SHA256).Hash
  Ok "$repo $tag → $($a.name) ($([math]::Round($a.size/1KB)) KB) sha256 $sha"
  Info "release огноо: $($rel.published_at)  prerelease: $($rel.prerelease)"
  return $file
}

# zip-ийн бүтцийг game\csgo-тэй тааруулна: addons\counterstrikesharp\... эсвэл plugins\ / shared\ шууд
function Add-ToPayload($zip) {
  $x = Join-Path $BERX.StagingDir ('x-' + [IO.Path]::GetFileNameWithoutExtension($zip))
  if (Test-Path $x) { Remove-Item $x -Recurse -Force }
  Expand-Archive $zip $x -Force
  $addons = Get-ChildItem $x -Recurse -Directory -Filter 'addons' | Where-Object { Test-Path (Join-Path $_.FullName 'counterstrikesharp') } | Select-Object -First 1
  if ($addons) { Copy-Item (Join-Path $addons.FullName '*') (Join-Path $payload 'addons') -Recurse -Force; return }
  $css = Join-Path $payload 'addons\counterstrikesharp'; New-Item -ItemType Directory -Force $css | Out-Null
  $found = $false
  foreach ($sub in 'plugins', 'shared', 'gamedata', 'configs') {
    $d = Get-ChildItem $x -Recurse -Directory -Filter $sub | Select-Object -First 1
    if ($d) { Copy-Item $d.FullName $css -Recurse -Force; $found = $true }
  }
  if (-not $found) { throw "$zip : addons/plugins/shared бүтэц танигдсангүй — гараар шалгана уу ($x)" }
}

Step "WeaponPaints $($BERX.WeaponPaintsTag)"
Add-ToPayload (Get-Release 'Nereziel/cs2-WeaponPaints' $BERX.WeaponPaintsTag '^WeaponPaints\.zip$')
foreach ($d in $BERX.Deps) { Step "$($d.Repo) $($d.Tag)"; Add-ToPayload (Get-Release $d.Repo $d.Tag '\.zip$') }

Step 'Шалгалт (game хавтастай харьцуулах — хуулахгүй)'
$files = Get-ChildItem $payload -Recurse -File
$plan = @(); $conflicts = @()
foreach ($f in $files) {
  $rel = $f.FullName.Substring($payload.Length + 1)
  $target = Join-Path $BERX.CsgoDir $rel
  $state = 'new'
  if (Test-Path $target) { $state = if ((Get-FileHash $target).Hash -eq (Get-FileHash $f.FullName).Hash) { 'same' } else { 'overwrite' } }
  $plan += [pscustomobject]@{ path = $rel; state = $state }
  # CounterStrikeSharp core, MatchZy, Metamod-ийг ХЭЗЭЭ Ч дарж бичихгүй
  if ($state -eq 'overwrite' -or $rel -match '^addons\\(metamod|counterstrikesharp\\(api|bin|dotnet)|counterstrikesharp\\plugins\\MatchZy)') { $conflicts += $rel }
}
$plan | ConvertTo-Json -Depth 3 | Set-Content (Join-Path $BERX.StagingDir 'plan.json') -Encoding UTF8
Ok "$(@($plan | Where-Object state -eq 'new').Count) шинэ файл, $(@($plan | Where-Object state -eq 'same').Count) ижил"
if ($conflicts) { Warn "Одоо байгаа файлтай зөрчилдөх: `n           $($conflicts -join "`n           ")"; Warn '05-install-plugin.ps1 эдгээрийг дарж бичихгүй, суулгалтыг зогсооно.' }
if (-not (Test-Path (Join-Path $payload 'addons\counterstrikesharp\gamedata\weaponpaints.json'))) { Bad 'gamedata\weaponpaints.json алга'; exit 1 }
Ok "Staging бэлэн: $payload"
Write-Host "`nДараагийн алхам: 04-configure-db.ps1 (хэрэв хийгээгүй бол). Суулгах нь 05-ыг ЗӨВХӨН зөвшөөрсний дараа." -ForegroundColor Cyan
