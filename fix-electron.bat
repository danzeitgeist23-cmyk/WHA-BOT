@echo off
title TH-WHATS — Fix Electron
color 0E
echo.
echo  Reparando instalacion de Electron...
echo.

:: Borrar caché de electron
set ELECTRON_CACHE=%LOCALAPPDATA%\electron\Cache
if exist "%ELECTRON_CACHE%" (
    echo  Limpiando cache de Electron: %ELECTRON_CACHE%
    rmdir /s /q "%ELECTRON_CACHE%" 2>nul
)

:: Borrar node_modules de electron
if exist node_modules\electron (
    echo  Eliminando node_modules\electron...
    rmdir /s /q node_modules\electron 2>nul
)

:: Intentar reinstalar con diferentes mirrors
echo.
echo  Reinstalando Electron con mirror primario...
set ELECTRON_MIRROR=https://npmmirror.com/mirrors/electron/
npm install electron --save-dev

if errorlevel 1 (
    echo.
    echo  Mirror primario fallido. Probando mirror secundario...
    set ELECTRON_MIRROR=https://github.com/electron/electron/releases/download/
    npm install electron --save-dev
)

if errorlevel 1 (
    echo.
    echo  Probando instalacion directa de npm...
    set ELECTRON_MIRROR=
    npm install electron --save-dev --ignore-scripts
    node node_modules/electron/install.js
)

echo.
node -e "require('electron')" >nul 2>&1
if errorlevel 1 (
    color 0C
    echo  ERROR: No se pudo instalar Electron.
    echo  Soluciones manuales:
    echo    1. Descarga manualmente el zip de Electron desde:
    echo       https://github.com/electron/electron/releases
    echo    2. Extrae en node_modules\electron\dist\
    echo    3. Crea node_modules\electron\path.txt con el path al .exe
) else (
    color 0A
    echo  Electron reparado correctamente.
)
echo.
pause
