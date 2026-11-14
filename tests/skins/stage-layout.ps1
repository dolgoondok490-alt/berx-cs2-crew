# BERX SKIN INVENTORY — staging бүтцийн regression тест (03-stage-plugin / 05-install-plugin)
#
#   Алдаа: Copy-Item 'x\addons\*' 'payload\addons' — payload\addons байхгүй үед counterstrikesharp хавтас
#          "addons" нэртэй болж хуулагдаж, payload\addons\gamedata\... болж addons\counterstrikesharp алга болсон.
#
#   pwsh   ./tests/skins/stage-layout.ps1              # synthetic + бодит 4 release zip (GitHub-аас татна)
#   pwsh   ./tests/skins/stage-layout.ps1 -SkipReal    # зөвхөн synthetic (сүлжээгүй)
#   Windows PowerShell 5.1 дээр ч ажиллана. Production C:\berx-skins, CS2 хавтсанд ХҮРЭХГҮЙ (түр хавтас ашиглана).
param([switch]$SkipReal, [string]$WorkRoot = (Join-Path ([IO.Path]::GetTempPath()) ('berx-stage-test-' + [guid]::NewGuid().ToString('N').Substring(0, 8))))
$ErrorActionPreference = 'Stop'
$repo = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
# Тест дууссаны дараа (алдаатай ч) таны PowerShell цонхны орчны хувьсагчийг сэргээнэ
$prevWork = $env:BERX_WORK_DIR; $prevCs2 = $env:BERX_CS2_DIR
try {
$env:BERX_WORK_DIR = Join-Path $WorkRoot 'work'
$env:BERX_CS2_DIR = Join-Path $WorkRoot 'fake-cs2'
. (Join-Path $repo 'skins\windows\common.ps1')
$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression, System.IO.Compression.FileSystem

$script:pass = 0; $script:fail = 0
function Check([string]$name, [bool]$cond, [string]$detail = '') {
  if ($cond) { $script:pass++; Write-Host "PASS $name" -ForegroundColor Green }
  else { $script:fail++; Write-Host "FAIL $name $detail" -ForegroundColor Red }
}
function Throws([scriptblock]$b) { try { & $b | Out-Null; return $null } catch { return $_.Exception.Message } }
function New-TestZip([string]$path, [hashtable]$entries) {
  if (Test-Path $path) { Remove-Item $path -Force }
  $z = [IO.Compression.ZipFile]::Open($path, 'Create')
  try {
    foreach ($k in $entries.Keys) {
      $e = $z.CreateEntry($k); $w = New-Object IO.StreamWriter($e.Open())
      try { $w.Write([string]$entries[$k]) } finally { $w.Dispose() }
    }
  } finally { $z.Dispose() }
  return $path
}
function Rel-Files([string]$dir) { @(Get-ChildItem -LiteralPath $dir -Recurse -File | ForEach-Object { Get-RelPath $dir $_.FullName } | Sort-Object) }

Write-Host "Work: $WorkRoot  (PowerShell $($PSVersionTable.PSVersion))"
New-Item -ItemType Directory -Force $WorkRoot | Out-Null
$fx = Join-Path $WorkRoot 'fixtures'; New-Item -ItemType Directory -Force $fx | Out-Null
Check 'production C:\berx-skins биш түр хавтас ашиглана' ($BERX.WorkDir -ne 'C:\berx-skins' -and $BERX.WorkDir.StartsWith($WorkRoot))

# ---------------------------------------------------------------- 1. Synthetic бүтэц
Write-Host "`n== Synthetic archive layouts"
# (a) WeaponPaints.zip-тэй ижил бүтэц; payload\addons байхгүй үед (алдаа гарсан нөхцөл)
$zA = New-TestZip (Join-Path $fx 'a.zip') @{
  'addons/counterstrikesharp/plugins/WeaponPaints/WeaponPaints.dll' = 'wp'
  'addons/counterstrikesharp/plugins/WeaponPaints/WeaponPaints.deps.json' = '{}'
  'addons/counterstrikesharp/gamedata/weaponpaints.json' = '{"g":1}' }
$pl = Join-Path $WorkRoot 'p1'
$r = Add-ZipToPayload $zA $pl (Join-Path $WorkRoot 'x-a') @('plugins\WeaponPaints\WeaponPaints.dll', 'gamedata\weaponpaints.json')
$files = @(Rel-Files $pl)
Check 'a: gamedata → addons\counterstrikesharp\gamedata\weaponpaints.json' ($files -contains 'addons\counterstrikesharp\gamedata\weaponpaints.json') ($files -join ', ')
Check 'a: plugin → addons\counterstrikesharp\plugins\WeaponPaints\' ($files -contains 'addons\counterstrikesharp\plugins\WeaponPaints\WeaponPaints.deps.json')
Check 'a: буруу addons\gamedata / addons\plugins үүсээгүй (regression)' (-not ($files | Where-Object { $_ -match '^addons\\(gamedata|plugins|shared|configs)\\' })) ($files -join ', ')
Check 'a: archive үндэс = addons\counterstrikesharp' ($r.Root -eq 'addons\counterstrikesharp') $r.Root

# (b) дээд түвшинд нэмэлт хавтастай, (c) addons-гүй bare plugins/shared, (d) counterstrikesharp/ шууд
$zB = New-TestZip (Join-Path $fx 'b.zip') @{ 'Pkg-1.0/addons/counterstrikesharp/shared/BApi/BApi.dll' = 'b'; 'Pkg-1.0/README.md' = 'r' }
$zC = New-TestZip (Join-Path $fx 'c.zip') @{ 'plugins/C/C.dll' = 'c'; 'shared/CApi/CApi.dll' = 'capi'; 'LICENSE' = 'l' }
$zD = New-TestZip (Join-Path $fx 'd.zip') @{ 'counterstrikesharp/plugins/D/D.dll' = 'd' }
$rb = Add-ZipToPayload $zB $pl (Join-Path $WorkRoot 'x-b') @('shared\BApi\BApi.dll')
$rc = Add-ZipToPayload $zC $pl (Join-Path $WorkRoot 'x-c') @('plugins\C\C.dll', 'shared\CApi\CApi.dll')
$null = Add-ZipToPayload $zD $pl (Join-Path $WorkRoot 'x-d') @('plugins\D\D.dll')
$files = @(Rel-Files $pl)
foreach ($e in 'shared\BApi\BApi.dll', 'plugins\C\C.dll', 'shared\CApi\CApi.dll', 'plugins\D\D.dll') {
  Check "b/c/d: addons\counterstrikesharp\$e" ($files -contains "addons\counterstrikesharp\$e") }
Check 'b/c: README/LICENSE staging-д ороогүй (ignored)' (($rb.Ignored -contains 'Pkg-1.0\README.md') -and ($rc.Ignored -contains 'LICENSE') -and -not ($files | Where-Object { $_ -match 'README|LICENSE' }))
Check 'b/c/d payload бүтэц зөв (Test-StagedPayload)' (@(Test-StagedPayload $pl @()).Count -eq 0) ((Test-StagedPayload $pl @()) -join '; ')

# (e) CSS core / Metamod / MatchZy агуулсан archive — хэзээ ч staging хийхгүй
$zE = New-TestZip (Join-Path $fx 'e.zip') @{
  'addons/metamod/counterstrikesharp.vdf' = 'mm'; 'addons/counterstrikesharp/api/CounterStrikeSharp.API.dll' = 'core'
  'addons/counterstrikesharp/dotnet/x.dll' = 'net'; 'addons/counterstrikesharp/plugins/MatchZy/MatchZy.dll' = 'mz'
  'addons/counterstrikesharp/plugins/E/E.dll' = 'e' }
$pe = Join-Path $WorkRoot 'p-e'
$re = Add-ZipToPayload $zE $pe (Join-Path $WorkRoot 'x-e') @('plugins\E\E.dll')
$fe = @(Rel-Files $pe)
Check 'e: зөвхөн plugins\E staging хийгдсэн' (($fe.Count -eq 1) -and $fe[0] -eq 'addons\counterstrikesharp\plugins\E\E.dll') ($fe -join ', ')
Check 'e: metamod/api/dotnet/MatchZy ignored' ($re.Ignored.Count -eq 4) ($re.Ignored -join ', ')

# (f) archive хоорондын давхардал: ижил агуулга OK, өөр агуулга → зогсоно
$zF1 = New-TestZip (Join-Path $fx 'f1.zip') @{ 'addons/counterstrikesharp/shared/Lib/Lib.dll' = 'v1' }
$zF2 = New-TestZip (Join-Path $fx 'f2.zip') @{ 'addons/counterstrikesharp/shared/Lib/Lib.dll' = 'v1' }
$zF3 = New-TestZip (Join-Path $fx 'f3.zip') @{ 'addons/counterstrikesharp/shared/Lib/Lib.dll' = 'v2' }
$pf = Join-Path $WorkRoot 'p-f'
$null = Add-ZipToPayload $zF1 $pf (Join-Path $WorkRoot 'x-f1')
Check 'f: ижил агуулгатай давхардал зөвшөөрөгдөнө' ($null -eq (Throws { Add-ZipToPayload $zF2 $pf (Join-Path $WorkRoot 'x-f2') }))
$m = Throws { Add-ZipToPayload $zF3 $pf (Join-Path $WorkRoot 'x-f3') }
Check 'f: өөр агуулгатай давхардал → зогсоно' ($m -match 'зөрчил') $m

# (g) танигдахгүй archive, (h) хүлээгдэж буй файл дутуу → зогсоно (validation-ийг алгасахгүй)
$zG = New-TestZip (Join-Path $fx 'g.zip') @{ 'README.md' = 'x'; 'src/Foo.cs' = 'x' }
Check 'g: танигдахгүй бүтэц → throw' ((Throws { Add-ZipToPayload $zG (Join-Path $WorkRoot 'p-g') (Join-Path $WorkRoot 'x-g') }) -match 'танигдсангүй')
$zH = New-TestZip (Join-Path $fx 'h.zip') @{ 'addons/counterstrikesharp/plugins/WeaponPaints/WeaponPaints.dll' = 'wp' }
Check 'h: gamedata дутуу → throw' ((Throws { Add-ZipToPayload $zH (Join-Path $WorkRoot 'p-h') (Join-Path $WorkRoot 'x-h') @('gamedata\weaponpaints.json') }) -match 'gamedata\\weaponpaints.json')

# (i) дарааллаас хамаарахгүй
$o1 = Join-Path $WorkRoot 'p-o1'; $o2 = Join-Path $WorkRoot 'p-o2'
foreach ($z in $zA, $zB, $zC) { $null = Add-ZipToPayload $z $o1 (Join-Path $WorkRoot 'x-o') }
foreach ($z in $zC, $zB, $zA) { $null = Add-ZipToPayload $z $o2 (Join-Path $WorkRoot 'x-o') }
Check 'i: archive-ийн дараалал үр дүнд нөлөөлөхгүй' (((Rel-Files $o1) -join '|') -eq ((Rel-Files $o2) -join '|'))

# (j) хуучин алдаатай payload-ыг Test-StagedPayload барина
$bad = Join-Path $WorkRoot 'p-bad'
foreach ($f in 'addons\gamedata\weaponpaints.json', 'addons\plugins\WeaponPaints\WeaponPaints.dll') { $t = Join-Path $bad $f; New-Item -ItemType Directory -Force (Split-Path $t) | Out-Null; Set-Content $t 'x' }
$pb = @(Test-StagedPayload $bad)
Check 'j: хуучин буруу бүтэц → gamedata\weaponpaints.json алга гэж барина' (($pb -join ' ') -match 'алга: addons\\counterstrikesharp\\gamedata\\weaponpaints.json') ($pb -join '; ')
Check 'j: addons\gamedata, addons\plugins → буруу байрлал' (@($pb | Where-Object { $_ -match 'буруу байрлал' }).Count -eq 2)

# ---------------------------------------------------------------- 2. Бодит release zip-үүд
if (-not $SkipReal) {
  Write-Host "`n== Real release archives (GitHub)"
  $dl = Join-Path $WorkRoot 'downloads'; $pr = Join-Path $WorkRoot 'p-real'
  foreach ($a in $BERX.Archives) {
    $zip = Get-PluginRelease $a.Repo $a.Tag $a.Asset $dl
    $z = [IO.Compression.ZipFile]::OpenRead($zip)
    try { Write-Host "  -- $($a.Name) $($a.Tag) archive layout:"; $z.Entries | Where-Object { $_.Name } | ForEach-Object { Write-Host "       $($_.FullName)" } } finally { $z.Dispose() }
    $err = Throws { $script:rr = Add-ZipToPayload $zip $pr (Join-Path $WorkRoot ('x-' + $a.Name)) $a.Expect }
    Check "real $($a.Name): staging + Expect ($($a.Expect -join ', '))" ($null -eq $err) $err
    if (-not $err) { Write-Host "       root=$($rr.Root) staged=$($rr.Staged.Count) ignored=$($rr.Ignored -join ', ')" }
  }
  Write-Host '  -- staged payload:'; Rel-Files $pr | ForEach-Object { Write-Host "       $_" }
  $p = @(Test-StagedPayload $pr)
  Check 'real: Test-StagedPayload — асуудалгүй' ($p.Count -eq 0) ($p -join '; ')
  Check 'real: addons\counterstrikesharp\gamedata\weaponpaints.json' (Test-Path (Join-Path $pr 'addons\counterstrikesharp\gamedata\weaponpaints.json'))
  Check 'real: payload\addons дотор зөвхөн counterstrikesharp' (((@(Get-ChildItem (Join-Path $pr 'addons')) | ForEach-Object Name) -join ',') -eq 'counterstrikesharp')

  # Зорилтот замууд: fake CS2 сервер (MatchZy + core суусан, PlayerSettings өөр хувилбартай биш)
  $csgo = Join-Path $env:BERX_CS2_DIR 'game\csgo'
  foreach ($f in 'addons\counterstrikesharp\api\CounterStrikeSharp.API.dll', 'addons\counterstrikesharp\plugins\MatchZy\MatchZy.dll', 'addons\counterstrikesharp\configs\core.json', 'addons\metamod\counterstrikesharp.vdf', 'cfg\server.cfg') {
    $t = Join-Path $csgo $f; New-Item -ItemType Directory -Force (Split-Path $t) | Out-Null; Set-Content $t "orig $f" }
  $plan = @(Get-StagePlan $pr $csgo)
  $wp = $plan | Where-Object path -eq 'addons\counterstrikesharp\plugins\WeaponPaints\WeaponPaints.dll'
  Check 'map: WeaponPaints.dll → game\csgo\addons\counterstrikesharp\plugins\WeaponPaints\' ($wp -and $wp.target -eq (Join-Path $csgo 'addons\counterstrikesharp\plugins\WeaponPaints\WeaponPaints.dll'))
  $gd = $plan | Where-Object path -eq 'addons\counterstrikesharp\gamedata\weaponpaints.json'
  Check 'map: weaponpaints.json → game\csgo\addons\counterstrikesharp\gamedata\' ($gd -and $gd.target -eq (Join-Path $csgo 'addons\counterstrikesharp\gamedata\weaponpaints.json'))
  Check 'map: бүх target game\csgo\addons\counterstrikesharp\{plugins,shared,gamedata}\ дотор' (-not ($plan | Where-Object { $_.target -notmatch '\\game\\csgo\\addons\\counterstrikesharp\\(plugins|shared|gamedata|configs)\\' }))
  Check 'map: шинэ сервер дээр бүгд new, хамгаалагдсан байхгүй' (-not ($plan | Where-Object { $_.state -ne 'new' -or $_.protected }))

  # ------------------------------------------------------------ 3. 03-stage-plugin.ps1 end-to-end (түр хавтсанд)
  Write-Host "`n== 03-stage-plugin.ps1 end-to-end"
  $before = @(Get-ChildItem $env:BERX_CS2_DIR -Recurse -File | ForEach-Object { "$($_.FullName)|$((Get-FileHash $_.FullName).Hash)" })
  $sp = Join-Path $BERX.StagingDir 'payload'
  # 04-ийн бичсэн тохиргоо + хуучин алдаатай бүтэц байгаа үед дахин ажиллуулах
  $cfg = Join-Path $sp 'addons\counterstrikesharp\configs\plugins\WeaponPaints\WeaponPaints.json'
  New-Item -ItemType Directory -Force (Split-Path $cfg), (Join-Path $sp 'addons\gamedata') | Out-Null
  Set-Content $cfg '{"ConfigVersion":10,"DatabaseName":"berx_weaponpaints"}'; Set-Content (Join-Path $sp 'addons\gamedata\weaponpaints.json') 'old-bug'
  $cfgHash = (Get-FileHash $cfg).Hash
  $out = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $repo 'skins\windows\03-stage-plugin.ps1') 2>&1
  $code = $LASTEXITCODE
  $out | ForEach-Object { Write-Host "       $_" }
  Check '03: exit 0' ($code -eq 0) "exit=$code"
  Check '03: [FAIL] мөр байхгүй' (-not ($out | Where-Object { "$_" -match '\[FAIL\]' }))
  Check '03: staging бүтэц зөв' (@(Test-StagedPayload $sp).Count -eq 0) ((Test-StagedPayload $sp) -join '; ')
  Check '03: хуучин addons\gamedata цэвэрлэгдсэн' (-not (Test-Path (Join-Path $sp 'addons\gamedata')))
  Check '03: 04-ийн WeaponPaints.json хадгалагдсан' ((Test-Path $cfg) -and (Get-FileHash $cfg).Hash -eq $cfgHash)
  Check '03: plan.json бичигдсэн' (Test-Path (Join-Path $BERX.StagingDir 'plan.json'))
  $after = @(Get-ChildItem $env:BERX_CS2_DIR -Recurse -File | ForEach-Object { "$($_.FullName)|$((Get-FileHash $_.FullName).Hash)" })
  Check '03: CS2 сервер хавтсанд юу ч өөрчлөгдөөгүй' (($before -join "`n") -eq ($after -join "`n"))

  # ------------------------------------------------------------ 4. 05-ийн хуулах логик (fake сервер дээр)
  Write-Host "`n== 05 install logic (fake server)"
  $res = Install-StagedPayload $sp $csgo
  Check '05: WeaponPaints.dll зөв газарт' (Test-Path (Join-Path $csgo 'addons\counterstrikesharp\plugins\WeaponPaints\WeaponPaints.dll'))
  Check '05: weaponpaints.json → addons\counterstrikesharp\gamedata\' (Test-Path (Join-Path $csgo 'addons\counterstrikesharp\gamedata\weaponpaints.json'))
  Check '05: WeaponPaints.json → addons\counterstrikesharp\configs\plugins\WeaponPaints\' (Test-Path (Join-Path $csgo 'addons\counterstrikesharp\configs\plugins\WeaponPaints\WeaponPaints.json'))
  foreach ($e in $BERX.RequiredStaged) { Check "05: $e" (Test-Path (Join-Path $csgo $e)) }
  Check '05: game\csgo\addons\gamedata, addons\plugins үүсээгүй' (-not (Test-Path (Join-Path $csgo 'addons\gamedata')) -and -not (Test-Path (Join-Path $csgo 'addons\plugins')))
  $kept = $true
  foreach ($f in 'addons\counterstrikesharp\api\CounterStrikeSharp.API.dll', 'addons\counterstrikesharp\plugins\MatchZy\MatchZy.dll', 'addons\counterstrikesharp\configs\core.json', 'addons\metamod\counterstrikesharp.vdf', 'cfg\server.cfg') {
    if ((Get-Content (Join-Path $csgo $f) -Raw).Trim() -ne "orig $f") { $kept = $false } }
  Check '05: core, MatchZy, Metamod, core.json, server.cfg хөндөгдөөгүй' $kept
  $res2 = Install-StagedPayload $sp $csgo
  Check '05: дахин ажиллуулахад 0 нэмэлт (idempotent)' (($res2.Added.Count -eq 0) -and ($res2.Skipped.Count -eq $res.Added.Count))
  # одоо байгаа өөр файлыг дарж бичихгүй
  Set-Content (Join-Path $csgo 'addons\counterstrikesharp\gamedata\weaponpaints.json') 'changed'
  $m = Throws { Install-StagedPayload $sp $csgo }
  Check '05: өөр агуулгатай одоо байгаа файл → зогсоно, дарж бичихгүй' (($m -match 'дарж бичихгүй') -and ((Get-Content (Join-Path $csgo 'addons\counterstrikesharp\gamedata\weaponpaints.json') -Raw).Trim() -eq 'changed'))
  # хуучин алдаатай staging-ийг 05 татгалзана
  $m = Throws { Install-StagedPayload $bad $csgo }
  Check '05: хуучин буруу бүтэцтэй staging → татгалзана' ($m -match 'Staging бүтэц буруу') $m
}

Write-Host "`n$script:pass passed, $script:fail failed"
if (-not $script:fail) { Remove-Item $WorkRoot -Recurse -Force -ErrorAction SilentlyContinue }
} catch { $script:fail++; Write-Host "FAIL (exception) $($_.Exception.Message)" -ForegroundColor Red }
finally { $env:BERX_WORK_DIR = $prevWork; $env:BERX_CS2_DIR = $prevCs2 }
if ($script:fail) { exit 1 }
exit 0
