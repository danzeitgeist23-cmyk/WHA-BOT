/**
 * TH-WHATS — src/backend/whatsapp.js
 * Cliente WhatsApp via whatsapp-web.js
 *
 * FIX P0:
 *   - Module.createRequire desde raíz del proyecto (evita fallo en Electron empaquetado)
 *   - Timeout de 90s con notificación al frontend
 *   - Forzar Chromium interno (flag --force-internal-chromium)
 *   - Auto-limpieza de sesión bloqueada ("browser is already running")
 *   - Logs detallados que se envían al frontend en tiempo real
 *   - Auto-retry de QR al expirar
 */

'use strict';

const path = require('path');
const fs   = require('fs');

// ── Resolver módulos desde la raíz del proyecto ─────────────────────────────
// Solución al bug de Module.createRequire en Electron empaquetado
const Module = require('module');
const ROOT = path.resolve(__dirname, '..', '..');
let rootRequire;
try {
  rootRequire = Module.createRequire(path.join(ROOT, 'package.json'));
} catch (e) {
  rootRequire = require; // fallback
}

let Client, LocalAuth, qrcode, app;
try {
  ({ Client, LocalAuth } = rootRequire('whatsapp-web.js'));
  qrcode = rootRequire('qrcode');
  ({ app } = require('electron'));
} catch (e) {
  // Si rootRequire falla, intentar require directo
  ({ Client, LocalAuth } = require('whatsapp-web.js'));
  qrcode = require('qrcode');
  ({ app } = require('electron'));
}

// ── Estado interno ───────────────────────────────────────────────────────────
let client         = null;
let mainWindow     = null;
let initTimeout    = null;
let qrRetryTimer   = null;
let isDestroying   = false;
let forceInternal  = false; // true = ignorar Chrome/Edge del sistema

// ── Helper: enviar evento al frontend con log ────────────────────────────────
function send(event, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(event, data);
  }
}

function log(msg, level = 'info') {
  const ts = new Date().toLocaleTimeString('es-ES');
  console.log(`[WA][${level.toUpperCase()}] ${msg}`);
  send('wa:log', { msg, level, ts });
}

// ── Detectar navegador del sistema (Chrome, Edge, Brave) ────────────────────
function findBrowser() {
  if (forceInternal) {
    log('Modo Chromium interno forzado activo', 'warn');
    return null;
  }

  const candidates = [];

  if (process.platform === 'win32') {
    const localApp  = process.env.LOCALAPPDATA || '';
    const progFiles = process.env.PROGRAMFILES  || 'C:\\Program Files';
    const progFilesX86 = process.env['PROGRAMFILES(X86)'] || 'C:\\Program Files (x86)';

    candidates.push(
      // Chrome
      path.join(localApp, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(progFiles, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      path.join(progFilesX86, 'Google', 'Chrome', 'Application', 'chrome.exe'),
      // Edge
      path.join(progFiles, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      path.join(progFilesX86, 'Microsoft', 'Edge', 'Application', 'msedge.exe'),
      // Brave
      path.join(localApp, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
      path.join(progFiles, 'BraveSoftware', 'Brave-Browser', 'Application', 'brave.exe'),
    );
  } else if (process.platform === 'darwin') {
    candidates.push(
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
      '/Applications/Brave Browser.app/Contents/MacOS/Brave Browser',
    );
  }

  for (const c of candidates) {
    if (fs.existsSync(c)) {
      log(`Navegador detectado: ${c}`, 'info');
      return c;
    }
  }

  log('No se encontró Chrome/Edge/Brave — usando Chromium interno (~170MB)', 'warn');
  return null;
}

// ── Ruta de sesión WhatsApp ──────────────────────────────────────────────────
function getSessionPath() {
  try {
    return path.join(app.getPath('userData'), 'whatsapp-session');
  } catch {
    return path.join(ROOT, '.wwebjs_auth');
  }
}

// ── Limpiar sesión bloqueada ─────────────────────────────────────────────────
function clearBrowserLock() {
  const sessionPath = getSessionPath();
  const lockFiles = [
    path.join(sessionPath, 'Default', 'SingletonLock'),
    path.join(sessionPath, 'SingletonLock'),
  ];
  let cleaned = false;
  for (const lf of lockFiles) {
    if (fs.existsSync(lf)) {
      try {
        fs.unlinkSync(lf);
        log(`Lock eliminado: ${lf}`, 'warn');
        cleaned = true;
      } catch (e) {
        log(`No se pudo eliminar lock: ${e.message}`, 'error');
      }
    }
  }
  return cleaned;
}

// ── Construir cliente ────────────────────────────────────────────────────────
function buildClient() {
  const executablePath = findBrowser();
  const sessionPath    = getSessionPath();

  log(`Inicializando cliente WA (sesión: ${sessionPath})`, 'info');

  const puppeteerArgs = [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--disable-dev-shm-usage',
    '--disable-accelerated-2d-canvas',
    '--no-first-run',
    '--no-zygote',
    '--disable-gpu',
    '--disable-extensions',
    '--disable-background-networking',
    '--disable-sync',
    '--metrics-recording-only',
    '--mute-audio',
  ];

  const puppeteerOpts = {
    headless:         true,
    args:             puppeteerArgs,
    defaultViewport:  null,
    timeout:          60000, // 60s para lanzar el navegador
  };

  if (executablePath) {
    puppeteerOpts.executablePath = executablePath;
  }

  return new Client({
    authStrategy: new LocalAuth({
      dataPath: sessionPath,
      clientId: 'th-whats-main',
    }),
    puppeteer: puppeteerOpts,
    webVersionCache: {
      type:     'local',
      path:     path.join(ROOT, '.wwebjs_cache'),
      strict:   false,
    },
    // Aumentar timeout de WA Web
    authTimeoutMs: 0,
    takeoverOnConflict: true,
    takeoverTimeoutMs: 10000,
  });
}

// ── Registrar eventos del cliente ────────────────────────────────────────────
function attachEvents(c) {

  c.on('loading_screen', (percent, message) => {
    log(`Cargando WhatsApp Web: ${percent}% — ${message}`, 'info');
    send('whatsapp:loading', { percent, message });
  });

  c.on('qr', async (qr) => {
    log('QR recibido — mostrando en pantalla', 'info');
    clearInitTimeout(); // Tenemos QR → cancelar timeout de arranque

    // Auto-expiración del QR a los 60s si no se escanea
    if (qrRetryTimer) clearTimeout(qrRetryTimer);
    qrRetryTimer = setTimeout(() => {
      log('QR expirado — reintentando...', 'warn');
      send('whatsapp:qr-expired', {});
    }, 60000);

    try {
      const dataUrl = await qrcode.toDataURL(qr, {
        errorCorrectionLevel: 'H',
        width: 300,
        margin: 2,
      });
      send('whatsapp:qr', { dataUrl });
    } catch (e) {
      log(`Error generando QR: ${e.message}`, 'error');
    }
  });

  c.on('authenticated', () => {
    log('Autenticado correctamente', 'info');
    if (qrRetryTimer) clearTimeout(qrRetryTimer);
    send('connection:status', { status: 'authenticated', message: 'Autenticado' });
  });

  c.on('auth_failure', (msg) => {
    log(`Fallo de autenticación: ${msg}`, 'error');
    send('connection:status', { status: 'auth_failure', message: msg });
  });

  c.on('ready', () => {
    const info = c.info;
    log(`Listo — conectado como ${info.pushname} (${info.wid.user})`, 'info');
    send('whatsapp:ready', {
      status: 'ready',
      info: {
        name:   info.pushname,
        number: info.wid.user,
        wid:    info.wid._serialized,
      },
    });
  });

  c.on('disconnected', (reason) => {
    log(`Desconectado: ${reason}`, 'warn');
    send('whatsapp:disconnected', { reason });
  });

  c.on('message', async (msg) => {
    let media = null;
    let mediaBase64 = null;
    let mediaMimetype = null;

    if (msg.hasMedia) {
      try {
        const m = await msg.downloadMedia();
        if (m) {
          media        = true;
          mediaBase64  = m.data;
          mediaMimetype = m.mimetype;
        }
      } catch { /* ignorar error de media */ }
    }

    send('whatsapp:message', {
      id:           msg.id._serialized,
      from:         msg.from,
      fromName:     msg.notifyName || msg._data?.notifyName || '',
      body:         msg.body,
      timestamp:    msg.timestamp,
      type:         msg.type,
      hasMedia:     msg.hasMedia,
      media:        mediaBase64,
      mimetype:     mediaMimetype,
      fromMe:       msg.fromMe,
      quotedMsg:    msg.hasQuotedMsg ? {
        id:   msg._data.quotedStanzaID,
        body: msg._data.quotedMsg?.body || '',
        from: msg._data.quotedParticipant || '',
      } : null,
      isGroup:      msg.from.endsWith('@g.us'),
      author:       msg._data?.author || null, // en grupos
    });
  });

  c.on('message_ack', (msg, ack) => {
    send('whatsapp:ack', { id: msg.id._serialized, ack });
  });

  c.on('message_create', (msg) => {
    if (msg.fromMe) {
      send('whatsapp:message-sent', {
        id:        msg.id._serialized,
        to:        msg.to,
        body:      msg.body,
        timestamp: msg.timestamp,
        fromMe:    true,
        ack:       msg.ack,
      });
    }
  });
}

// ── Timeout de inicialización ────────────────────────────────────────────────
function setInitTimeout() {
  clearInitTimeout();
  initTimeout = setTimeout(() => {
    log('TIMEOUT: No apareció QR en 90s — comprueba el navegador', 'error');
    send('whatsapp:timeout', {
      message: 'No se pudo iniciar WhatsApp en 90 segundos.\n\nPosibles causas:\n• El navegador no arrancó\n• Module.createRequire falló\n• Sesión bloqueada\n\nIntenta con "Forzar Chromium interno" o reinicia la app.',
    });
  }, 90000);
}

function clearInitTimeout() {
  if (initTimeout) {
    clearTimeout(initTimeout);
    initTimeout = null;
  }
}

// ── API pública ──────────────────────────────────────────────────────────────

/**
 * Iniciar cliente WhatsApp
 * @param {BrowserWindow} win  ventana Electron
 * @param {object} opts        { forceInternalChromium: bool }
 */
async function start(win, opts = {}) {
  mainWindow    = win;
  forceInternal = opts.forceInternalChromium || false;
  isDestroying  = false;

  if (client) {
    log('Cliente ya existe — destruyendo antes de reiniciar', 'warn');
    await stop();
  }

  // Limpiar posibles locks
  clearBrowserLock();

  try {
    log('Construyendo cliente...', 'info');
    client = buildClient();
    attachEvents(client);

    setInitTimeout();
    log('Llamando client.initialize()...', 'info');
    send('connection:status', { status: 'connecting', message: 'Iniciando conexión...' });

    await client.initialize();

  } catch (e) {
    clearInitTimeout();
    log(`Error en initialize(): ${e.message}`, 'error');

    if (e.message && e.message.includes('browser is already running')) {
      log('Sesión bloqueada detectada — limpiando y reintentando', 'warn');
      clearBrowserLock();
      send('connection:status', { status: 'retry', message: 'Sesión bloqueada. Reintentando...' });
      // Reintentar una vez
      setTimeout(() => start(win, opts), 2000);
    } else {
      send('whatsapp:timeout', {
        message: `Error al iniciar: ${e.message}\n\nIntenta con "Forzar Chromium interno".`,
      });
    }
  }
}

/** Desconectar y destruir cliente */
async function stop() {
  if (isDestroying) return;
  isDestroying = true;
  clearInitTimeout();
  if (qrRetryTimer) clearTimeout(qrRetryTimer);

  if (client) {
    try {
      await client.destroy();
      log('Cliente destruido correctamente', 'info');
    } catch (e) {
      log(`Error al destruir cliente: ${e.message}`, 'warn');
    }
    client = null;
  }
  isDestroying = false;
}

/** Enviar mensaje de texto (con optional quote) */
async function sendMessage(chatId, body, quotedMsgId = null) {
  if (!client) throw new Error('Cliente no inicializado');
  const opts = {};
  if (quotedMsgId) {
    try {
      const fetchedMsg = await client.getMessageById(quotedMsgId);
      if (fetchedMsg) opts.quotedMessageId = fetchedMsg.id._serialized;
    } catch { /* ignorar */ }
  }
  const msg = await client.sendMessage(chatId, body, opts);
  return { id: msg.id._serialized, timestamp: msg.timestamp };
}

/** Enviar archivo multimedia */
async function sendMedia(chatId, filePath, caption = '') {
  if (!client) throw new Error('Cliente no inicializado');
  const { MessageMedia } = rootRequire ? rootRequire('whatsapp-web.js') : require('whatsapp-web.js');
  const media = MessageMedia.fromFilePath(filePath);
  const msg   = await client.sendMessage(chatId, media, { caption });
  return { id: msg.id._serialized };
}

/** Enviar imagen desde buffer base64 (para paste desde portapapeles) */
async function sendImageBuffer(chatId, base64Data, mimetype = 'image/png', caption = '') {
  if (!client) throw new Error('Cliente no inicializado');
  const { MessageMedia } = rootRequire ? rootRequire('whatsapp-web.js') : require('whatsapp-web.js');
  const media = new MessageMedia(mimetype, base64Data, `image_${Date.now()}.png`);
  const msg   = await client.sendMessage(chatId, media, { caption });
  return { id: msg.id._serialized };
}

/** Obtener lista de chats */
async function getChats(limit = 60) {
  if (!client) throw new Error('Cliente no inicializado');
  const chats = await client.getChats();
  return chats.slice(0, limit).map(c => ({
    id:               c.id._serialized,
    name:             c.name,
    isGroup:          c.isGroup,
    unreadCount:      c.unreadCount,
    timestamp:        c.timestamp,
    lastMessage:      c.lastMessage ? {
      body:    c.lastMessage.body,
      type:    c.lastMessage.type,
      fromMe:  c.lastMessage.fromMe,
    } : null,
  }));
}

/** Obtener mensajes de un chat */
async function getMessages(chatId, limit = 50) {
  if (!client) throw new Error('Cliente no inicializado');
  const chat  = await client.getChatById(chatId);
  const msgs  = await chat.fetchMessages({ limit });

  return Promise.all(msgs.map(async msg => {
    let media = null;
    // Intentar cargar media si existe y es reciente (< 7 días)
    if (msg.hasMedia) {
      const ageMs = (Date.now() / 1000 - msg.timestamp) * 1000;
      if (ageMs < 7 * 24 * 3600 * 1000) {
        try {
          const m = await msg.downloadMedia();
          if (m) media = { data: m.data, mimetype: m.mimetype };
        } catch { /* ignorar */ }
      }
    }

    return {
      id:         msg.id._serialized,
      from:       msg.from,
      fromName:   msg.notifyName || msg._data?.notifyName || '',
      body:       msg.body,
      timestamp:  msg.timestamp,
      type:       msg.type,
      hasMedia:   msg.hasMedia,
      media:      media ? media.data : null,
      mimetype:   media ? media.mimetype : null,
      fromMe:     msg.fromMe,
      ack:        msg.ack,
      quotedMsg:  msg.hasQuotedMsg ? {
        id:   msg._data.quotedStanzaID,
        body: msg._data.quotedMsg?.body || '',
        from: msg._data.quotedParticipant || '',
      } : null,
      author:     msg._data?.author || null,
    };
  }));
}

/** Buscar contactos */
async function search(query) {
  if (!client) throw new Error('Cliente no inicializado');
  const contacts = await client.getContacts();
  const q = query.toLowerCase();
  return contacts
    .filter(c => !c.isMe && (
      (c.name || '').toLowerCase().includes(q) ||
      (c.number || '').includes(q) ||
      (c.pushname || '').toLowerCase().includes(q)
    ))
    .slice(0, 20)
    .map(c => ({
      id:       c.id._serialized,
      name:     c.name || c.pushname || c.number,
      number:   c.number,
      isBusiness: c.isBusiness || false,
    }));
}

/** Obtener info de contacto */
async function getContactInfo(contactId) {
  if (!client) throw new Error('Cliente no inicializado');
  try {
    const contact = await client.getContactById(contactId);
    const pic     = await contact.getProfilePicUrl().catch(() => null);
    return {
      id:         contact.id._serialized,
      name:       contact.name || contact.pushname || contact.number,
      number:     contact.number,
      about:      contact.about || '',
      pic:        pic || null,
      isBusiness: contact.isBusiness || false,
    };
  } catch (e) {
    return { id: contactId, name: contactId, number: '', about: '', pic: null };
  }
}

/** Descargar media de un mensaje por ID (para historial) */
async function getMedia(msgId) {
  if (!client) throw new Error('Cliente no inicializado');
  const msg   = await client.getMessageById(msgId);
  if (!msg || !msg.hasMedia) throw new Error('Sin media');
  const media = await msg.downloadMedia();
  return { data: media.data, mimetype: media.mimetype };
}

/** Eliminar mensaje de WhatsApp (real) */
async function deleteMessage(msgId, everyone = false) {
  if (!client) throw new Error('Cliente no inicializado');
  try {
    const msg = await client.getMessageById(msgId);
    if (msg) await msg.delete(everyone);
    return { success: true };
  } catch (e) {
    return { success: false, error: e.message };
  }
}

module.exports = {
  start,
  stop,
  sendMessage,
  sendMedia,
  sendImageBuffer,
  getChats,
  getMessages,
  search,
  getContactInfo,
  getMedia,
  deleteMessage,
};
