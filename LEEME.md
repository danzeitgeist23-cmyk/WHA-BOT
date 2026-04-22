# TH-WHATS v1.2.0
**Cliente profesional WhatsApp Business — by Tunerhouse**

---

## INICIO RÁPIDO

```
1. Tener Node.js v18+ instalado (nodejs.org)
2. Doble click en install.bat
3. Doble click en start.bat
4. Click "Conectar WhatsApp"
5. Escanear QR desde WhatsApp > Dispositivos vinculados
```

---

## SOLUCIÓN BUG P0 — "Iniciando conexión..." sin QR

Si la app se queda colgada sin mostrar el QR:

1. **Activa "Forzar Chromium interno"** antes de conectar
2. Haz click en "Mostrar log" para ver el diagnóstico
3. Si aparece "browser is already running" → la app lo resuelve automáticamente
4. Timeout de 90s → mensaje de error con diagnóstico

---

## FEATURES IMPLEMENTADAS v1.2.0

| Feature | Estado |
|---|---|
| Autenticación QR con timeout y retry | ✅ |
| Lista chats con filtros (todos/no leídos/grupos) | ✅ |
| Mensajes texto + reply (quote) | ✅ |
| Enviar/ver imágenes, audio, vídeo, documentos | ✅ |
| Pegar imagen desde portapapeles (Ctrl+V) | ✅ NEW |
| Grabación nota de voz | ✅ NEW |
| Plantillas con variables {{nombre}}, {{fecha}}... | ✅ |
| Programar mensajes (fecha específica o retardo) | ✅ |
| Exportar conversación (TXT/JSON) | ✅ NEW |
| Filtros sidebar (no leídos, grupos) | ✅ NEW |
| Notificaciones nativas Windows | ✅ NEW |
| Búsqueda dentro de conversación | ✅ |
| Panel info del contacto | ✅ |
| Historial persistente (sobrevive reinicios) | ✅ NEW |
| Eliminar mensaje (real en WhatsApp) | ✅ FIXED |
| Menú contextual (responder, copiar, borrar) | ✅ |
| Ticks de estado en tiempo real (✓✓✓) | ✅ |
| Log de diagnóstico en pantalla de conexión | ✅ NEW |
| Emoji picker | ✅ |
| Icono en bandeja del sistema | ✅ |

---

## GENERAR INSTALADOR .exe

```
doble click en build.bat
→ genera dist/TH-WHATS Setup 1.2.0.exe
→ genera dist/TH-WHATS-1.2.0-portable.exe
```

Requiere: `npm install electron-builder --save-dev`

---

## ESTRUCTURA

```
th-whats/
├── main.js              # Proceso principal Electron + IPC handlers
├── preload.js           # contextBridge (seguridad)
├── package.json         # deps + electron-builder config
├── install.bat          # Instalador Windows
├── start.bat            # Arranque
├── fix-electron.bat     # Reparar Electron si no descarga
├── build.bat            # Generar .exe
├── src/
│   ├── backend/
│   │   ├── whatsapp.js  # Cliente WA (FIX P0 aplicado)
│   │   ├── scheduler.js # Programación mensajes persistente
│   │   ├── database.js  # Historial JSON persistente
│   │   └── templates.js # Plantillas con variables
│   └── frontend/
│       ├── index.html   # UI completa
│       ├── app.js       # Lógica frontend
│       └── styles.css   # Dark theme
└── assets/
    ├── tray-icon.png    # Icono 256x256 PNG
    └── tray-icon.ico    # Icono ICO para .exe (crear con convertidor)
```

---

## PRÓXIMOS PASOS

- [ ] Multi-cuenta (varias sesiones WhatsApp)
- [ ] Filtros avanzados en sidebar
- [ ] Auto-update del instalador
- [ ] Modo multi-idioma
- [ ] Backup/restore de sesión

---

*Generado por TH-WHATS dev — Tunerhouse 2026*
