/**
 * TH-WHATS — src/frontend/app.js
 * Lógica frontend completa — JS Vanilla
 * Todas las features: chats, mensajes, plantillas, scheduler, media,
 * grabación voz, paste imagen, filtros, export, notificaciones
 */

'use strict';

// ── API bridge (expuesta por preload.js) ─────────────────────────────────────
const api = window.thwhats;

// ── Estado global ────────────────────────────────────────────────────────────
const State = {
  connected:       false,
  userInfo:        null,
  currentChat:     null,   // { id, name, number, isGroup }
  chats:           [],     // ordenados por lastMessageTime desc
  messages:        {},     // { [chatId]: [msg, ...] }
  searchResults:   [],
  scheduledList:   [],
  templates:       [],
  filter:          'all',  // 'all' | 'unread' | 'groups'
  forceChromium:   false,
  chatSearchActive: false,
  chatSearchMatches: [],
  chatSearchIdx:    0,
  quoteMsg:        null,   // mensaje al que se responde
  pasteData:       null,   // { base64, mimetype } imagen del portapapeles
  ctxMsgId:        null,   // ID mensaje del menú contextual
  mediaRecorder:   null,
  audioChunks:     [],
  lightboxData:    null,   // { base64, mimetype }
  config:          {},
  profilePics:     {},     // { [chatId]: url } cache de fotos de perfil
};

// ── $(id) shorthand ──────────────────────────────────────────────────────────
const $ = id => document.getElementById(id);

// ═══════════════════════════════════════════════════════════════════════════
// INIT
// ═══════════════════════════════════════════════════════════════════════════
async function init() {
  State.config = (await api.getConfig()) || {};
  $('force-chromium').checked = State.config.forceInternalChromium || false;
  State.forceChromium = State.config.forceInternalChromium || false;

  // Registrar eventos del backend
  api.on('whatsapp:qr',         onQR);
  api.on('whatsapp:qr-expired', onQRExpired);
  api.on('whatsapp:ready',      onReady);
  api.on('whatsapp:message',    onMessage);
  api.on('whatsapp:message-sent', onMessageSent);
  api.on('whatsapp:disconnected', onDisconnected);
  api.on('whatsapp:loading',    onLoading);
  api.on('whatsapp:timeout',    onTimeout);
  api.on('whatsapp:ack',        onAck);
  api.on('connection:status',   onConnectionStatus);
  api.on('scheduled:sent',      onScheduledSent);
  api.on('scheduled:failed',    onScheduledFailed);
  api.on('wa:log',              onWALog);

  buildEmojiPicker();
  initDragDrop();
  setStatus('En espera...', false);
}

// ── Drag & Drop de archivos ──────────────────────────────────────────────────
function initDragDrop() {
  const chatPanel = document.getElementById('chat-panel');
  if (!chatPanel) return;

  chatPanel.addEventListener('dragover', (e) => {
    e.preventDefault();
    if (!State.currentChat) return;
    $('drag-overlay').classList.remove('hidden');
  });

  chatPanel.addEventListener('dragleave', (e) => {
    if (!chatPanel.contains(e.relatedTarget)) {
      $('drag-overlay').classList.add('hidden');
    }
  });

  chatPanel.addEventListener('drop', async (e) => {
    e.preventDefault();
    $('drag-overlay').classList.add('hidden');
    if (!State.currentChat) return;

    const files = Array.from(e.dataTransfer.files);
    if (!files.length) return;

    for (const file of files) {
      const filePath = file.path; // Electron expone .path en File
      if (!filePath) continue;
      showToast(`Enviando ${file.name}...`, 'info');
      const caption = $('message-input').value.trim();
      const res = await api.sendMedia(State.currentChat.id, filePath, caption);
      if (res.success) {
        $('message-input').value = '';
        showToast(`✓ ${file.name} enviado`, 'success');
      } else {
        showToast(`Error al enviar ${file.name}: ${res.error || ''}`, 'error');
      }
    }
  });
}

// ═══════════════════════════════════════════════════════════════════════════
// CONEXIÓN
// ═══════════════════════════════════════════════════════════════════════════
async function connectWA() {
  $('btn-connect').disabled = true;
  $('btn-connect').textContent = 'Conectando...';
  setStatus('Iniciando conexión...', true);
  $('qr-container').classList.add('hidden');

  await api.startWhatsApp({ forceInternalChromium: State.forceChromium });
}

function toggleForceChromium(val) {
  State.forceChromium = val;
  api.saveConfig({ forceInternalChromium: val });
}

function toggleDebug() {
  const panel = $('debug-panel');
  panel.classList.toggle('hidden');
}

async function disconnect() {
  if (!confirm('¿Desconectar WhatsApp?')) return;
  await api.disconnectWhatsApp();
  State.connected = false;
  showScreen('screen-connect');
  setStatus('Desconectado', false);
  $('btn-connect').disabled = false;
  $('btn-connect').textContent = 'Conectar WhatsApp';
}

async function clearSession() {
  if (!confirm('¿Borrar la sesión? Tendrás que escanear el QR de nuevo.')) return;
  await api.clearConfig();
  await api.disconnectWhatsApp();
  closeModal('modal-settings');
  showScreen('screen-connect');
  setStatus('Sesión borrada. Conecta de nuevo.', false);
  $('btn-connect').disabled = false;
  $('btn-connect').textContent = 'Conectar WhatsApp';
}

function retryQR() {
  connectWA();
}

// ── Eventos de conexión ──────────────────────────────────────────────────────
function onQR({ dataUrl }) {
  $('qr-image').src = dataUrl;
  $('qr-container').classList.remove('hidden');
  $('qr-overlay').classList.add('hidden');
  setStatus('Escanea el QR con tu móvil', false);
  $('spinner').style.display = 'none';
}

function onQRExpired() {
  $('qr-overlay').classList.remove('hidden');
  setStatus('QR expirado — genera uno nuevo', false);
}

async function onReady({ info }) {
  State.connected = true;
  State.userInfo  = info;
  await api.saveSession({ connected: true, userInfo: info });

  showScreen('screen-main');
  $('user-name').textContent   = info.name || info.number;
  $('user-avatar').textContent = getInitials(info.name || info.number);

  showToast(`Conectado como ${info.name}`, 'success');
  loadChats();
  loadTemplates();
  loadScheduled();
}

function onDisconnected({ reason }) {
  State.connected = false;
  showScreen('screen-connect');
  setStatus(`Desconectado: ${reason}`, false);
  $('btn-connect').disabled = false;
  $('btn-connect').textContent = 'Reconectar';
  showToast(`Desconectado: ${reason}`, 'error');
}

function onConnectionStatus({ status, message }) {
  setStatus(message, status === 'connecting' || status === 'authenticated');
}

function onLoading({ percent, message }) {
  setStatus(`${message} (${percent}%)`, true);
}

function onTimeout({ message }) {
  setStatus('Error de conexión', false);
  $('spinner').style.display = 'none';
  $('btn-connect').disabled = false;
  $('btn-connect').textContent = 'Reintentar';
  $('debug-panel').classList.remove('hidden');
  addDebugLog('ERROR: ' + message, 'error');
  alert('⚠️ Timeout de conexión\n\n' + message);
}

function onWALog({ msg, level, ts }) {
  addDebugLog(`[${ts}] ${msg}`, level);
}

function addDebugLog(text, level = 'info') {
  const log = $('debug-log');
  const line = document.createElement('div');
  line.className = `debug-line debug-${level}`;
  line.textContent = text;
  log.appendChild(line);
  log.scrollTop = log.scrollHeight;
}

function setStatus(text, spinning) {
  $('status-text').textContent = text;
  const sp = $('spinner');
  sp.style.display = spinning ? 'block' : 'none';
}

// ═══════════════════════════════════════════════════════════════════════════
// CHATS
// ═══════════════════════════════════════════════════════════════════════════
async function loadChats() {
  const res = await api.getChats(60);
  if (!res.success) return;
  State.chats = res.data.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  renderChatList();
  loadProfilePicsLazy();
}

async function loadProfilePicsLazy() {
  for (const chat of State.chats.slice(0, 40)) {
    if (State.profilePics[chat.id]) continue;
    try {
      const res = await api.getProfilePic(chat.id);
      if (res.success && res.data) {
        State.profilePics[chat.id] = res.data;
        const el = document.querySelector(`.chat-item[data-id="${CSS.escape(chat.id)}"] .avatar`);
        if (el) setAvatarImg(el, res.data, chat.name);
      }
    } catch {}
    await new Promise(r => setTimeout(r, 120)); // evitar rate-limit
  }
}

function setAvatarImg(el, url, name) {
  el.style.overflow = 'hidden';
  el.style.padding  = '0';
  const img = document.createElement('img');
  img.className = 'avatar-img';
  img.src = url;
  img.onerror = () => { el.style.overflow = ''; el.textContent = getInitials(name); };
  el.innerHTML = '';
  el.appendChild(img);
}

function renderChatList() {
  const list  = $('chat-list');
  const query = $('search-input').value.toLowerCase();

  let chats = State.chats;

  // Aplicar filtro
  if (State.filter === 'unread') chats = chats.filter(c => c.unreadCount > 0);
  if (State.filter === 'groups') chats = chats.filter(c => c.isGroup);

  // Filtro de búsqueda en sidebar
  if (query) chats = chats.filter(c => c.name.toLowerCase().includes(query));

  list.innerHTML = chats.map(c => {
    const isActive  = State.currentChat?.id === c.id;
    const preview   = c.lastMessage
      ? (c.lastMessage.fromMe ? '✓ ' : '') + (
          c.lastMessage.type === 'chat' ? c.lastMessage.body :
          c.lastMessage.type === 'image' ? '📷 Imagen' :
          c.lastMessage.type === 'audio' ? '🎵 Audio' :
          c.lastMessage.type === 'video' ? '🎥 Vídeo' :
          c.lastMessage.type === 'document' ? '📄 Documento' : '...'
        )
      : '';
    const time      = c.timestamp ? formatTime(c.timestamp) : '';
    const unread    = c.unreadCount > 0
      ? `<span class="unread-badge">${c.unreadCount > 99 ? '99+' : c.unreadCount}</span>` : '';
    const initials  = getInitials(c.name);
    const groupIcon = c.isGroup ? '👥 ' : '';
    const picUrl    = State.profilePics[c.id];
    const avatarContent = picUrl
      ? `<img src="${picUrl}" class="avatar-img" onerror="this.style.display='none'">`
      : initials;

    return `
      <div class="chat-item ${isActive ? 'active' : ''}" data-id="${esc(c.id)}" onclick="App.openChat('${esc(c.id)}')">
        <div class="avatar" style="${picUrl ? 'overflow:hidden;padding:0' : ''}">${avatarContent}</div>
        <div class="chat-item-info">
          <div class="chat-item-top">
            <span class="chat-item-name">${groupIcon}${esc(c.name)}</span>
            <span class="chat-item-time">${time}</span>
          </div>
          <div class="chat-item-bottom">
            <span class="chat-item-preview">${esc(preview)}</span>
            ${unread}
          </div>
        </div>
      </div>
    `;
  }).join('');
}

function setFilter(filter, btn) {
  State.filter = filter;
  document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  renderChatList();
}

// ── Búsqueda de contactos ────────────────────────────────────────────────────
let _searchTimer = null;
function onSearch(val) {
  clearTimeout(_searchTimer);
  const q = val.trim();
  renderChatList(); // Filtrar chats existentes

  if (q.length < 2) {
    $('search-results').classList.add('hidden');
    return;
  }

  _searchTimer = setTimeout(async () => {
    const res = await api.search(q);
    if (!res.success) return;
    renderSearchResults(res.data);
  }, 300);
}

function renderSearchResults(results) {
  const wrap = $('search-results');
  if (results.length === 0) {
    wrap.classList.add('hidden');
    return;
  }
  wrap.classList.remove('hidden');
  wrap.innerHTML = `
    <div class="search-results-header">Contactos</div>
    ${results.map(r => `
      <div class="chat-item" onclick="App.openChat('${esc(r.id)}')">
        <div class="avatar">${getInitials(r.name)}</div>
        <div class="chat-item-info">
          <div class="chat-item-top">
            <span class="chat-item-name">${esc(r.name)}</span>
          </div>
          <div class="chat-item-bottom">
            <span class="chat-item-preview">+${esc(r.number)}</span>
          </div>
        </div>
      </div>
    `).join('')}
  `;
}

function openNewChat() {
  $('search-input').focus();
  $('search-input').value = '';
  onSearch('');
}

// ═══════════════════════════════════════════════════════════════════════════
// MENSAJES
// ═══════════════════════════════════════════════════════════════════════════
async function openChat(chatId) {
  // Limpiar búsqueda de contactos
  $('search-input').value = '';
  $('search-results').classList.add('hidden');

  const chat = State.chats.find(c => c.id === chatId) || { id: chatId, name: chatId };
  State.currentChat = { id: chat.id, name: chat.name, isGroup: chat.isGroup };

  // UI
  $('chat-empty').classList.add('hidden');
  $('chat-header').classList.remove('hidden');
  $('input-bar').classList.remove('hidden');
  $('chat-name').textContent = chat.name;
  $('chat-subtitle').textContent = chat.isGroup ? 'Grupo' : 'click para ver info';
  const cachedPic = State.profilePics[chatId];
  if (cachedPic) {
    setAvatarImg($('chat-avatar'), cachedPic, chat.name);
  } else {
    $('chat-avatar').style.overflow = '';
    $('chat-avatar').textContent = getInitials(chat.name);
    api.getProfilePic(chatId).then(res => {
      if (res.success && res.data) {
        State.profilePics[chatId] = res.data;
        setAvatarImg($('chat-avatar'), res.data, chat.name);
        const el = document.querySelector(`.chat-item[data-id="${CSS.escape(chatId)}"] .avatar`);
        if (el) setAvatarImg(el, res.data, chat.name);
      }
    }).catch(() => {});
  }

  renderChatList(); // Marcar activo
  clearQuote();
  cancelPaste();

  // Cerrar búsqueda dentro del chat si estaba abierta
  if (State.chatSearchActive) {
    State.chatSearchActive = false;
    $('chat-search-bar').classList.add('hidden');
  }

  // Cargar mensajes
  $('messages').innerHTML = '<div class="loading-msgs">Cargando mensajes...</div>';
  const res = await api.getMessages(chatId, 50);
  if (!res.success) {
    $('messages').innerHTML = '<div class="loading-msgs error">Error cargando mensajes</div>';
    return;
  }

  State.messages[chatId] = res.data;
  renderMessages(chatId);
  scrollToBottom();
}

function renderMessages(chatId) {
  const msgs  = State.messages[chatId] || [];
  const wrap  = $('messages');
  const isGroup = State.currentChat?.isGroup;

  wrap.innerHTML = msgs.map(m => buildBubble(m, isGroup)).join('');
  wrap.querySelectorAll('.bubble-wrap').forEach(el => {
    el.addEventListener('contextmenu', e => showCtxMenu(e, el.dataset.id, el.dataset.fromme === 'true'));
  });

  // Auto-cargar media pendiente (imágenes, audio, vídeo, docs) — máx 10 a la vez
  const mediaTypes = ['image', 'audio', 'ptt', 'video', 'document', 'sticker'];
  msgs.filter(m => m.hasMedia && !m.media && mediaTypes.includes(m.type))
      .slice(0, 10)
      .forEach((m, i) => setTimeout(() => loadMedia(m.id).catch(() => {}), i * 300));
}

function buildBubble(msg, isGroup = false) {
  const fromMe    = msg.fromMe;
  const dir       = fromMe ? 'out' : 'in';
  const time      = formatTime(msg.timestamp);
  const ackIcon   = fromMe ? getAckIcon(msg.ack) : '';
  const senderName = isGroup && !fromMe
    ? `<div class="bubble-sender">${esc(msg.author || msg.fromName || msg.from)}</div>`
    : '';

  let content = '';

  if (msg.quotedMsg) {
    content += `
      <div class="bubble-quote">
        <div class="quote-bar-inner"></div>
        <div>
          <div class="bubble-quote-author">${esc(msg.quotedMsg.from || '')}</div>
          <div class="bubble-quote-text">${esc(msg.quotedMsg.body || '[media]')}</div>
        </div>
      </div>
    `;
  }

  if (msg.type === 'chat' || !msg.type) {
    content += `<div class="bubble-text">${formatText(msg.body || '')}</div>`;
  } else if (msg.type === 'image') {
    if (msg.media) {
      const src = `data:${msg.mimetype || 'image/jpeg'};base64,${msg.media}`;
      content += `
        <div class="bubble-media" onclick="App.openLightbox('${msg.id}')">
          <img src="${src}" class="bubble-img" loading="lazy">
          ${msg.body ? `<div class="bubble-caption">${esc(msg.body)}</div>` : ''}
        </div>`;
    } else {
      content += `
        <div class="bubble-media-placeholder" onclick="App.loadMedia('${msg.id}')">
          📷 Ver imagen
        </div>`;
    }
  } else if (msg.type === 'audio' || msg.type === 'ptt') {
    if (msg.media) {
      const audioSrc = `data:${msg.mimetype || 'audio/ogg'};base64,${msg.media}`;
      content += `<audio controls class="bubble-audio" src="${audioSrc}"></audio>`;
    } else {
      content += `<div class="bubble-media-placeholder" onclick="App.loadMedia('${msg.id}')">🎵 Escuchar audio</div>`;
    }
  } else if (msg.type === 'video') {
    if (msg.media) {
      const vidSrc = `data:${msg.mimetype || 'video/mp4'};base64,${msg.media}`;
      content += `<video controls class="bubble-video" src="${vidSrc}"></video>`;
    } else {
      content += `<div class="bubble-media-placeholder" onclick="App.loadMedia('${msg.id}')">🎥 Ver vídeo</div>`;
    }
  } else if (msg.type === 'document') {
    const docName = msg.body || 'documento';
    if (msg.media) {
      content += `
        <div class="bubble-doc" onclick="App.downloadDoc('${msg.id}', '${esc(docName)}')">
          📄 ${esc(docName)} <span class="doc-dl">⬇</span>
        </div>`;
    } else {
      content += `<div class="bubble-media-placeholder" onclick="App.loadMedia('${msg.id}')">📄 ${esc(docName)}</div>`;
    }
  } else if (msg.type === 'sticker') {
    if (msg.media) {
      const src = `data:${msg.mimetype || 'image/webp'};base64,${msg.media}`;
      content += `<img src="${src}" class="bubble-sticker" loading="lazy">`;
    }
  } else {
    content += `<div class="bubble-text">[${msg.type || 'mensaje'}]</div>`;
  }

  return `
    <div class="bubble-wrap bubble-${dir}" data-id="${esc(msg.id)}" data-fromme="${fromMe}">
      <div class="bubble bubble-${dir}">
        ${senderName}
        ${content}
        <div class="bubble-meta">
          <span class="bubble-time">${time}</span>
          ${ackIcon}
        </div>
      </div>
    </div>
  `;
}

function getAckIcon(ack) {
  if (ack === 0) return '<span class="ack ack-0" title="Reloj">🕐</span>';
  if (ack === 1) return '<span class="ack ack-1" title="Enviado">✓</span>';
  if (ack === 2) return '<span class="ack ack-2" title="Entregado">✓✓</span>';
  if (ack === 3) return '<span class="ack ack-3" title="Leído">✓✓</span>';
  return '';
}

// Nuevos mensajes entrantes
function onMessage(msg) {
  const chatId = msg.from;
  if (!State.messages[chatId]) State.messages[chatId] = [];
  State.messages[chatId].push(msg);

  // Guardar en historial local
  api.saveMessageLocal(chatId, msg);

  // Actualizar lista de chats
  const chat = State.chats.find(c => c.id === chatId);
  if (chat) {
    chat.lastMessage  = msg;
    chat.timestamp    = msg.timestamp;
    chat.unreadCount  = (chat.unreadCount || 0) + (State.currentChat?.id === chatId ? 0 : 1);
    State.chats.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    renderChatList();
  }

  if (State.currentChat?.id === chatId) {
    const wrap = $('messages');
    const div  = document.createElement('div');
    div.innerHTML = buildBubble(msg, State.currentChat.isGroup);
    const bubble = div.firstElementChild;
    bubble.addEventListener('contextmenu', e => showCtxMenu(e, bubble.dataset.id, bubble.dataset.fromme === 'true'));
    wrap.appendChild(bubble);
    scrollToBottom();
  }

  // Notificación nativa si el chat no está activo
  if (State.currentChat?.id !== chatId) {
    const senderName = msg.fromName || chatId;
    api.showNotification(
      senderName,
      msg.type === 'chat' ? msg.body : `[${msg.type}]`,
    );
  }
}

function onMessageSent(msg) {
  const chatId = msg.to;
  if (!State.messages[chatId]) State.messages[chatId] = [];
  const existing = State.messages[chatId].find(m => m.id === msg.id);
  if (!existing) {
    State.messages[chatId].push(msg);
    api.saveMessageLocal(chatId, msg);
  }
  if (State.currentChat?.id === chatId) {
    const el = document.querySelector(`[data-id="${CSS.escape(msg.id)}"]`);
    if (!el) {
      const wrap = $('messages');
      const div  = document.createElement('div');
      div.innerHTML = buildBubble(msg, false);
      wrap.appendChild(div.firstElementChild);
      scrollToBottom();
    }
  }
}

function onAck({ id, ack }) {
  // Actualizar ACK en el estado
  Object.keys(State.messages).forEach(chatId => {
    const msg = State.messages[chatId]?.find(m => m.id === id);
    if (msg) msg.ack = ack;
  });
  // Actualizar en el DOM
  const el = document.querySelector(`[data-id="${CSS.escape(id)}"] .ack`);
  if (el) {
    const wrap = el.closest('.bubble-wrap');
    const msg  = Object.values(State.messages).flat().find(m => m.id === id);
    if (msg && wrap) {
      const meta = wrap.querySelector('.bubble-meta');
      if (meta) {
        const existing = meta.querySelector('.ack');
        if (existing) existing.outerHTML = getAckIcon(ack);
        else meta.insertAdjacentHTML('beforeend', getAckIcon(ack));
      }
    }
  }
}

// ── Enviar mensaje ────────────────────────────────────────────────────────────
async function sendMessage() {
  if (!State.currentChat) return;
  const input = $('message-input');
  const body  = input.value.trim();
  if (!body) return;

  input.value = '';
  input.style.height = 'auto';
  const quotedId = State.quoteMsg?.id || null;
  clearQuote();

  const res = await api.sendMessage(State.currentChat.id, body, quotedId);
  if (!res.success) {
    showToast('Error al enviar: ' + res.error, 'error');
  }
}

function onInputKeydown(e) {
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    App.sendMessage();
  }
}

function onInputChange(el) {
  // Auto-resize textarea
  el.style.height = 'auto';
  el.style.height = Math.min(el.scrollHeight, 120) + 'px';
}

// ── Paste imagen desde portapapeles ──────────────────────────────────────────
async function onPaste(e) {
  const items = e.clipboardData?.items;
  if (!items) return;
  for (const item of items) {
    if (item.type.startsWith('image/')) {
      e.preventDefault();
      const res = await api.getClipboardImage();
      if (res.success) {
        State.pasteData = res.data;
        const src = `data:${res.data.mimetype};base64,${res.data.base64}`;
        $('paste-img').src = src;
        $('paste-preview').classList.remove('hidden');
      }
      break;
    }
  }
}

function cancelPaste() {
  State.pasteData = null;
  $('paste-preview').classList.add('hidden');
  $('paste-img').src = '';
}

async function sendPastedImage() {
  if (!State.pasteData || !State.currentChat) return;
  const caption = $('message-input').value.trim();
  $('message-input').value = '';
  const { base64, mimetype } = State.pasteData;
  cancelPaste();

  const res = await api.sendImageBuffer(State.currentChat.id, base64, mimetype, caption);
  if (!res.success) showToast('Error al enviar imagen: ' + res.error, 'error');
  else showToast('Imagen enviada', 'success');
}

// ── Adjuntar archivo ─────────────────────────────────────────────────────────
async function attachFile() {
  if (!State.currentChat) return;
  const res = await api.selectFile();
  if (!res.success) return;
  const caption = $('message-input').value.trim();
  $('message-input').value = '';
  const r = await api.sendMedia(State.currentChat.id, res.data.filePath, caption);
  if (!r.success) showToast('Error al enviar: ' + r.error, 'error');
  else showToast('Archivo enviado', 'success');
}

// ── Reply (quote) ────────────────────────────────────────────────────────────
function setQuote(msg) {
  State.quoteMsg = msg;
  $('quote-author').textContent = msg.fromMe ? 'Yo' : (msg.fromName || msg.from);
  $('quote-text').textContent   = msg.body || '[media]';
  $('quote-preview').classList.remove('hidden');
  $('message-input').focus();
}

function clearQuote() {
  State.quoteMsg = null;
  $('quote-preview').classList.add('hidden');
}

// ── Menú contextual ──────────────────────────────────────────────────────────
function showCtxMenu(e, msgId, fromMe) {
  e.preventDefault();
  State.ctxMsgId = msgId;
  const menu = $('ctx-menu');
  $('ctx-delete-all').style.display = fromMe ? 'block' : 'none';
  menu.style.left = e.pageX + 'px';
  menu.style.top  = e.pageY + 'px';
  menu.classList.remove('hidden');
  setTimeout(() => document.addEventListener('click', closeCtxMenu, { once: true }), 50);
}

function closeCtxMenu() {
  $('ctx-menu').classList.add('hidden');
}

function ctxReply() {
  if (!State.ctxMsgId) return;
  const msg = Object.values(State.messages).flat().find(m => m.id === State.ctxMsgId);
  if (msg) setQuote(msg);
}

function ctxCopy() {
  if (!State.ctxMsgId) return;
  const msg = Object.values(State.messages).flat().find(m => m.id === State.ctxMsgId);
  if (msg?.body) navigator.clipboard.writeText(msg.body);
}

async function ctxDelete(everyone) {
  if (!State.ctxMsgId) return;
  if (!confirm(everyone ? '¿Borrar para todos?' : '¿Borrar para mí?')) return;
  const res = await api.deleteMessage(State.ctxMsgId, everyone);
  if (res.success || everyone === false) {
    // Borrar del DOM siempre
    const el = document.querySelector(`[data-id="${CSS.escape(State.ctxMsgId)}"]`);
    if (el) el.remove();
    // Borrar del estado
    const chatId = State.currentChat?.id;
    if (chatId && State.messages[chatId]) {
      State.messages[chatId] = State.messages[chatId].filter(m => m.id !== State.ctxMsgId);
    }
    showToast('Mensaje eliminado', 'success');
  } else {
    showToast('Error: ' + res.error, 'error');
  }
}

// ── Búsqueda en conversación ─────────────────────────────────────────────────
function toggleChatSearch() {
  State.chatSearchActive = !State.chatSearchActive;
  const bar = $('chat-search-bar');
  if (State.chatSearchActive) {
    bar.classList.remove('hidden');
    $('chat-search-input').focus();
  } else {
    closeChatSearch();
  }
}

function closeChatSearch() {
  State.chatSearchActive = false;
  $('chat-search-bar').classList.add('hidden');
  $('chat-search-input').value = '';
  $('chat-search-count').textContent = '';
  // Quitar resaltados
  document.querySelectorAll('.bubble-text mark').forEach(m => {
    m.outerHTML = m.textContent;
  });
  State.chatSearchMatches = [];
  State.chatSearchIdx = 0;
}

function searchInChat(query) {
  // Limpiar marcas previas
  document.querySelectorAll('.bubble-text mark').forEach(m => {
    const parent = m.parentNode;
    parent.replaceChild(document.createTextNode(m.textContent), m);
    parent.normalize();
  });

  if (!query.trim() || query.length < 2) {
    $('chat-search-count').textContent = '';
    return;
  }

  // Buscar y resaltar
  const q   = query.toLowerCase();
  const els = document.querySelectorAll('.bubble-text');
  let count = 0;

  els.forEach(el => {
    const text = el.textContent;
    if (text.toLowerCase().includes(q)) {
      const regex = new RegExp(`(${escapeRegex(query)})`, 'gi');
      el.innerHTML = esc(text).replace(regex, '<mark>$1</mark>');
      count++;
    }
  });

  $('chat-search-count').textContent = count > 0 ? `${count} resultado(s)` : 'Sin resultados';
}

// ── Media ─────────────────────────────────────────────────────────────────────
async function loadMedia(msgId) {
  const res = await api.getMedia(msgId);
  if (!res.success) { showToast('No se pudo cargar el archivo', 'error'); return; }

  const { data, mimetype } = res.data;
  const chatId = State.currentChat?.id;
  if (chatId && State.messages[chatId]) {
    const msg = State.messages[chatId].find(m => m.id === msgId);
    if (msg) { msg.media = data; msg.mimetype = mimetype; }
  }

  // Re-renderizar solo ese mensaje
  const el = document.querySelector(`[data-id="${CSS.escape(msgId)}"]`);
  if (el) {
    const msg = Object.values(State.messages).flat().find(m => m.id === msgId);
    if (msg) {
      el.outerHTML = buildBubble(msg, State.currentChat?.isGroup);
    }
  }
}

function openLightbox(msgId) {
  const msg = Object.values(State.messages).flat().find(m => m.id === msgId);
  if (!msg?.media) { loadMedia(msgId); return; }
  const src = `data:${msg.mimetype || 'image/jpeg'};base64,${msg.media}`;
  State.lightboxData = { base64: msg.media, mimetype: msg.mimetype };
  $('lightbox-img').src = src;
  $('lightbox').classList.remove('hidden');
}

function closeLightbox() {
  $('lightbox').classList.add('hidden');
  $('lightbox-img').src = '';
  State.lightboxData = null;
}

async function downloadFromLightbox() {
  if (!State.lightboxData) return;
  const { base64, mimetype } = State.lightboxData;
  const ext  = (mimetype || '').split('/')[1] || 'jpg';
  await api.saveFile({ defaultName: `imagen_${Date.now()}.${ext}`, base64, mimetype });
}

async function downloadDoc(msgId, docName) {
  const msg = Object.values(State.messages).flat().find(m => m.id === msgId);
  if (!msg?.media) {
    const res = await api.getMedia(msgId);
    if (!res.success) { showToast('No se pudo descargar', 'error'); return; }
    await api.saveFile({ defaultName: docName, base64: res.data.data, mimetype: res.data.mimetype });
  } else {
    await api.saveFile({ defaultName: docName, base64: msg.media, mimetype: msg.mimetype });
  }
}

// ── Grabación de voz ─────────────────────────────────────────────────────────
async function startRecording() {
  if (!State.currentChat) return;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    State.audioChunks = [];
    State.mediaRecorder = new MediaRecorder(stream, { mimeType: 'audio/webm;codecs=opus' });
    State.mediaRecorder.ondataavailable = e => State.audioChunks.push(e.data);
    State.mediaRecorder.start();
    $('btn-record').classList.add('recording');
    showToast('Grabando... suelta para enviar', 'info');
  } catch (e) {
    showToast('No se puede acceder al micrófono', 'error');
  }
}

async function stopRecording() {
  if (!State.mediaRecorder) return;
  const mr = State.mediaRecorder;
  State.mediaRecorder = null;
  $('btn-record').classList.remove('recording');

  await new Promise(resolve => {
    mr.onstop = resolve;
    mr.stop();
  });

  mr.stream.getTracks().forEach(t => t.stop());

  const blob    = new Blob(State.audioChunks, { type: 'audio/ogg; codecs=opus' });
  const arrayBuf = await blob.arrayBuffer();
  const base64  = btoa(String.fromCharCode(...new Uint8Array(arrayBuf)));

  const res = await api.sendImageBuffer(State.currentChat.id, base64, 'audio/ogg; codecs=opus', '');
  if (!res.success) showToast('Error al enviar audio: ' + res.error, 'error');
  else showToast('Audio enviado', 'success');
}

// ═══════════════════════════════════════════════════════════════════════════
// PANEL CONTACTO
// ═══════════════════════════════════════════════════════════════════════════
async function openContactPanel() {
  if (!State.currentChat) return;
  const panel = $('contact-panel');
  panel.classList.remove('hidden');

  // Estado inicial mientras carga
  $('contact-info-name').textContent   = State.currentChat.name;
  $('contact-info-number').textContent = '...';
  $('contact-info-about').textContent  = '';
  $('contact-info-extra').innerHTML    = '<div class="contact-loading">Cargando info...</div>';
  $('contact-pic').textContent         = getInitials(State.currentChat.name);
  $('contact-pic').style.overflow      = '';

  const res = await api.getContactInfo(State.currentChat.id);
  if (!res.success) {
    $('contact-info-number').textContent = State.currentChat.id;
    $('contact-info-extra').innerHTML = '';
    return;
  }

  const c = res.data;
  $('contact-info-name').textContent   = c.name || State.currentChat.name;
  $('contact-info-number').textContent = c.number ? '+' + c.number : State.currentChat.id;
  $('contact-info-about').textContent  = c.about || '';

  // Info extra
  const extra = [];
  if (c.isBusiness) extra.push('<span class="badge-business">🏢 Cuenta Business</span>');
  if (c.pushname && c.pushname !== c.name) {
    extra.push(`<div class="contact-extra-row"><span class="contact-extra-label">Nombre push</span><span>${esc(c.pushname)}</span></div>`);
  }
  if (c.isGroup && c.groupInfo) {
    extra.push(`<div class="contact-extra-row"><span class="contact-extra-label">Participantes</span><span>${c.groupInfo.participants}</span></div>`);
    if (c.groupInfo.description) {
      extra.push(`<div class="contact-extra-row contact-extra-desc"><span class="contact-extra-label">Descripción</span><span>${esc(c.groupInfo.description)}</span></div>`);
    }
  }
  if (c.number) {
    extra.push(`<button class="btn-ghost btn-sm contact-copy-btn" onclick="navigator.clipboard.writeText('+${c.number}');showToast('Número copiado','success')">📋 Copiar número</button>`);
  }
  $('contact-info-extra').innerHTML = extra.join('');

  // Foto de perfil
  if (c.pic) {
    const img = document.createElement('img');
    img.src       = c.pic;
    img.className = 'contact-big-avatar-img';
    img.onerror   = () => { $('contact-pic').textContent = getInitials(c.name || State.currentChat.name); $('contact-pic').style.overflow = ''; };
    $('contact-pic').style.overflow = 'hidden';
    $('contact-pic').innerHTML = '';
    $('contact-pic').appendChild(img);
    State.profilePics[State.currentChat.id] = c.pic;
  }
}

function closeContactPanel() {
  $('contact-panel').classList.add('hidden');
}

// ═══════════════════════════════════════════════════════════════════════════
// PROGRAMACIÓN DE MENSAJES
// ═══════════════════════════════════════════════════════════════════════════
function openScheduleModal() {
  if (!State.currentChat) return;
  $('schedule-recipient').textContent = State.currentChat.name;
  $('schedule-body').value = $('message-input').value || '';

  // Fecha por defecto: ahora + 1 hora
  const d = new Date(Date.now() + 3600000);
  $('schedule-datetime').value = d.toISOString().slice(0, 16);

  openModal('modal-schedule');
}

function selectScheduleTab(tab, btn) {
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
  btn.classList.add('active');
  $('schedule-tab-date').classList.toggle('hidden', tab !== 'date');
  $('schedule-tab-delay').classList.toggle('hidden', tab !== 'delay');
}

async function scheduleMessage() {
  const body = $('schedule-body').value.trim();
  if (!body) { showToast('Escribe un mensaje', 'error'); return; }

  const activeTab = $('schedule-tab-date').classList.contains('hidden') ? 'delay' : 'date';
  let opts = { chatId: State.currentChat.id, chatName: State.currentChat.name, body };

  if (activeTab === 'date') {
    const dt = $('schedule-datetime').value;
    if (!dt) { showToast('Selecciona fecha y hora', 'error'); return; }
    const ts = new Date(dt).getTime();
    if (ts <= Date.now()) { showToast('La fecha debe ser futura', 'error'); return; }
    opts.scheduledAt = ts;
    opts.delay = 0;
  } else {
    const delay = parseInt($('schedule-delay').value) || 60;
    opts.scheduledAt = Date.now();
    opts.delay = delay * 1000;
  }

  const res = await api.scheduleMessage(opts);
  if (res.success) {
    showToast('Mensaje programado ✓', 'success');
    closeModal('modal-schedule');
    loadScheduled();
  } else {
    showToast('Error: ' + res.error, 'error');
  }
}

async function loadScheduled() {
  const res = await api.getScheduled();
  if (!res.success) return;
  State.scheduledList = res.data;
}

async function openScheduled() {
  await loadScheduled();
  renderScheduledList();
  openModal('modal-scheduled');
}

function renderScheduledList() {
  const list = $('scheduled-list');
  if (State.scheduledList.length === 0) {
    list.innerHTML = '<div class="empty-state">No hay mensajes programados</div>';
    return;
  }
  list.innerHTML = State.scheduledList.map(s => {
    const dt   = new Date(s.scheduledAt).toLocaleString('es-ES');
    const diff = Math.max(0, s.scheduledAt - Date.now());
    const countdown = diff > 0
      ? `En ${formatCountdown(diff)}`
      : 'Enviando...';
    return `
      <div class="scheduled-item">
        <div class="scheduled-info">
          <div class="scheduled-to">${esc(s.chatName || s.chatId)}</div>
          <div class="scheduled-body">"${esc(s.body.slice(0, 60))}${s.body.length > 60 ? '...' : ''}"</div>
          <div class="scheduled-time">📅 ${dt} — <em>${countdown}</em></div>
        </div>
        <button class="btn-danger btn-sm" onclick="App.cancelScheduled('${s.id}')">✕</button>
      </div>
    `;
  }).join('');
}

async function cancelScheduled(id) {
  const res = await api.cancelScheduled(id);
  if (res.success) {
    showToast('Mensaje cancelado', 'success');
    await loadScheduled();
    renderScheduledList();
  } else {
    showToast('Error: ' + res.error, 'error');
  }
}

function onScheduledSent({ toName, message }) {
  showToast(`✓ Programado enviado a ${toName}`, 'success');
  loadScheduled();
}

function onScheduledFailed({ to, error }) {
  showToast(`✗ Error programado a ${to}: ${error}`, 'error');
  loadScheduled();
}

// ═══════════════════════════════════════════════════════════════════════════
// PLANTILLAS
// ═══════════════════════════════════════════════════════════════════════════
async function loadTemplates() {
  const res = await api.getTemplates();
  if (res.success) State.templates = res.data;
}

async function openTemplates() {
  await loadTemplates();
  renderTemplatesList();
  $('template-editor').classList.add('hidden');
  openModal('modal-templates');
}

// Inline: desde botón en barra de entrada
async function openTemplatesInline() {
  await loadTemplates();
  renderTemplatesList(true); // modo inserción
  $('template-editor').classList.add('hidden');
  openModal('modal-templates');
}

function renderTemplatesList(insertMode = false) {
  const list  = $('templates-list');
  const query = $('template-search')?.value.toLowerCase() || '';
  const tmps  = State.templates.filter(t =>
    !query || t.name.toLowerCase().includes(query) || t.body.toLowerCase().includes(query)
  );

  if (tmps.length === 0) {
    list.innerHTML = '<div class="empty-state">Sin plantillas</div>';
    return;
  }

  // Agrupar por categoría
  const cats = {};
  tmps.forEach(t => {
    const cat = t.category || 'General';
    if (!cats[cat]) cats[cat] = [];
    cats[cat].push(t);
  });

  list.innerHTML = Object.entries(cats).map(([cat, tpls]) => `
    <div class="tpl-category-label">${esc(cat)}</div>
    ${tpls.map(t => `
      <div class="tpl-item" onclick="${insertMode ? `App.insertTemplate('${t.id}')` : `App.editTemplate('${t.id}')`}">
        <div class="tpl-name">${esc(t.name)}</div>
        <div class="tpl-preview-text">${esc(t.body.slice(0, 60))}${t.body.length > 60 ? '...' : ''}</div>
        <div class="tpl-item-actions">
          <button class="btn-ghost btn-xs" onclick="event.stopPropagation(); App.editTemplate('${t.id}')">✏</button>
          <button class="btn-danger btn-xs" onclick="event.stopPropagation(); App.removeTemplate('${t.id}')">✕</button>
        </div>
      </div>
    `).join('')}
  `).join('');
}

function filterTemplates(query) {
  renderTemplatesList();
}

async function insertTemplate(id) {
  const t = State.templates.find(t => t.id === id);
  if (!t) return;

  // Extraer variables y pedir valores
  const res = await api.getTemplates();
  const vars = extractVarsFromBody(t.body);

  if (vars.length > 0) {
    const values = {};
    for (const v of vars) {
      const val = prompt(`Valor para {{${v}}}:`);
      if (val !== null) values[v] = val;
    }
    const r = await api.processTemplate(t.body, values);
    if (r.success) {
      $('message-input').value = r.data;
    }
  } else {
    $('message-input').value = t.body;
  }

  closeModal('modal-templates');
  $('message-input').focus();
}

function newTemplate() {
  $('tpl-id').value      = '';
  $('tpl-name').value    = '';
  $('tpl-category').value = 'General';
  $('tpl-body').value    = '';
  $('tpl-vars').innerHTML = '';
  $('tpl-preview-wrap').classList.add('hidden');
  $('template-editor').classList.remove('hidden');
}

function editTemplate(id) {
  const t = State.templates.find(t => t.id === id);
  if (!t) return;
  $('tpl-id').value       = t.id;
  $('tpl-name').value     = t.name;
  $('tpl-category').value = t.category || 'General';
  $('tpl-body').value     = t.body;
  previewTemplate();
  $('template-editor').classList.remove('hidden');
}

function cancelTemplateEdit() {
  $('template-editor').classList.add('hidden');
}

function previewTemplate() {
  const body = $('tpl-body').value;
  const vars = extractVarsFromBody(body);
  $('tpl-vars').innerHTML = vars.length
    ? vars.map(v => `<span class="var-chip">{{${v}}}</span>`).join(' ')
    : '<span class="muted">Ninguna</span>';

  if (vars.length > 0) {
    $('tpl-preview-wrap').classList.remove('hidden');
    const now = new Date();
    const autoVars = {
      nombre:  'Cliente',
      empresa: 'Mi Empresa',
      fecha:   now.toLocaleDateString('es-ES'),
      hora:    now.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' }),
    };
    let preview = body;
    vars.forEach(v => {
      preview = preview.replace(new RegExp(`\\{\\{${v}\\}\\}`, 'g'), autoVars[v] || `[${v}]`);
    });
    $('tpl-preview').textContent = preview;
  } else {
    $('tpl-preview-wrap').classList.add('hidden');
  }
}

async function saveTemplate() {
  const name = $('tpl-name').value.trim();
  const body = $('tpl-body').value.trim();
  if (!name || !body) { showToast('Nombre y cuerpo requeridos', 'error'); return; }

  const res = await api.saveTemplate({
    id:       $('tpl-id').value || null,
    name,
    body,
    category: $('tpl-category').value || 'General',
  });

  if (res.success) {
    showToast('Plantilla guardada', 'success');
    await loadTemplates();
    renderTemplatesList();
    cancelTemplateEdit();
  } else {
    showToast('Error: ' + res.error, 'error');
  }
}

async function removeTemplate(id) {
  if (!confirm('¿Eliminar esta plantilla?')) return;
  const res = await api.deleteTemplate(id);
  if (res.success) {
    showToast('Plantilla eliminada', 'success');
    await loadTemplates();
    renderTemplatesList();
  }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORTAR CONVERSACIÓN
// ═══════════════════════════════════════════════════════════════════════════
async function exportConversation() {
  if (!State.currentChat) return;
  const format = await new Promise(resolve => {
    const f = prompt('Formato de exportación: "txt" o "json"', 'txt');
    resolve(f === 'json' ? 'json' : 'txt');
  });
  if (!format) return;

  const res = await api.exportConversation(
    State.currentChat.id,
    State.currentChat.name,
    format
  );
  if (res.success) showToast(`Exportado: ${res.data.filePath}`, 'success');
  else showToast('Error al exportar', 'error');
  closeContactPanel();
}

// ═══════════════════════════════════════════════════════════════════════════
// CONFIGURACIÓN
// ═══════════════════════════════════════════════════════════════════════════
async function openSettings() {
  const cfg = await api.getConfig();
  State.config = cfg || {};
  $('cfg-force-chromium').checked  = cfg.forceInternalChromium || false;
  $('cfg-notifications').checked   = cfg.notificationsEnabled !== false;
  $('cfg-sound').checked           = cfg.soundEnabled !== false;

  const verRes = await api.getAppVersion();
  $('app-version-info').innerHTML = verRes
    ? `v${verRes.version} — Electron ${verRes.electron} — Node ${verRes.node}`
    : '';

  openModal('modal-settings');
}

async function saveSettings() {
  await api.saveConfig({
    forceInternalChromium: $('cfg-force-chromium').checked,
    notificationsEnabled:  $('cfg-notifications').checked,
    soundEnabled:          $('cfg-sound').checked,
  });
}

// ── Panel de usuario ──────────────────────────────────────────────────────────
function showUserMenu() {
  openSettings();
}

// ═══════════════════════════════════════════════════════════════════════════
// EMOJI PICKER
// ═══════════════════════════════════════════════════════════════════════════
const EMOJIS = [
  '😀','😂','😍','🤔','😎','😢','😡','🤩','😴','🤪',
  '👍','👎','👋','🙌','🤝','👏','🎉','🔥','💯','❤️',
  '💚','💙','💜','🖤','🤍','💔','✨','⭐','🌟','💫',
  '🎵','🎶','📱','💻','🖥️','📧','📞','🔔','⚠️','✅',
  '❌','✔️','🔴','🟡','🟢','🔵','⬆️','⬇️','➡️','⬅️',
  '😊','😇','🥰','🤗','😅','😆','🙃','😉','😋','🤭',
  '🤔','🧐','😳','😱','🤯','😤','😠','🥺','😭','😪',
  '💪','👀','🙈','🙉','🙊','🐶','🐱','🦁','🐯','🐸',
  '🌈','☀️','🌙','⭐','❄️','🌊','🔥','🌺','🌸','🍀',
  '🍕','🍔','🍦','🎂','☕','🍺','🥂','🎁','🎈','🎊',
];

function buildEmojiPicker() {
  const picker = $('emoji-picker');
  picker.innerHTML = EMOJIS.map(e =>
    `<button class="emoji-btn" onclick="App.insertEmoji('${e}')">${e}</button>`
  ).join('');
}

function toggleEmojiPicker() {
  $('emoji-picker').classList.toggle('hidden');
}

function insertEmoji(emoji) {
  const input = $('message-input');
  const start = input.selectionStart;
  const end   = input.selectionEnd;
  input.value = input.value.slice(0, start) + emoji + input.value.slice(end);
  input.selectionStart = input.selectionEnd = start + emoji.length;
  input.focus();
  $('emoji-picker').classList.add('hidden');
}

// ═══════════════════════════════════════════════════════════════════════════
// MODALES Y NAVEGACIÓN
// ═══════════════════════════════════════════════════════════════════════════
function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.add('hidden'));
  $(id)?.classList.remove('hidden');
  if (id === 'screen-main') $(id).classList.add('active');
}

function openModal(id) {
  $(id)?.classList.remove('hidden');
}

function closeModal(id) {
  $(id)?.classList.add('hidden');
}

// Cerrar modales con Escape
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') {
    document.querySelectorAll('.modal:not(.hidden)').forEach(m => m.classList.add('hidden'));
    closeLightbox();
    closeCtxMenu();
  }
});

// Cerrar emoji picker al hacer click fuera
document.addEventListener('click', e => {
  if (!e.target.closest('#emoji-picker') && !e.target.closest('[onclick*="toggleEmojiPicker"]')) {
    $('emoji-picker')?.classList.add('hidden');
  }
});

// ═══════════════════════════════════════════════════════════════════════════
// HELPERS
// ═══════════════════════════════════════════════════════════════════════════
function showToast(msg, type = 'info') {
  const toast = $('toast');
  toast.textContent  = msg;
  toast.className    = `toast toast-${type}`;
  toast.classList.remove('hidden');
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.add('hidden'), 3500);
}

function scrollToBottom() {
  const wrap = $('messages');
  wrap.scrollTop = wrap.scrollHeight;
}

function onMessagesScroll() {
  // Lazy load: si llega al top, cargar más mensajes (futuro)
}

function getInitials(name = '') {
  return name.split(' ').slice(0, 2).map(w => w[0] || '').join('').toUpperCase() || '?';
}

function esc(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function formatTime(ts) {
  if (!ts) return '';
  const d = new Date(ts * 1000);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  }
  const yesterday = new Date(now - 86400000);
  if (d.toDateString() === yesterday.toDateString()) return 'Ayer';
  return d.toLocaleDateString('es-ES', { day: '2-digit', month: '2-digit' });
}

function formatCountdown(ms) {
  const s = Math.floor(ms / 1000);
  if (s < 60)    return `${s}s`;
  if (s < 3600)  return `${Math.floor(s / 60)}m ${s % 60}s`;
  if (s < 86400) return `${Math.floor(s / 3600)}h ${Math.floor((s % 3600) / 60)}m`;
  return `${Math.floor(s / 86400)}d`;
}

function formatText(text) {
  if (!text) return '';
  // Escapar HTML primero
  let t = esc(text);
  // WhatsApp formatting
  t = t.replace(/\*([^*\n]+)\*/g, '<strong>$1</strong>');  // *bold*
  t = t.replace(/_([^_\n]+)_/g,   '<em>$1</em>');          // _italic_
  t = t.replace(/~([^~\n]+)~/g,   '<del>$1</del>');         // ~strike~
  t = t.replace(/```([^`]+)```/g,  '<code>$1</code>');       // ```code```
  t = t.replace(/\n/g, '<br>');
  return t;
}

function extractVarsFromBody(body) {
  const m = body.match(/\{\{(\w+)\}\}/g) || [];
  return [...new Set(m.map(x => x.replace(/[{}]/g, '')))];
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPOSICIÓN PÚBLICA (window.App)
// ═══════════════════════════════════════════════════════════════════════════
// Exponer showToast globalmente para uso en onclick inline del HTML
window.showToast = showToast;

window.App = {
  connectWA, toggleForceChromium, toggleDebug, retryQR, disconnect, clearSession,
  openChat, sendMessage, onInputKeydown, onInputChange, onPaste, cancelPaste, sendPastedImage,
  attachFile, setQuote, clearQuote, loadMedia, openLightbox, closeLightbox, downloadFromLightbox,
  downloadDoc, showCtxMenu, closeCtxMenu, ctxReply, ctxCopy, ctxDelete,
  toggleChatSearch, closeChatSearch, searchInChat,
  startRecording, stopRecording,
  openContactPanel, closeContactPanel, exportConversation,
  openScheduleModal, selectScheduleTab, scheduleMessage, openScheduled,
  renderScheduledList, cancelScheduled,
  openTemplates, openTemplatesInline, filterTemplates, insertTemplate,
  newTemplate, editTemplate, cancelTemplateEdit, previewTemplate, saveTemplate, removeTemplate,
  openSettings, saveSettings, showUserMenu,
  setFilter, onSearch, openNewChat,
  toggleEmojiPicker, insertEmoji,
  openModal, closeModal,
};

// ── ARRANQUE ──────────────────────────────────────────────────────────────────
init();
