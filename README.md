# 🟢 WHA-BOT — TH-WHATS

<div align="center">

**Cliente profesional de WhatsApp Business para Windows**  
Desarrollado por [Tunerhouse](https://github.com/danzeitgeist23)

[![Electron](https://img.shields.io/badge/Electron-28.x-47848F?style=flat&logo=electron&logoColor=white)](https://electronjs.org)
[![Node.js](https://img.shields.io/badge/Node.js-18+-339933?style=flat&logo=node.js&logoColor=white)](https://nodejs.org)
[![WhatsApp Web](https://img.shields.io/badge/whatsapp--web.js-1.23-25D366?style=flat&logo=whatsapp&logoColor=white)](https://github.com/pedroslopez/whatsapp-web.js)
[![License](https://img.shields.io/badge/License-MIT-blue?style=flat)](LICENSE)
[![Version](https://img.shields.io/badge/version-1.2.0-green?style=flat)]()

</div>

---

## 📋 ¿Qué es WHA-BOT?

**WHA-BOT (TH-WHATS)** es una aplicación de escritorio Windows que actúa como cliente profesional de **WhatsApp Business**. Permite gestionar conversaciones, programar envíos, usar plantillas de mensajes y automatizar comunicaciones con clientes — **sin depender de la API oficial de WhatsApp Business** (que requiere aprobación y es de pago).

> Ideal para talleres mecánicos, clínicas, comercios, agencias y cualquier negocio que gestione clientes por WhatsApp desde el ordenador.

---

## ✨ Features

| Categoría | Feature | Estado |
|-----------|---------|--------|
| **Conexión** | Autenticación QR con timeout 90s + auto-retry | ✅ |
| **Conexión** | Log de diagnóstico en tiempo real en la UI | ✅ |
| **Conexión** | Forzar Chromium interno (evita problemas con Chrome/Edge) | ✅ |
| **Chats** | Lista de conversaciones ordenada por último mensaje | ✅ |
| **Chats** | Filtros: Todos / No leídos / Grupos | ✅ |
| **Chats** | Búsqueda de contactos en tiempo real | ✅ |
| **Mensajes** | Enviar/recibir texto, imágenes, audio, vídeo, documentos | ✅ |
| **Mensajes** | Responder citando (quote/reply) | ✅ |
| **Mensajes** | Ticks de estado en tiempo real (✓ ✓✓ ✓✓azul) | ✅ |
| **Mensajes** | Eliminar mensaje real en WhatsApp | ✅ |
| **Mensajes** | Menú contextual click derecho | ✅ |
| **Mensajes** | Buscar dentro de una conversación | ✅ |
| **Media** | Pegar imagen desde portapapeles (Ctrl+V) | ✅ |
| **Media** | Grabación de nota de voz desde la app | ✅ |
| **Media** | Lightbox para ver imágenes a pantalla completa | ✅ |
| **Plantillas** | Plantillas con variables `{{nombre}}`, `{{fecha}}`, `{{hora}}`... | ✅ |
| **Plantillas** | Crear, editar, categorizar y previsualizar plantillas | ✅ |
| **Scheduler** | Programar mensajes con fecha específica o retardo aleatorio | ✅ |
| **Scheduler** | Mensajes programados persistentes (sobreviven reinicios) | ✅ |
| **Contactos** | Panel info del contacto (foto, bio, número) | ✅ |
| **Export** | Exportar conversación a TXT o JSON | ✅ |
| **Sistema** | Notificaciones nativas Windows al recibir mensajes | ✅ |
| **Sistema** | Historial de mensajes persistente en JSON local | ✅ |
| **Sistema** | Icono en bandeja del sistema | ✅ |
| **Build** | Generador de instalador `.exe` (NSIS + portable) | ✅ |

---

## 🚀 Instalación y Uso

### Requisitos
- Windows 10/11 (64-bit)
- [Node.js v18+](https://nodejs.org) instalado
- [Git para Windows](https://git-scm.com/download/win) (para clonar el repo)
- Chrome, Edge o Brave instalado en el sistema

### Pasos

**1. Clonar el repositorio**

Abre **CMD** (no PowerShell) y ejecuta:
```cmd
git clone https://github.com/danzeitgeist23-cmyk/WHA-BOT.git
cd WHA-BOT
```

**2. Instalar dependencias**

> ⚠️ **Importante:** Usar **CMD**, no PowerShell.  
> PowerShell tiene la ejecución de scripts deshabilitada por defecto y bloqueará `npm`.

```cmd
set PUPPETEER_SKIP_DOWNLOAD=true
npm install
```

El flag `PUPPETEER_SKIP_DOWNLOAD=true` es necesario para evitar que Puppeteer intente descargar Chromium (la app usa Chrome/Edge del sistema).

Si la carpeta `.cache\puppeteer\chrome` ya existe y da error, límpiala primero:
```cmd
rmdir /s /q "%USERPROFILE%\.cache\puppeteer\chrome"
```

**3. Arrancar la app**

```cmd
npm start
```

**Primera vez:**
1. **Desmarca** "Forzar Chromium interno" (usa el Chrome/Edge del sistema)
2. Clic en **"Conectar WhatsApp"**
3. Escanear el QR desde tu móvil → WhatsApp → Dispositivos vinculados → Vincular dispositivo
4. ¡Listo! La sesión se guarda para futuras conexiones

---

## 🔧 Solución de problemas

### `Cannot find module 'whatsapp-web.js'`

Las dependencias npm no están instaladas. Ejecuta en CMD:
```cmd
cd "ruta\al\proyecto\WHA-BOT"
set PUPPETEER_SKIP_DOWNLOAD=true
npm install
```

### Puppeteer falla al descargar Chrome durante `npm install`

```
npm error Error: ERROR: Failed to set up chrome v147.x.x
```

Solución:
```cmd
rmdir /s /q "%USERPROFILE%\.cache\puppeteer\chrome\win64-147.0.7727.57"
set PUPPETEER_SKIP_DOWNLOAD=true
npm install
```

### `npm` no funciona en PowerShell

PowerShell bloquea scripts `.ps1`. Usa **CMD** en su lugar, o ejecuta esto en PowerShell como Administrador:
```powershell
Set-ExecutionPolicy -ExecutionPolicy RemoteSigned -Scope CurrentUser
```

### App se queda en "Iniciando conexión..." sin QR

```
✅ Solución:
1. Desmarca "Forzar Chromium interno" (usa Edge/Chrome del sistema)
2. Haz clic en "Mostrar log" para ver el diagnóstico en tiempo real
3. Si tienes Chrome/Edge instalado, la conexión debería iniciarse en ~30s
```

### Botones de la UI no responden (onclick no funciona)

Si actualizas el proyecto manualmente y los botones dejan de funcionar, verifica que en `src/frontend/index.html` el CSP incluya `'unsafe-inline'` en `script-src`:
```html
content="default-src 'self'; script-src 'self' 'unsafe-inline'; ..."
```

### Otros errores comunes

| Error | Causa | Solución |
|-------|-------|---------|
| `Cannot find module 'electron'` | Electron no descargado | `npm install` de nuevo |
| `Cannot find module 'whatsapp-web.js'` | npm install incompleto | `set PUPPETEER_SKIP_DOWNLOAD=true` + `npm install` |
| `browser is already running` | Sesión bloqueada | La app lo resuelve automáticamente al reiniciar |
| Botones no responden | CSP bloqueando inline handlers | Añadir `'unsafe-inline'` al `script-src` del CSP |

---

## 📦 Generar instalador .exe

```bash
# Doble click en build.bat
# o desde terminal:
npm run build
```

Genera en `dist/`:
- `TH-WHATS Setup 1.2.0.exe` — instalador con NSIS
- `TH-WHATS-1.2.0-portable.exe` — versión portable sin instalación

---

## 🏗️ Arquitectura

```
Flujo de datos:
Frontend (index.html + app.js)
    ↕ window.thwhats.* (API expuesta)
preload.js (contextBridge — seguridad Electron)
    ↕ ipcRenderer.invoke / ipcMain.handle
main.js (proceso principal Electron)
    ↕ require()
src/backend/
    ├── whatsapp.js   → Puppeteer → Chrome/Edge → WhatsApp Web
    ├── scheduler.js  → setTimeout + persistencia JSON
    ├── database.js   → historial mensajes JSON
    └── templates.js  → CRUD plantillas + variables
```

### Stack tecnológico

| Capa | Tecnología | Versión |
|------|-----------|---------|
| Desktop | Electron | ^28.3.3 |
| Backend | Node.js | 18+ |
| WhatsApp | whatsapp-web.js | ^1.23.0 |
| Browser | Puppeteer (incluido) | — |
| QR Code | qrcode | ^1.5.3 |
| Frontend | HTML5 + CSS3 + JS Vanilla | — |
| Persistencia | JSON con fs nativo | — |
| Empaquetado | electron-builder | ^24.9.1 |

---

## 📁 Estructura del proyecto

```
WHA-BOT/
├── main.js              # Proceso principal + todos los IPC handlers
├── preload.js           # contextBridge (seguridad)
├── package.json         # Dependencias + config electron-builder
├── install.bat          # Instalador Windows
├── start.bat            # Script de arranque
├── fix-electron.bat     # Reparar descarga de Electron
├── build.bat            # Generar instalador .exe
├── src/
│   ├── backend/
│   │   ├── whatsapp.js  # Cliente WhatsApp (fix P0 aplicado)
│   │   ├── scheduler.js # Motor de programación persistente
│   │   ├── database.js  # Historial JSON local
│   │   └── templates.js # Plantillas con variables
│   └── frontend/
│       ├── index.html   # UI completa
│       ├── app.js       # Lógica frontend (~1400 líneas)
│       └── styles.css   # Dark theme completo
└── assets/
    ├── tray-icon.png    # Icono 256x256 PNG
    └── tray-icon.ico    # Icono ICO para el .exe
```

---

## 🗺️ Roadmap

- [ ] Multi-cuenta (varias sesiones WhatsApp simultáneas)
- [ ] Bot de respuestas automáticas con palabras clave
- [ ] Campañas masivas con delay anti-spam
- [ ] Dashboard de estadísticas (mensajes enviados/recibidos)
- [ ] Auto-updater para nuevas versiones
- [ ] Modo multi-idioma (ES/EN/PT)

---

## ⚠️ Aviso Legal

Este proyecto usa **whatsapp-web.js**, que automatiza WhatsApp Web mediante Puppeteer. No está afiliado ni aprobado por WhatsApp/Meta. Úsalo bajo tu propia responsabilidad y respetando los [Términos de Servicio de WhatsApp](https://www.whatsapp.com/legal/terms-of-service).

---

## 📄 Licencia

MIT © 2026 [Tunerhouse](https://github.com/danzeitgeist23)

---

<div align="center">
  <sub>Desarrollado con ❤️ por Tunerhouse | Powered by whatsapp-web.js + Electron</sub>
</div>
