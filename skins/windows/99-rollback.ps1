# 99 — Буцаах. CS2 сервер ЗОГССОН байх ёстой (скрипт унтраахгүй).
#   • manifest-д бүртгэгдсэн (05-ийн нэмсэн) файлуудыг л устгана — бусад plugin, MatchZy-д хүрэхгүй
#   • core.json-ийг суулгалтын өмнөх нөөцөөс сэргээнэ (05 өөрчилсөн бол)
#   • agent\.env.skins → SKINS_SYNC_ENABLED=0 (agent\.env-д хүрэхгүй)
#   • -DropDatabase : berx_weaponpaints DB болон хэрэглэгчдийг устгана (асууна)
param([switch]$DropDatabase)
. "$PSScriptRoot\common.ps1"
if (Get-ServerProcess) { Bad 'CS2 сервер ажиллаж байна — launcher-ээр STOP хийгээд дахин ажиллуулна уу.'; exit 1 }
if (Test-Path $BERX.Manifest) {
  $m = Get-Content $BERX.Manifest -Raw | ConvertFrom-Json
  Step "Суулгасан файлуудыг устгах ($($m.files.Count))"
  foreach ($rel in $m.files) { $t = Join-Path $BERX.CsgoDir $rel; if (Test-Path $t) { Remove-Item $t -Force } }
  foreach ($d in 'plugins\WeaponPaints', 'configs\plugins\WeaponPaints') { $p = Join-Path $BERX.CssDir $d; if ((Test-Path $p) -and -not (Get-ChildItem $p -Recurse -File)) { Remove-Item $p -Recurse -Force } }
  Ok 'Файлууд устгагдлаа'
  if ($m.guidelinesChanged) {
    Step 'core.json сэргээх'
    $zip = Join-Path $BERX.BackupDir $m.backup; $x = Join-Path $env:TEMP 'berx-rb'
    if (Test-Path $x) { Remove-Item $x -Recurse -Force }
    Expand-Archive $zip $x
    Copy-Item (Join-Path $x 'csgo\addons\counterstrikesharp\configs\core.json') (Join-Path $BERX.CssDir 'configs\core.json') -Force
    Remove-Item $x -Recurse -Force; Ok 'core.json (FollowCS2ServerGuidelines) өмнөх утгаар сэргээгдлээ'
  }
  Move-Item $BERX.Manifest "$($BERX.Manifest).rolledback-$(Get-Date -Format yyyyMMddHHmmss)"
} else { Info 'Manifest алга — plugin файл суулгаагүй байна' }

$envSkins = Join-Path $BERX.AgentDir '.env.skins'
if (Test-Path $envSkins) { (Get-Content $envSkins) -replace '^SKINS_SYNC_ENABLED=.*$', 'SKINS_SYNC_ENABLED=0' | Set-Content $envSkins -Encoding UTF8; Ok 'agent\.env.skins: SKINS_SYNC_ENABLED=0 (agent-ийг дахин асаахад хүчинтэй)' }

if ($DropDatabase) {
  Confirm-Typed 'DROP' "$($BERX.DbName) DB болон $($BERX.DbPluginUser)/$($BERX.DbAgentUser) хэрэглэгчдийг устгана. Сонголтууд (loadout) сайтын Supabase-д хэвээр үлдэнэ."
  $rootCred = New-Object System.Management.Automation.PSCredential('root', (Read-Host 'MariaDB root нууц үг' -AsSecureString))
  Invoke-Mysql $rootCred "DROP DATABASE IF EXISTS ``$($BERX.DbName)``; DROP USER IF EXISTS '$($BERX.DbPluginUser)'@'localhost', '$($BERX.DbPluginUser)'@'127.0.0.1', '$($BERX.DbAgentUser)'@'localhost', '$($BERX.DbAgentUser)'@'127.0.0.1';" | Out-Null
  Ok 'DB, хэрэглэгчид устгагдлаа'
}
Write-Host "`nRollback дууслаа. Launcher-ээр серверээ START хийнэ үү. Сайт дээр Vercel env SKINS_ENABLED / SKINS_SYNC_ENABLED-ийг устгана уу (README)." -ForegroundColor Cyan
