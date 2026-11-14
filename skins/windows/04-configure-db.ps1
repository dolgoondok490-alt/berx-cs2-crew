# 04 — DB, хязгаарлагдмал хэрэглэгчид, WeaponPaints schema; тохиргооны файлуудыг бэлтгэх
#   • berx_weaponpaints DB
#   • wp_plugin@localhost  : SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX (plugin хүснэгтээ өөрөө үүсгэдэг)
#   • berx_agent@localhost : SELECT, INSERT, UPDATE, DELETE (DROP/ALTER эрхгүй)
#   • skins\sql\weaponpaints-build-472-schema.sql (plugin-ийн өөрийн CREATE TABLE — IF NOT EXISTS)
#   • STAGING-д WeaponPaints.json (DB холболт) — game хавтсанд хуулахгүй
#   • agent\.env.skins ШИНЭЭР (байгаа бол хөндөхгүй), SKINS_SYNC_ENABLED=0. agent\.env-ийг ХӨНДӨХГҮЙ.
. "$PSScriptRoot\common.ps1"
Protect-Dir $BERX.WorkDir; Protect-Dir $BERX.SecretsDir
$rootCred = New-Object System.Management.Automation.PSCredential('root', (Read-Host 'MariaDB root нууц үг' -AsSecureString))

$secretsFile = Join-Path $BERX.SecretsDir 'db-users.json'
if (Test-Path $secretsFile) { $s = Get-Content $secretsFile -Raw | ConvertFrom-Json; $pluginPw = $s.plugin; $agentPw = $s.agent; Info 'Өмнө үүсгэсэн нууц үгийг ашиглана' }
else { $pluginPw = New-Secret; $agentPw = New-Secret; @{ plugin = $pluginPw; agent = $agentPw } | ConvertTo-Json | Set-Content $secretsFile -Encoding UTF8 }

Step 'DB + хэрэглэгчид'
$db = $BERX.DbName
$sql = @"
CREATE DATABASE IF NOT EXISTS ``$db`` CHARACTER SET utf8mb4 COLLATE utf8mb4_general_ci;
CREATE USER IF NOT EXISTS '$($BERX.DbPluginUser)'@'localhost' IDENTIFIED BY '$pluginPw';
CREATE USER IF NOT EXISTS '$($BERX.DbPluginUser)'@'127.0.0.1' IDENTIFIED BY '$pluginPw';
CREATE USER IF NOT EXISTS '$($BERX.DbAgentUser)'@'localhost' IDENTIFIED BY '$agentPw';
CREATE USER IF NOT EXISTS '$($BERX.DbAgentUser)'@'127.0.0.1' IDENTIFIED BY '$agentPw';
GRANT SELECT, INSERT, UPDATE, DELETE, CREATE, ALTER, INDEX ON ``$db``.* TO '$($BERX.DbPluginUser)'@'localhost', '$($BERX.DbPluginUser)'@'127.0.0.1';
GRANT SELECT, INSERT, UPDATE, DELETE ON ``$db``.* TO '$($BERX.DbAgentUser)'@'localhost', '$($BERX.DbAgentUser)'@'127.0.0.1';
FLUSH PRIVILEGES;
"@
Invoke-Mysql $rootCred $sql | Out-Null; Ok "DB $db, $($BERX.DbPluginUser), $($BERX.DbAgentUser)"

Step 'WeaponPaints schema (build-472)'
$schema = Get-Content (Join-Path $PSScriptRoot '..\sql\weaponpaints-build-472-schema.sql') -Raw
$pluginCred = New-DbCredential $BERX.DbPluginUser $pluginPw; $agentCred = New-DbCredential $BERX.DbAgentUser $agentPw
Invoke-Mysql $pluginCred $schema $db | Out-Null
$tables = Invoke-Mysql $agentCred "SHOW TABLES" $db
Ok "Хүснэгтүүд: $($tables -join ', ')"
foreach ($hostName in @('localhost', '127.0.0.1')) {
    $grants = @(Invoke-MySql $rootCred "SHOW GRANTS FOR 'berx_agent'@'$hostName'")

    $target = '`berx_agent`@`{0}`' -f $hostName

    $usage = '^GRANT USAGE ON \*\.\* TO ' +
        [regex]::Escape($target) +
        "(?: IDENTIFIED BY PASSWORD '[^']+')?$"

    $expected = 'GRANT SELECT, INSERT, UPDATE, DELETE ON `berx_weaponpaints`.* TO {0}' -f $target

    $usageRows = @($grants | Where-Object { $_ -cmatch $usage })

    if (
        $grants.Count -ne 2 -or
        $usageRows.Count -ne 1 -or
        $grants -cnotcontains $expected
    ) {
        throw "Unexpected database privileges for berx_agent@$hostName"
    }

    Ok "berx_agent@$hostName permissions OK"
}

Step 'Тохиргооны файлууд'
$cfgDir = Join-Path $BERX.StagingDir 'payload\addons\counterstrikesharp\configs\plugins\WeaponPaints'
New-Item -ItemType Directory -Force $cfgDir | Out-Null
$cfg = [ordered]@{
  ConfigVersion = 10; SkinsLanguage = 'en'
  DatabaseHost = '127.0.0.1'; DatabasePort = 3306; DatabaseUser = $BERX.DbPluginUser; DatabasePassword = $pluginPw; DatabaseName = $db
  CmdRefreshCooldownSeconds = 3; Website = 'berx-cs2-crew.vercel.app/#skins'; MenuType = 'selectable'
  Additional = [ordered]@{ KnifeEnabled = $true; GloveEnabled = $true; AgentEnabled = $true; SkinEnabled = $true; MusicEnabled = $false; PinsEnabled = $false
    CommandWpEnabled = $true; CommandKillEnabled = $false; GiveRandomKnife = $false; GiveRandomSkin = $false; ShowSkinImage = $true }
}
$cfg | ConvertTo-Json -Depth 4 | Set-Content (Join-Path $cfgDir 'WeaponPaints.json') -Encoding UTF8
Ok "Staging: $cfgDir\WeaponPaints.json (CommandWpEnabled=true — wp_refresh-д хэрэгтэй)"

$envSkins = Join-Path $BERX.AgentDir '.env.skins'
if (Test-Path $envSkins) { Info "agent\.env.skins аль хэдийн бий — хөндсөнгүй" }
else {
@"
# BERX SKIN INVENTORY — agent синк (04-configure-db.ps1 үүсгэв). agent\.env-ийг өөрчлөөгүй.
SKINS_SYNC_ENABLED=0
WP_DB_HOST=127.0.0.1
WP_DB_PORT=3306
WP_DB_NAME=$db
WP_DB_USER=$($BERX.DbAgentUser)
WP_DB_PASSWORD=$agentPw
SKINS_POLL_MS=10000
SKINS_REFRESH=1
"@ | Set-Content $envSkins -Encoding UTF8
  icacls $envSkins /inheritance:r /grant:r "$($env:USERNAME):(R,W)" "*S-1-5-32-544:F" "*S-1-5-18:F" | Out-Null
  Ok "agent\.env.skins үүслээ (SKINS_SYNC_ENABLED=0 — асаах нь README-ийн алхмаар)"
}
$rootCred = $null
Write-Host "`nНууц үгс: $secretsFile (зөвхөн таны хэрэглэгч уншина). Дараагийн алхам: 07-verify-schema.ps1" -ForegroundColor Cyan

