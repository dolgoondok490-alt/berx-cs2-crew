# 02 — Локал MariaDB бэлтгэх (Administrator). CS2 серверийг хөндөхгүй.
#   • MariaDB суугаагүй бол winget-ээр суулгахыг САНАЛ болгоно (асууна)
#   • my.ini-д bind-address=127.0.0.1 (нөөцөлсний дараа), skip-name-resolve
#   • MariaDB service-ийг (CS2 биш) дахин асааж, 3306 зөвхөн localhost дээр сонсож буйг шалгана
. "$PSScriptRoot\common.ps1"
if (-not (Test-Admin)) { Bad 'PowerShell-ийг "Run as Administrator"-аар нээнэ үү'; exit 1 }

Step 'MariaDB service'
$svc = Get-Service -ErrorAction SilentlyContinue | Where-Object { $_.Name -match 'maria|mysql' } | Select-Object -First 1
if (-not $svc) {
  Warn 'MariaDB/MySQL суугаагүй байна.'
  Info 'Санал: MariaDB 11.4 LTS (https://mariadb.org/download). Суулгахдаа root нууц үг тавина, "Enable networking" асаалттай, port 3306.'
  $ans = Read-Host 'winget-ээр "MariaDB.Server" суулгах уу? (y/N)'
  if ($ans -ne 'y') { Info 'MariaDB-г гараар суулгаад энэ скриптийг дахин ажиллуулна уу.'; exit 0 }
  winget install --id MariaDB.Server -e --accept-package-agreements --accept-source-agreements
  if ($LASTEXITCODE -ne 0) { Bad 'winget амжилтгүй — MariaDB-г гараар суулгана уу'; exit 1 }
  $svc = Get-Service -ErrorAction SilentlyContinue | Where-Object { $_.Name -match 'maria|mysql' } | Select-Object -First 1
  if (-not $svc) { Bad 'Service олдсонгүй. MariaDB installer-ийг гараар ажиллуулна уу (service болгон суулгах сонголттой).'; exit 1 }
}
Ok "Service: $($svc.Name) ($($svc.Status))"

Step 'my.ini — зөвхөн localhost'
$path = (Get-CimInstance Win32_Service -Filter "Name='$($svc.Name)'").PathName
$ini = [regex]::Match($path, '--defaults-file="?([^"]+my\.ini)').Groups[1].Value
if (-not $ini -or -not (Test-Path $ini)) { Bad "my.ini олдсонгүй (service: $path). bind-address=127.0.0.1-ийг гараар тохируулна уу."; exit 1 }
$txt = Get-Content $ini -Raw
if ($txt -match '(?m)^\s*bind-address\s*=\s*127\.0\.0\.1\s*$') { Ok "$ini → bind-address=127.0.0.1 аль хэдийн" }
else {
  Copy-Item $ini "$ini.berx-backup-$(Get-Date -Format yyyyMMddHHmmss)" -Force
  $txt = [regex]::Replace($txt, '(?m)^\s*bind-address\s*=.*$', '')
  $re = [regex]'(?m)^\[mysqld\]\s*$'
  $txt = $re.Replace($txt, "[mysqld]`r`nbind-address=127.0.0.1`r`nskip-name-resolve", 1)
  if ($txt -notmatch 'bind-address=127\.0\.0\.1') { $txt += "`r`n[mysqld]`r`nbind-address=127.0.0.1`r`nskip-name-resolve`r`n" }
  Set-Content $ini $txt -Encoding ASCII
  Ok "$ini засагдлаа (нөөц .berx-backup-*)"
  Restart-Service $svc.Name; Start-Sleep 3; Ok "$($svc.Name) дахин асаалаа (энэ нь зөвхөн DB service, CS2 биш)"
}

Step 'Шалгалт'
$listen = Get-NetTCPConnection -LocalPort 3306 -State Listen -ErrorAction SilentlyContinue
if (-not $listen) { Bad '3306 дээр сонсохгүй байна'; exit 1 }
foreach ($l in $listen) { if ($l.LocalAddress -in '127.0.0.1', '::1') { Ok "3306 → $($l.LocalAddress)" } else { Bad "3306 → $($l.LocalAddress) (гаднаас хүрэх боломжтой!)"; exit 1 } }
$fw = Get-NetFirewallPortFilter -Protocol TCP -ErrorAction SilentlyContinue | Where-Object { $_.LocalPort -eq '3306' } | Get-NetFirewallRule -ErrorAction SilentlyContinue | Where-Object { $_.Enabled -eq 'True' -and $_.Direction -eq 'Inbound' -and $_.Action -eq 'Allow' }
if ($fw) { Warn "Firewall-д 3306 inbound ALLOW дүрэм: $($fw.DisplayName -join ', ') — устгахыг зөвлөе: Remove-NetFirewallRule -DisplayName '<нэр>'" } else { Ok 'Firewall-д 3306 нээх дүрэм алга' }
if (Find-MysqlClient) { Ok "mysql.exe: $(Find-MysqlClient)" } else { Warn 'mysql.exe client олдсонгүй (PATH-д нэмнэ үү)' }
Write-Host "`nДараагийн алхам: 04-configure-db.ps1" -ForegroundColor Cyan
