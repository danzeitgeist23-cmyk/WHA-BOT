/**
 * TH-WHATS — src/backend/templates.js
 * CRUD de plantillas + procesamiento de variables
 * Variables soportadas: {{nombre}}, {{fecha}}, {{hora}}, {{empresa}}, o cualquier custom
 */

'use strict';

const path = require('path');
const fs   = require('fs');

let tmplFile = null;
let tmplData = [];  // [{ id, name, body, category, createdAt }]

function init(userDataPath) {
  tmplFile = path.join(userDataPath, 'th-whats-templates.json');
  if (fs.existsSync(tmplFile)) {
    try {
      tmplData = JSON.parse(fs.readFileSync(tmplFile, 'utf8'));
    } catch {
      tmplData = [];
    }
  }
  // Plantillas de ejemplo si no hay ninguna
  if (tmplData.length === 0) {
    tmplData = [
      {
        id:        'tpl_welcome',
        name:      'Bienvenida',
        category:  'General',
        body:      'Hola {{nombre}}, ¡bienvenido/a a {{empresa}}! Estamos aquí para ayudarte. 😊',
        createdAt: Date.now(),
      },
      {
        id:        'tpl_reminder',
        name:      'Recordatorio de cita',
        category:  'Citas',
        body:      'Hola {{nombre}}, te recordamos tu cita el {{fecha}} a las {{hora}}. Confirma respondiendo OK.',
        createdAt: Date.now(),
      },
      {
        id:        'tpl_followup',
        name:      'Seguimiento',
        category:  'Ventas',
        body:      'Hola {{nombre}}, ¿pudiste revisar la información que te enviamos? Quedo atento/a.',
        createdAt: Date.now(),
      },
      {
        id:        'tpl_thanks',
        name:      'Gracias',
        category:  'General',
        body:      'Gracias {{nombre}} por confiar en nosotros. Ha sido un placer atenderte. 🙏',
        createdAt: Date.now(),
      },
    ];
    _flush();
  }
}

function _flush() {
  if (!tmplFile) return;
  try {
    fs.writeFileSync(tmplFile, JSON.stringify(tmplData, null, 2), 'utf8');
  } catch {}
}

/** Obtener todas las plantillas */
function getAll() {
  return tmplData.sort((a, b) => (a.category || '').localeCompare(b.category || ''));
}

/** Guardar o actualizar plantilla */
function save({ id, name, body, category = 'General' }) {
  if (id) {
    const idx = tmplData.findIndex(t => t.id === id);
    if (idx !== -1) {
      tmplData[idx] = { ...tmplData[idx], name, body, category, updatedAt: Date.now() };
      _flush();
      return tmplData[idx];
    }
  }
  const t = {
    id:        `tpl_${Date.now()}_${Math.random().toString(36).slice(2, 5)}`,
    name,
    body,
    category,
    createdAt: Date.now(),
  };
  tmplData.push(t);
  _flush();
  return t;
}

/** Eliminar plantilla */
function remove(id) {
  const before = tmplData.length;
  tmplData = tmplData.filter(t => t.id !== id);
  if (tmplData.length === before) throw new Error(`Plantilla no encontrada: ${id}`);
  _flush();
}

/**
 * Procesar variables en el cuerpo de una plantilla
 * @param {string} body - texto con {{variable}}
 * @param {object} variables - { nombre: 'Juan', fecha: '15/01/2026', ... }
 * @returns {string} texto con variables sustituidas
 */
function process(body, variables = {}) {
  // Variables automáticas
  const now  = new Date();
  const auto = {
    fecha:    now.toLocaleDateString('es-ES'),
    hora:     now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
    dia:      now.toLocaleDateString('es-ES', { weekday: 'long' }),
    mes:      now.toLocaleDateString('es-ES', { month: 'long' }),
    año:      now.getFullYear().toString(),
    ...variables,
  };

  return body.replace(/\{\{(\w+)\}\}/g, (match, key) => {
    return auto[key] !== undefined ? auto[key] : match;
  });
}

/** Extraer lista de variables de un cuerpo de plantilla */
function extractVariables(body) {
  const matches = body.match(/\{\{(\w+)\}\}/g) || [];
  return [...new Set(matches.map(m => m.replace(/\{\{|\}\}/g, '')))];
}

module.exports = { init, getAll, save, remove, process, extractVariables };
