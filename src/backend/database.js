/**
 * TH-WHATS — src/backend/database.js
 * Persistencia JSON pura con fs nativo
 * Guarda: mensajes por chat, configuración, historial
 */

'use strict';

const path = require('path');
const fs   = require('fs');

let dataDir = null;
let msgFile = null;
let msgData = {};   // { [chatId]: [msg, ...] }

function init(userDataPath) {
  dataDir = userDataPath;
  msgFile = path.join(dataDir, 'th-whats-messages.json');

  if (fs.existsSync(msgFile)) {
    try {
      msgData = JSON.parse(fs.readFileSync(msgFile, 'utf8'));
    } catch {
      msgData = {};
    }
  }
}

function flush() {
  if (!msgFile) return;
  try {
    fs.writeFileSync(msgFile, JSON.stringify(msgData), 'utf8');
  } catch (e) {
    console.error('[DB] flush error:', e.message);
  }
}

/** Guardar un mensaje en el historial local del chat */
function saveMessage(chatId, msg) {
  if (!msgData[chatId]) msgData[chatId] = [];
  // Evitar duplicados por ID
  const idx = msgData[chatId].findIndex(m => m.id === msg.id);
  if (idx === -1) {
    msgData[chatId].push(msg);
    // Mantener máx 500 mensajes por chat
    if (msgData[chatId].length > 500) {
      msgData[chatId] = msgData[chatId].slice(-500);
    }
  } else {
    // Actualizar (ej: ACK cambió)
    msgData[chatId][idx] = { ...msgData[chatId][idx], ...msg };
  }
  flush();
}

/** Obtener mensajes de un chat (ordenados por timestamp) */
function getMessages(chatId, limit = 100) {
  const msgs = msgData[chatId] || [];
  return msgs
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-limit);
}

/** Eliminar mensajes de un chat del historial local */
function clearChat(chatId) {
  delete msgData[chatId];
  flush();
}

/** Actualizar ACK de un mensaje */
function updateAck(chatId, msgId, ack) {
  if (!msgData[chatId]) return;
  const msg = msgData[chatId].find(m => m.id === msgId);
  if (msg) {
    msg.ack = ack;
    flush();
  }
}

/** Buscar en mensajes locales */
function searchMessages(chatId, query) {
  const msgs = msgData[chatId] || [];
  const q = query.toLowerCase();
  return msgs.filter(m => (m.body || '').toLowerCase().includes(q));
}

module.exports = { init, saveMessage, getMessages, clearChat, updateAck, searchMessages };
