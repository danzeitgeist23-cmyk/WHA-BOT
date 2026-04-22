/**
 * TH-WHATS — src/backend/scheduler.js
 * Motor de programación de mensajes via setTimeout
 * Persiste los mensajes programados en JSON para que sobrevivan reinicios
 */

'use strict';

const path = require('path');
const fs   = require('fs');

// Se asigna desde main.js
let mainWindow = null;
let whatsapp   = null;

// Lista de mensajes programados { id, chatId, body, scheduledAt, delay, timer }
let scheduled  = [];
let schedFile  = null;

/** Inicializar con referencia a la ventana */
function setWindow(win) {
  mainWindow = win;
  // Cargar whatsapp aquí para evitar circular require
  whatsapp   = require('./whatsapp');
}

/** Inicializar con ruta de datos */
function init(userDataPath) {
  schedFile = path.join(userDataPath, 'th-whats-scheduled.json');
  _load();
  _restoreTimers();
}

function _load() {
  if (!schedFile || !fs.existsSync(schedFile)) return;
  try {
    const data = JSON.parse(fs.readFileSync(schedFile, 'utf8'));
    // Solo cargar los que aún no han pasado
    const now = Date.now();
    scheduled = data.filter(s => s.scheduledAt > now);
  } catch {
    scheduled = [];
  }
}

function _flush() {
  if (!schedFile) return;
  try {
    const toSave = scheduled.map(({ timer, ...rest }) => rest);
    fs.writeFileSync(schedFile, JSON.stringify(toSave, null, 2), 'utf8');
  } catch {}
}

/** Restaurar timers al arrancar (mensajes que sobrevivieron al reinicio) */
function _restoreTimers() {
  const now = Date.now();
  scheduled.forEach(s => {
    const delay = Math.max(0, s.scheduledAt - now);
    s.timer = setTimeout(() => _fire(s.id), delay);
  });
}

function _send(msg, channel, data) {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(channel, data);
  }
}

async function _fire(id) {
  const item = scheduled.find(s => s.id === id);
  if (!item) return;

  try {
    await whatsapp.sendMessage(item.chatId, item.body);
    _send(null, 'scheduled:sent', {
      id:      item.id,
      to:      item.chatId,
      toName:  item.chatName || item.chatId,
      message: item.body,
      sentAt:  Date.now(),
    });
  } catch (e) {
    _send(null, 'scheduled:failed', {
      id:    item.id,
      to:    item.chatId,
      error: e.message,
    });
  }

  // Eliminar de la lista
  scheduled = scheduled.filter(s => s.id !== id);
  _flush();
}

/**
 * Programar un mensaje
 * @param {object} opts - { chatId, chatName, body, scheduledAt, delay }
 *   scheduledAt: timestamp ms absoluto
 *   delay: ms de retardo aleatorio máx (opcional)
 * @returns {string} id del mensaje programado
 */
function schedule({ chatId, chatName = '', body, scheduledAt, delay = 0 }) {
  const id    = `sched_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const jitter = delay > 0 ? Math.floor(Math.random() * delay) : 0;
  const fireAt = (scheduledAt || Date.now()) + jitter;
  const ms    = Math.max(0, fireAt - Date.now());

  const item = {
    id,
    chatId,
    chatName,
    body,
    scheduledAt: fireAt,
    createdAt:   Date.now(),
    delay:       jitter,
    timer:       null,
  };

  item.timer = setTimeout(() => _fire(id), ms);
  scheduled.push(item);
  _flush();
  return id;
}

/** Cancelar un mensaje programado */
function cancel(id) {
  const item = scheduled.find(s => s.id === id);
  if (!item) throw new Error(`Mensaje programado no encontrado: ${id}`);
  if (item.timer) clearTimeout(item.timer);
  scheduled = scheduled.filter(s => s.id !== id);
  _flush();
}

/** Obtener todos los mensajes programados pendientes */
function getAll() {
  return scheduled.map(({ timer, ...rest }) => rest);
}

module.exports = { setWindow, init, schedule, cancel, getAll };
