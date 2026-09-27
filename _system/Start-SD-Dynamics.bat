@echo off
cd /d "%~dp0"
where node >nul 2>nul || (echo Install Node from https://nodejs.org then re-run.& pause& exit /b 1)
if not exist node_modules call npm install
if not exist dist\index.html call npm run build
start "" /b cmd /c "node server.js"
timeout /t 4 /nobreak >nul
if exist data\port.txt (set /p P=<data\port.txt) else (set P=47371)
start http://localhost:%P%
echo Keep this window open while using the app.
cmd /k
