@echo off
cd /d "%~dp0"

echo Starting Gathering Moss Financial Center...

:: Check if server is already running on port 3001
powershell -Command "if ((Get-NetTCPConnection -LocalPort 3001 -ErrorAction SilentlyContinue)) { exit 0 } else { exit 1 }"
if %ERRORLEVEL% NEQ 0 (
    start "" /b node server/index.js
    timeout /t 2 /nobreak >nul
)

:: Open browser
start http://localhost:3001
