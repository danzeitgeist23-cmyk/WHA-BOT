@echo off
title TH-WHATS — Instalador
color 0A
echo.
echo  ████████╗██╗  ██╗      ██╗    ██╗██╗  ██╗ █████╗ ████████╗███████╗
echo     ██╔══╝██║  ██║      ██║    ██║██║  ██║██╔══██╗╚══██╔══╝██╔════╝
echo     ██║   ███████║█████╗██║ █╗ ██║███████║███████║   ██║   ███████╗
echo     ██║   ██╔══██║╚════╝██║███╗██║██╔══██║██╔══██║   ██║   ╚════██║
echo     ██║   ██║  ██║      ╚███╔███╔╝██║  ██║██║  ██║   ██║   ███████║
echo     ╚═╝   ╚═╝  ╚═╝       ╚══╝╚══╝ ╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝   ╚══════╝
echo.
echo  Cliente profesional WhatsApp Business — by Tunerhouse
echo  ─────────────────────────────────────────────────────
echo.

:: Verificar Node.js
echo [1/4] Verificando Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    color 0C
    echo  ERROR: Node.js no encontrado.
    echo  Descarga Node.js v18+ desde: https://nodejs.org
    echo.
    pause
    exit /b 1
)
for /f %%v in ('node --version') do set NODE_VER=%%v
echo  OK - Node.js %NODE_VER%
echo.

:: Verificar npm
echo [2/4] Verificando npm...
npm --version >nul 2>&1
if errorlevel 1 (
    color 0C
    echo  ERROR: npm no encontrado.
    pause
    exit /b 1
)
for /f %%v in ('npm --version') do set NPM_VER=%%v
echo  OK - npm %NPM_VER%
echo.

:: Instalar dependencias con mirrors alternativos
echo [3/4] Instalando dependencias (puede tardar 2-5 minutos)...
echo  Esto descargara Electron (~80MB) y whatsapp-web.js...
echo.

:: Intentar con mirror de Electron primero
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
npm install --prefer-offline 2>nul
if errorlevel 1 (
    echo  Reintentando con mirror alternativo...
    set ELECTRON_MIRROR=https://github.com/electron/electron/releases/download/
    npm install
)

if errorlevel 1 (
    color 0C
    echo.
    echo  ERROR en npm install. Posibles soluciones:
    echo   1. Revisa tu conexion a internet
    echo   2. Ejecuta fix-electron.bat
    echo   3. Borra node_modules y vuelve a intentarlo
    echo.
    pause
    exit /b 1
)

echo.
echo  OK - Dependencias instaladas
echo.

:: Verificar que Electron está disponible
echo [4/4] Verificando instalacion de Electron...
node -e "require('electron')" >nul 2>&1
if errorlevel 1 (
    echo  Electron no disponible — ejecutando fix-electron.bat...
    call fix-electron.bat
)

echo.
color 0A
echo  ╔══════════════════════════════════════════╗
echo  ║   INSTALACION COMPLETADA                ║
echo  ║   Ejecuta start.bat para iniciar la app ║
echo  ╚══════════════════════════════════════════╝
echo.
pause
