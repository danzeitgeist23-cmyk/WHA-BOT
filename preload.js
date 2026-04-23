/**
 * TH-WHATS — preload.js
 * Puente seguro entre Electron main y el frontend (contextBridge)
 * contextIsolation: true — nodeIntegration: false
 */

'use strict';

const { contextBridge, ipcRenderer } = require('electron');

// ── Exponer API al frontend como window.thwhats ──────────────────────────────
contextBridge.exposeInMainWorld('thwhats', {

  // ── Configuración ──────────────────────────────────────────────────────
  getConfig:     ()       => ipcRenderer.invoke('get-config'),
  saveConfig:    (cfg)    => ipcRenderer.invoke('save-config', cfg),
  clearConfig:   ()       => ipcRenderer.invoke('clear-config'),

  // ── Sesión ────────────────────────────────────────────────────────────
  getSession:    ()       => ipcRenderer.invoke('get-session'),
  saveSession:   (data)   => ipcRenderer.invoke('save-session', data),

  // ── WhatsApp ──────────────────────────────────────────────────────────
  startWhatsApp:      (opts) => ipcRenderer.invoke('start-whatsapp', opts || {}),
  disconnectWhatsApp: ()     => ipcRenderer.invoke('disconnect-whatsapp'),

  // ── Mensajes ──────────────────────────────────────────────────────────
  sendMessage:   (chatId, body, quotedMsgId) =>
    ipcRenderer.invoke('send-message', { chatId, body, quotedMsgId }),
  deleteMessage: (msgId, everyone) =>
    ipcRenderer.invoke('delete-message', { msgId, everyone }),

  // ── Chats ─────────────────────────────────────────────────────────────
  getChats:      (limit)  => ipcRenderer.invoke('get-chats',    { limit }),
  getMessages:   (chatId, limit) =>
    ipcRenderer.invoke('get-messages', { chatId, limit }),
  search:        (query)  => ipcRenderer.invoke('search',       { query }),

  // ── Media ─────────────────────────────────────────────────────────────
  sendMedia:         (chatId, filePath, caption) =>
    ipcRenderer.invoke('send-media', { chatId, filePath, caption }),
  sendImageBuffer:   (chatId, base64, mimetype, caption) =>
    ipcRenderer.invoke('send-image-buffer', { chatId, base64, mimetype, caption }),
  getMedia:          (msgId) => ipcRenderer.invoke('get-media', { msgId }),
  getClipboardImage: ()      => ipcRenderer.invoke('get-clipboard-image'),

  // ── Archivos ──────────────────────────────────────────────────────────
  selectFile:    ()             => ipcRenderer.invoke('select-file'),
  saveFile:      (opts)         => ipcRenderer.invoke('save-file', opts),

  // ── Contactos ─────────────────────────────────────────────────────────
  getContactInfo: (contactId) => ipcRenderer.invoke('get-contact-info', { contactId }),
  getProfilePic:  (contactId) => ipcRenderer.invoke('get-profile-pic',  { contactId }),

  // ── Programación ──────────────────────────────────────────────────────
  scheduleMessage:   (opts) => ipcRenderer.invoke('schedule-message',  opts),
  cancelScheduled:   (id)   => ipcRenderer.invoke('cancel-scheduled',  { id }),
  getScheduled:      ()     => ipcRenderer.invoke('get-scheduled'),

  // ── Plantillas ────────────────────────────────────────────────────────
  getTemplates:    ()      => ipcRenderer.invoke('get-templates'),
  saveTemplate:    (t)     => ipcRenderer.invoke('save-template',  t),
  deleteTemplate:  (id)    => ipcRenderer.invoke('delete-template', { id }),
  processTemplate: (body, vars) =>
    ipcRenderer.invoke('process-template', { body, variables: vars }),

  // ── Historial / Export ────────────────────────────────────────────────
  saveMessageLocal:    (chatId, message) =>
    ipcRenderer.invoke('save-message-local', { chatId, message }),
  getMessageHistory:   (chatId, limit) =>
    ipcRenderer.invoke('get-message-history', { chatId, limit }),
  exportConversation:  (chatId, chatName, format) =>
    ipcRenderer.invoke('export-conversation', { chatId, chatName, format }),

  // ── Notificaciones nativas ────────────────────────────────────────────
  showNotification: (title, body, icon) =>
    ipcRenderer.invoke('show-notification', { title, body, icon }),

  // ── Info app ──────────────────────────────────────────────────────────
  getAppVersion: () => ipcRenderer.invoke('get-app-version'),

  // ── Listeners de eventos desde el backend ────────────────────────────
  on: (channel, callback) => {
    const allowed = [
      'whatsapp:qr', 'whatsapp:qr-expired', 'whatsapp:ready', 'whatsapp:message',
      'whatsapp:message-sent', 'whatsapp:disconnected', 'whatsapp:loading',
      'whatsapp:timeout', 'whatsapp:ack', 'connection:status',
      'scheduled:sent', 'scheduled:failed', 'wa:log',
    ];
    if (!allowed.includes(channel)) return;
    const sub = (_, ...args) => callback(...args);
    ipcRenderer.on(channel, sub);
    return () => ipcRenderer.removeListener(channel, sub);
  },

  once: (channel, callback) => {
    ipcRenderer.once(channel, (_, ...args) => callback(...args));
  },

  off: (channel, callback) => {
    ipcRenderer.removeListener(channel, callback);
  },
});
