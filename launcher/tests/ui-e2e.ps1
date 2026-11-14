# BERX ARENA Launcher — UI end-to-end тест (тусгаарласан орчин; production сервер, WireGuard хөндөхгүй)
# EXE-г --start ... --stop-after горимоор ажиллуулж, бодит ONLINE болж байгаа эсэх, скриншотыг шалгана.
param([string]$Exe = "$PSScriptRoot\..\dist\BERX ARENA Launcher.exe", [string]$Out = "$PSScriptRoot\..\shots")
$ErrorActionPreference = 'Stop'
$node = (Get-Command node).Source
$root = Join-Path $env:TEMP ("berx-ui-" + [guid]::NewGuid().ToString('N').Substring(0, 8))
$fx = Join-Path $PSScriptRoot 'BerxLauncher.Tests\fixtures'
$srvDir = Join-Path $root 'cs2-server\game\bin\win64'
$gameDir = Join-Path $root 'Steam\steamapps\common\Counter-Strike Global Offensive\game\bin\win64'
$agentDir = Join-Path $root 'berx-cs2-crew-main\agent'
New-Item -ItemType Directory -Force $srvDir, $gameDir, $agentDir, $Out | Out-Null
Copy-Item $node (Join-Path $srvDir 'cs2.exe'); Copy-Item $node (Join-Path $gameDir 'cs2.exe')
Copy-Item "$PSScriptRoot\..\..\agent\berx-agent.js" $agentDir
function FreePort { $l = [Net.Sockets.TcpListener]::new([Net.IPAddress]::Loopback, 0); $l.Start(); $p = $l.LocalEndpoint.Port; $l.Stop(); $p }
$rcon = FreePort; $sitePort = FreePort; $ev = FreePort
$marker = Join-Path $root 'marker.txt'; $hb = Join-Path $root 'hb.txt'
@"
BERX_URL=http://127.0.0.1:$sitePort
SERVER_AGENT_SECRET=ui-e2e-secret-abcdefghijklmnopqrstu
RCON_HOST=127.0.0.1
RCON_PORT=$rcon
RCON_PASSWORD=ui-e2e-pass
PUBLIC_ADDRESS=203.0.113.9:27015
EVENTS_PORT=$ev
POLL_MS=2000
"@ | Set-Content (Join-Path $agentDir '.env') -Encoding utf8
$site = Start-Process $node -ArgumentList "`"$fx\fake-site.js`" $sitePort `"$hb`"" -PassThru -WindowStyle Hidden
$game = Start-Process (Join-Path $gameDir 'cs2.exe') -ArgumentList '-e "setInterval(function(){},1000)"' -PassThru -WindowStyle Hidden

$settings = [ordered]@{
  ServerExe = (Join-Path $srvDir 'cs2.exe'); ServerArgs = "`"$fx\fake-cs2.js`" $rcon ui-e2e-pass `"$marker`""
  AgentDir = $agentDir; NodePath = $node; ManageWireGuard = $false; TunnelName = 'BERX-ARENA'; VpsIp = '10.66.66.1'
  PublicAddress = '202.179.6.146:27015'; WebsiteUrl = 'https://berx-cs2-crew.vercel.app/#server'; RconTimeoutSec = 40; StopTimeoutSec = 15
}
$sp = Join-Path $root 'settings.json'; $settings | ConvertTo-Json | Set-Content $sp -Encoding utf8

$p = Start-Process $Exe -ArgumentList "--settings `"$sp`" --start --wait 60 --screenshot `"$Out\main.png`" --screenshot-settings `"$Out\settings.png`" --stop-after" -PassThru -Wait
$code = $p.ExitCode
$logDir = Join-Path $env:LOCALAPPDATA 'BERX ARENA Launcher\logs'
Write-Host "---- launcher.log"; Get-Content (Join-Path $logDir 'launcher.log') -Tail 40 -Encoding utf8
Write-Host "---- agent.log"; if (Test-Path (Join-Path $logDir 'agent.log')) { Get-Content (Join-Path $logDir 'agent.log') -Tail 15 -Encoding utf8 }
$gameAlive = -not $game.HasExited
$quit = (Test-Path $marker) -and ((Get-Content $marker -Raw) -match 'quit')
$leftover = Get-CimInstance Win32_Process | Where-Object { $_.ExecutablePath -like "$srvDir*" -or ($_.CommandLine -like '*berx-agent.js*') }
$secretLeak = Select-String -Path (Join-Path $logDir '*.log') -Pattern 'ui-e2e-pass|ui-e2e-secret' -Quiet
Stop-Process -Id $site.Id, $game.Id -Force -ErrorAction SilentlyContinue
Write-Host "exit=$code gameAlive=$gameAlive gracefulQuit=$quit leftover=$(@($leftover).Count) secretLeak=$secretLeak"
if ($code -ne 0 -or -not $gameAlive -or -not $quit -or @($leftover).Count -gt 0 -or $secretLeak) { Write-Host 'UI E2E FAILED' -ForegroundColor Red; exit 1 }
Write-Host 'UI E2E PASSED' -ForegroundColor Green
