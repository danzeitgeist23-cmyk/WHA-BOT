/**
 * TH-WHATS — main.js
 * Proceso principal Electron + todos los IPC handlers
 */

'use strict';

const { app, BrowserWindow, ipcMain, Tray, Menu, nativeImage,
        dialog, Notification, clipboard, nativeTheme } = require('electron');
const path = require('path');
const fs   = require('fs');

const whatsapp  = require('./src/backend/whatsapp');
const scheduler = require('./src/backend/scheduler');
const database  = require('./src/backend/database');
const templates = require('./src/backend/templates');

// ── Persistencia simple (JSON) ───────────────────────────────────────────────
let _storePath = null;
let _storeData = {};

function storeInit() {
  _storePath = path.join(app.getPath('userData'), 'th-whats-store.json');
  try {
    if (fs.existsSync(_storePath))
      _storeData = JSON.parse(fs.readFileSync(_storePath, 'utf8'));
  } catch { _storeData = {}; }
}
function storeGet(key, def = null) {
  return _storeData[key] !== undefined ? _storeData[key] : def;
}
function storeSet(key, value) {
  _storeData[key] = value;
  try { fs.writeFileSync(_storePath, JSON.stringify(_storeData, null, 2), 'utf8'); } catch {}
}
function storeDel(key) {
  delete _storeData[key];
  try { fs.writeFileSync(_storePath, JSON.stringify(_storeData, null, 2), 'utf8'); } catch {}
}

// ── Ventanas ─────────────────────────────────────────────────────────────────
let mainWindow = null;
let tray       = null;

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width:            1280,
    height:           820,
    minWidth:         900,
    minHeight:        600,
    title:            'TH-WHATS',
    backgroundColor:  '#111b21',
    show:             false,
    autoHideMenuBar:  true,
    icon:             path.join(__dirname, 'assets', 'tray-icon.png'),
    webPreferences: {
      preload:          path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration:  false,
      spellcheck:       false,
    },
  });

  mainWindow.loadFile(path.join(__dirname, 'src', 'frontend', 'index.html'));

  mainWindow.once('ready-to-show', () => mainWindow.show());

  mainWindow.on('close', (event) => {
    if (!app.isQuiting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });

}

function createTray() {
  const iconPath = path.join(__dirname, 'assets', 'tray-icon.png');
  const icon = fs.existsSync(iconPath)
    ? nativeImage.createFromPath(iconPath).resize({ width: 16, height: 16 })
    : nativeImage.createEmpty();

  tray = new Tray(icon);
  tray.setToolTip('TH-WHATS');

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Abrir TH-WHATS', click: () => mainWindow?.show() },
    { type: 'separator' },
    { label: 'Salir', click: () => { app.isQuiting = true; app.quit(); } },
  ]);

  tray.setContextMenu(contextMenu);
  tray.on('click', () => {
    if (mainWindow) {
      mainWindow.isVisible() ? mainWindow.hide() : mainWindow.show();
    }
  });
}

// ── App lifecycle ─────────────────────────────────────────────────────────────
app.whenReady().then(() => {
  storeInit();
  database.init(app.getPath('userData'));
  templates.init(app.getPath('userData'));
  createMainWindow();                        // 1. Crear ventana primero
  scheduler.setWindow(mainWindow);           // 2. Pasar ventana al scheduler (FIX: orden correcto)
  scheduler.init(app.getPath('userData'));   // 3. Cargar mensajes persistidos
  createTray();
  registerIPC();
});

app.on('window-all-closed', () => {
  // No cerramos — el tray mantiene la app viva
});

app.on('before-quit', async () => {
  app.isQuiting = true;
  await whatsapp.stop();
});

// ── IPC Handlers ─────────────────────────────────────────────────────────────
function registerIPC() {

  // ── Configuración ────────────────────────────────────────────────────────
  ipcMain.handle('get-config', () => {
    return {
      forceInternalChromium: storeGet('forceInternalChromium', false),
      notificationsEnabled:  storeGet('notificationsEnabled',  true),
      soundEnabled:          storeGet('soundEnabled',          true),
      userName:              storeGet('userName',              ''),
    };
  });

  ipcMain.handle('save-config', (_, config) => {
    Object.keys(config).forEach(k => storeSet(k, config[k]));
    return { success: true };
  });

  ipcMain.handle('clear-config', () => {
    _storeData = {};
    try { fs.writeFileSync(_storePath, '{}', 'utf8'); } catch {}
    return { success: true };
  });

  // ── Sesión ────────────────────────────────────────────────────────────────
  ipcMain.handle('get-session', () => ({
    connected: storeGet('connected', false),
    userInfo:  storeGet('userInfo', null),
  }));

  ipcMain.handle('save-session', (_, data) => {
    storeSet('connected', data.connected);
    storeSet('userInfo',  data.userInfo);
    return { success: true };
  });

  // ── WhatsApp ──────────────────────────────────────────────────────────────
  ipcMain.handle('start-whatsapp', async (_, opts = {}) => {
    try {
      const forceInternalChromium = opts.forceInternalChromium
        || storeGet('forceInternalChromium', false);
      await whatsapp.start(mainWindow, { forceInternalChromium });
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('disconnect-whatsapp', async () => {
    try {
      await whatsapp.stop();
      storeSet('connected', false);
      storeSet('userInfo',  null);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // ── Mensajes ──────────────────────────────────────────────────────────────
  ipcMain.handle('send-message', async (_, { chatId, body, quotedMsgId }) => {
    try {
      const result = await whatsapp.sendMessage(chatId, body, quotedMsgId);
      // Guardar en historial local
      database.saveMessage(chatId, {
        id:        result.id,
        body,
        fromMe:    true,
        timestamp: result.timestamp || Math.floor(Date.now() / 1000),
        type:      'chat',
        ack:       1,
      });
      return { success: true, data: result };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('delete-message', async (_, { msgId, everyone }) => {
    try {
      const result = await whatsapp.deleteMessage(msgId, everyone);
      return result;
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // ── Chats ─────────────────────────────────────────────────────────────────
  ipcMain.handle('get-chats', async (_, { limit = 60 } = {}) => {
    try {
      const chats = await whatsapp.getChats(limit);
      return { success: true, data: chats };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('get-messages', async (_, { chatId, limit = 50, quotedMsg = false, ack = false }) => {
    try {
      const msgs = await whatsapp.getMessages(chatId, limit);
      // Merge con historial local si existe
      const localHistory = database.getMessages(chatId, 100);
      const mergedMap = new Map();
      // Primero historial local (más antiguo)
      localHistory.forEach(m => mergedMap.set(m.id, m));
      // Luego mensajes de WA (más reciente, sobreescribe)
      msgs.forEach(m => mergedMap.set(m.id, m));
      const merged = Array.from(mergedMap.values())
        .sort((a, b) => a.timestamp - b.timestamp);
      return { success: true, data: merged };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('search', async (_, { query }) => {
    try {
      const results = await whatsapp.search(query);
      return { success: true, data: results };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // ── Media ─────────────────────────────────────────────────────────────────
  ipcMain.handle('send-media', async (_, { chatId, filePath, caption }) => {
    try {
      const result = await whatsapp.sendMedia(chatId, filePath, caption);
      return { success: true, data: result };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('send-image-buffer', async (_, { chatId, base64, mimetype, caption }) => {
    try {
      const result = await whatsapp.sendImageBuffer(chatId, base64, mimetype, caption);
      return { success: true, data: result };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('get-media', async (_, { msgId }) => {
    try {
      const media = await whatsapp.getMedia(msgId);
      return { success: true, data: media };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // ── Portapapeles ──────────────────────────────────────────────────────────
  ipcMain.handle('get-clipboard-image', () => {
    try {
      const img = clipboard.readImage();
      if (img.isEmpty()) return { success: false, error: 'No hay imagen en portapapeles' };
      const base64 = img.toPNG().toString('base64');
      return { success: true, data: { base64, mimetype: 'image/png' } };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // ── Archivos ──────────────────────────────────────────────────────────────
  ipcMain.handle('select-file', async () => {
    const result = await dialog.showOpenDialog(mainWindow, {
      properties: ['openFile'],
      filters: [
        { name: 'Todos los archivos', extensions: ['*'] },
        { name: 'Imágenes', extensions: ['jpg', 'jpeg', 'png', 'gif', 'webp'] },
        { name: 'Documentos', extensions: ['pdf', 'doc', 'docx', 'xls', 'xlsx'] },
        { name: 'Audio', extensions: ['mp3', 'ogg', 'wav', 'aac', 'm4a'] },
        { name: 'Vídeo', extensions: ['mp4', 'avi', 'mov', 'mkv'] },
      ],
    });
    if (result.canceled) return { success: false };
    return { success: true, data: { filePath: result.filePaths[0] } };
  });

  ipcMain.handle('save-file', async (_, { defaultName, base64, mimetype }) => {
    const ext = (mimetype || '').split('/')[1] || 'bin';
    const result = await dialog.showSaveDialog(mainWindow, {
      defaultPath: defaultName || `archivo.${ext}`,
    });
    if (result.canceled) return { success: false };
    try {
      fs.writeFileSync(result.filePath, Buffer.from(base64, 'base64'));
      return { success: true, data: { filePath: result.filePath } };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // ── Contactos ─────────────────────────────────────────────────────────────
  ipcMain.handle('get-contact-info', async (_, { contactId }) => {
    try {
      const info = await whatsapp.getContactInfo(contactId);
      return { success: true, data: info };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // ── Programación ──────────────────────────────────────────────────────────
  ipcMain.handle('schedule-message', (_, { chatId, body, scheduledAt, delay }) => {
    try {
      const id = scheduler.schedule({ chatId, body, scheduledAt, delay });
      return { success: true, data: { id } };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('cancel-scheduled', (_, { id }) => {
    try {
      scheduler.cancel(id);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('get-scheduled', () => {
    return { success: true, data: scheduler.getAll() };
  });

  // ── Plantillas ────────────────────────────────────────────────────────────
  ipcMain.handle('get-templates', () => {
    return { success: true, data: templates.getAll() };
  });

  ipcMain.handle('save-template', (_, { id, name, body, category }) => {
    try {
      const t = templates.save({ id, name, body, category });
      return { success: true, data: t };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('delete-template', (_, { id }) => {
    try {
      templates.remove(id);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('process-template', (_, { body, variables }) => {
    try {
      const processed = templates.process(body, variables);
      return { success: true, data: processed };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // ── Historial persistente ─────────────────────────────────────────────────
  ipcMain.handle('save-message-local', (_, { chatId, message }) => {
    try {
      database.saveMessage(chatId, message);
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('get-message-history', (_, { chatId, limit = 100 }) => {
    try {
      const msgs = database.getMessages(chatId, limit);
      return { success: true, data: msgs };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  ipcMain.handle('export-conversation', async (_, { chatId, chatName, format = 'txt' }) => {
    try {
      const msgs = database.getMessages(chatId, 10000);
      let content = '';

      if (format === 'txt') {
        content = msgs.map(m => {
          const d = new Date(m.timestamp * 1000).toLocaleString('es-ES');
          const who = m.fromMe ? 'Yo' : (m.fromName || m.from);
          const body = m.type === 'chat' ? m.body : `[${m.type}]`;
          return `[${d}] ${who}: ${body}`;
        }).join('\n');
      } else if (format === 'json') {
        content = JSON.stringify(msgs, null, 2);
      }

      const ext = format;
      const result = await dialog.showSaveDialog(mainWindow, {
        defaultPath: `${chatName || chatId}_conversacion.${ext}`,
        filters: [{ name: format.toUpperCase(), extensions: [ext] }],
      });
      if (result.canceled) return { success: false };
      fs.writeFileSync(result.filePath, content, 'utf8');
      return { success: true, data: { filePath: result.filePath } };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // ── Notificaciones nativas ────────────────────────────────────────────────
  ipcMain.handle('show-notification', (_, { title, body, icon }) => {
    try {
      if (!storeGet('notificationsEnabled', true)) return { success: false };
      if (!Notification.isSupported()) return { success: false, error: 'No soportado' };
      const notif = new Notification({
        title,
        body,
        icon: icon || path.join(__dirname, 'assets', 'tray-icon.png'),
        silent: !storeGet('soundEnabled', true),
      });
      notif.on('click', () => mainWindow?.show());
      notif.show();
      return { success: true };
    } catch (e) {
      return { success: false, error: e.message };
    }
  });

  // ── Info del sistema ──────────────────────────────────────────────────────
  ipcMain.handle('get-app-version', () => ({
    version:  app.getVersion(),
    platform: process.platform,
    arch:     process.arch,
    electron: process.versions.electron,
    node:     process.versions.node,
  }));
}
