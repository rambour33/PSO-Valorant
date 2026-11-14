@echo off
title PSO Valorant
echo.
echo  ====================================
echo   PSO Valorant
echo  ====================================
echo.
where node >nul 2>&1
if errorlevel 1 (
    echo [ERREUR] Node.js non installe. Telecharge sur https://nodejs.org
    pause & exit /b 1
)
node --version
if not exist "node_modules\" (
    echo Installation des dependances...
    npm install
)
set PORT=3004
start "" "http://localhost:%PORT%/control"
:loop
node server.js
if %errorlevel% == 0 (
    echo.
    echo  [PSO Valorant] Redemarrage...
    echo.
    goto loop
)
pause
