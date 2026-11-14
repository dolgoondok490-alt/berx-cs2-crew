# BERX ARENA Launcher — build
#   .\build.ps1              тест + build  →  dist\BERX ARENA Launcher.exe
#   .\build.ps1 -NoTest      зөвхөн build
#   .\build.ps1 -Shortcut    build + Desktop shortcut
param([switch]$NoTest, [switch]$Shortcut)
$ErrorActionPreference = 'Stop'
Set-Location $PSScriptRoot
if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
  Write-Host ".NET SDK суулгаагүй байна: https://dotnet.microsoft.com/download (SDK 8 эсвэл шинэ)" -ForegroundColor Red; exit 1
}
if (-not $NoTest) {
  dotnet test tests\BerxLauncher.Tests -c Release --nologo
  if ($LASTEXITCODE) { Write-Host "Тест амжилтгүй" -ForegroundColor Red; exit $LASTEXITCODE }
}
dotnet publish src\BerxLauncher\BerxLauncher.csproj -c Release -o dist --nologo
if ($LASTEXITCODE) { exit $LASTEXITCODE }
Get-ChildItem dist -Exclude 'BERX ARENA Launcher.exe' | Remove-Item -Force -Recurse -ErrorAction SilentlyContinue
$exe = Join-Path $PSScriptRoot 'dist\BERX ARENA Launcher.exe'
Write-Host "`nEXE бэлэн: $exe" -ForegroundColor Green
if ($Shortcut) {
  $sh = New-Object -ComObject WScript.Shell
  $lnk = $sh.CreateShortcut((Join-Path ([Environment]::GetFolderPath('Desktop')) 'BERX ARENA Launcher.lnk'))
  $lnk.TargetPath = $exe; $lnk.WorkingDirectory = Split-Path $exe; $lnk.IconLocation = "$exe,0"; $lnk.Save()
  Write-Host "Desktop shortcut үүслээ" -ForegroundColor Green
}
