@echo off
title TH-WHATS — Build .exe
color 0B
echo.
echo  ╔════════════════════════════════════════════╗
echo  ║   TH-WHATS — Generar instalador .exe      ║
echo  ╚════════════════════════════════════════════╝
echo.

:: Verificar dependencias
if not exist node_modules (
    echo  Instalando dependencias primero...
    call install.bat
)

:: Verificar electron-builder
node -e "require('electron-builder')" >nul 2>&1
if errorlevel 1 (
    echo  Instalando electron-builder...
    npm install electron-builder --save-dev
)

:: Limpiar dist anterior
if exist dist (
    echo  Limpiando dist anterior...
    rmdir /s /q dist
)

echo.
echo  Construyendo .exe para Windows x64...
echo  (Puede tardar 3-10 minutos en el primer build)
echo.

npm run build

if errorlevel 1 (
    color 0C
    echo.
    echo  ERROR en el build. Revisa los errores de arriba.
    echo.
    echo  Soluciones comunes:
    echo    - npm run build:dir  (sin instalador, mas rapido)
    echo    - Verificar que assets/tray-icon.ico existe
    echo    - node_modules completo (npm install)
) else (
    color 0A
    echo.
    echo  ╔══════════════════════════════════════════════════╗
    echo  ║   BUILD EXITOSO                                  ║
    echo  ║   Archivos en: dist\                             ║
    echo  ║   - TH-WHATS Setup 1.2.0.exe  (instalador)     ║
    echo  ║   - TH-WHATS-1.2.0-portable.exe (portable)     ║
    echo  ╚══════════════════════════════════════════════════╝
)
echo.
pause
