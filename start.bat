@echo off
title TH-WHATS
color 0A

:: Verificar que node_modules existe
if not exist node_modules (
    echo  Dependencias no instaladas. Ejecutando install.bat...
    call install.bat
)

:: Verificar Electron
node -e "require('electron')" >nul 2>&1
if errorlevel 1 (
    echo  Electron no encontrado. Ejecutando fix-electron.bat...
    call fix-electron.bat
)

echo  Iniciando TH-WHATS...
npx electron .
