@echo off
chcp 65001 >nul
REM BERX ARENA — CS2 сервер асаах
REM CS2_DIR-ээ доор зөв зааж өг. -usercon нь RCON-д ЗААВАЛ хэрэгтэй.
set CS2_DIR=C:\cs2-server
REM Steam Game Server Login Token (https://steamcommunity.com/dev/managegameservers, App ID 730).
REM Token байхгүй бол зөвхөн LAN/шууд IP-ээр холбогдоно; найзууд интернетээр орохын тулд оруулахыг зөвлөе.
set GSLT=

cd /d "%CS2_DIR%\game\bin\win64"
if "%GSLT%"=="" (
  cs2.exe -dedicated -usercon -console -port 27015 -maxplayers 12 +map de_mirage +exec server.cfg
) else (
  cs2.exe -dedicated -usercon -console -port 27015 -maxplayers 12 +sv_setsteamaccount %GSLT% +map de_mirage +exec server.cfg
)
