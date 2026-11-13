@echo off
chcp 65001 >nul
REM BERX Agent асаах (Node.js 18+ хэрэгтэй: https://nodejs.org)
cd /d "%~dp0.."
where node >nul 2>nul || (echo Node.js суулгаагүй байна: https://nodejs.org & pause & exit /b 1)
if not exist ".env" (echo agent\.env алга. .env.example-г .env болгож хуулаад бөглө. & pause & exit /b 1)
:loop
node berx-agent.js
echo Agent зогслоо. 5 секундын дараа дахин асна... (Ctrl+C хаана)
timeout /t 5 >nul
goto loop
