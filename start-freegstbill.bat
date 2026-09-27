@echo off
title SD Dynamics Server
cd /d "%~dp0"

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo Node.js not found. Run "Install SD Dynamics.bat" first.
    pause
    exit /b 1
)

if not exist "node_modules" (
    echo Installing dependencies...
    npm install
)

if not exist "dist\index.html" (
    echo Building application...
    npm run build
)

echo.
echo  Starting SD Dynamics...
echo  (Server will pick an available port automatically)
echo.

:: Start server in background, then wait for port file
start "" /b cmd /c "node server.js"

:: Wait for port.txt to be written
set RETRIES=0
:waitloop
if %RETRIES% geq 60 goto opendefault
timeout /t 1 /nobreak >nul
set /a RETRIES+=1
if not exist "data\port.txt" goto waitloop

:: Read the port
set /p ACTIVE_PORT=<data\port.txt

echo  SD Dynamics running at http://localhost:%ACTIVE_PORT%
echo  Press Ctrl+C to stop
echo.

start http://localhost:%ACTIVE_PORT%
goto waitforexit

:opendefault
echo  ERROR: data\port.txt not created. Server may have failed to start.
echo  Try:  node server.js
echo  from this folder, then open the URL it prints.
pause
goto waitforexit

:waitforexit
:: Keep window open so server keeps running
cmd /k
