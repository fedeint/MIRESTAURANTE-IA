'use strict';

// ── Estado global ──────────────────────────────────────────────────────────
let config = { appUrl: 'http://localhost:1995', routes: ['/'], appPort: 1995 };
let currentPath = '/';
let zoomVal = 70;
let activeDevices = new Set(['iphone', 'macbook']);
let syncOn = true;
let comments = [];

const $ = (id) => document.getElementById(id);
const COMMENTS_KEY = 'leyavi-comments-v4';

// ── Inicialización ──────────────────────────────────────────────────────────
async function init() {
  try {
    const res = await fetch('/api/config');
    config = await res.json();
  } catch (e) {
    console.warn('No se pudo cargar config, usando defaults');
  }

  buildRouteChips();
  renderDevices();
  loadComments();
  setupKeyboard();
  setupReloadWebSocket();
  checkConnection();
  setInterval(checkConnection, 4000);
}

// ── Rutas ──────────────────────────────────────────────────────────────────
function buildRouteChips() {
  const bar = $('routesBar');
  if (!bar) return;
  bar.innerHTML = '<span class="routes-bar-label">Rutas:</span>' +
    (config.routes || ['/']).map((r) =>
      `<div class="route-chip${r === currentPath ? ' active' : ''}" data-path="${r}">${r}</div>`
    ).join('');

  bar.addEventListener('click', (e) => {
    const chip = e.target.closest('.route-chip');
    if (!chip) return;
    navigateTo(chip.dataset.path);
    bar.querySelectorAll('.route-chip').forEach((c) => c.classList.remove('active'));
    chip.classList.add('active');
  });
}

function navigateTo(path) {
  currentPath = path;
  getAllIframes().forEach((f) => { f.src = config.appUrl + path; });
  const urlDisplay = $('urlInput');
  if (urlDisplay) urlDisplay.value = config.appUrl + path;
}

// ── Dispositivos ──────────────────────────────────────────────────────────
function renderDevices() {
  const area = $('devicesArea');
  if (!area) return;
  area.innerHTML = '';

  activeDevices.forEach((devId) => {
    const dev = DEVICES[devId];
    if (!dev) return;
    const html = buildDeviceHTML(dev, config.appUrl, currentPath);
    area.insertAdjacentHTML('beforeend', html);

    const sendBtn = area.querySelector(`.dc-send[data-dev="${devId}"]`);
    if (sendBtn) sendBtn.addEventListener('click', () => addComment(devId));

    const inp = $('inp-' + devId);
    if (inp) inp.addEventListener('keydown', (e) => { if (e.key === 'Enter') addComment(devId); });

    const clearBtn = area.querySelector(`.dc-clear[data-dev="${devId}"]`);
    if (clearBtn) clearBtn.addEventListener('click', () => clearDeviceComments(devId));
  });

  applyZoom();
  renderAllComments();
}

function getAllIframes() {
  return Array.from(activeDevices)
    .map((id) => $('if-' + id))
    .filter(Boolean);
}

// ── Toolbar: toggle dispositivos ──────────────────────────────────────────
function setupDeviceToggles() {
  document.querySelectorAll('[data-toggle-dev]').forEach((btn) => {
    const devId = btn.dataset.toggleDev;
    btn.classList.toggle('btn-active', activeDevices.has(devId));

    btn.addEventListener('click', () => {
      if (activeDevices.has(devId)) activeDevices.delete(devId);
      else activeDevices.add(devId);
      btn.classList.toggle('btn-active', activeDevices.has(devId));
      renderDevices();
    });
  });
}

// ── Zoom ──────────────────────────────────────────────────────────────────
function changeZoom(delta) {
  zoomVal = Math.max(20, Math.min(150, zoomVal + delta));
  const label = $('zoomLabel');
  if (label) label.textContent = zoomVal + '%';
  applyZoom();
}

function applyZoom() {
  const scale = zoomVal / 100;
  document.querySelectorAll('.device-col').forEach((col) => {
    col.style.transform = `scale(${scale})`;
    col.style.transformOrigin = 'top left';
    const screen = col.querySelector('.screen');
    const w = screen ? parseInt(screen.style.width) || 0 : 0;
    if (w > 0) col.style.marginRight = `-${Math.round(w * (1 - scale))}px`;
  });
}

// ── Reload ────────────────────────────────────────────────────────────────
function reloadAll() {
  getAllIframes().forEach((f) => { f.src = f.src; });
}

// ── Sync toggle ──────────────────────────────────────────────────────────
function toggleSync() {
  syncOn = !syncOn;
  const btn = $('syncBtn');
  if (btn) {
    btn.textContent = syncOn ? '🔗 Sync ON' : '🔗 Sync OFF';
    btn.classList.toggle('btn-active', syncOn);
  }
}

// ── Auto-reload desde file watcher via WebSocket ─────────────────────────
function setupReloadWebSocket() {
  try {
    const ws = new WebSocket('ws://localhost:3001/sync');
    ws.onopen = () => ws.send(JSON.stringify({ t: 'register', device: '__previewer__' }));
    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        if (msg.t === 'reload') reloadAll();
      } catch (_) {}
    };
    ws.onclose = () => setTimeout(setupReloadWebSocket, 1000);
    ws.onerror = () => {};
  } catch (_) {}
}

// ── Conexión ─────────────────────────────────────────────────────────────
async function checkConnection() {
  const dot = $('statusDot');
  if (!dot) return;
  try {
    await fetch(config.appUrl, { mode: 'no-cors', cache: 'no-cache' });
    dot.classList.remove('off');
    dot.title = 'App activa';
  } catch (_) {
    dot.classList.add('off');
    dot.title = 'App no responde';
  }
}

// ── Comentarios ───────────────────────────────────────────────────────────
function loadComments() {
  try {
    const stored = localStorage.getItem(COMMENTS_KEY);
    comments = stored ? JSON.parse(stored) : [];
  } catch (_) { comments = []; }
  renderAllComments();
}

function saveComments() {
  localStorage.setItem(COMMENTS_KEY, JSON.stringify(comments));
  renderAllComments();
  persistCommentsToDisk();
}

async function persistCommentsToDisk() {
  try {
    await fetch('/api/feedback', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(comments),
    });
  } catch (_) {}
}

function addComment(devId) {
  const inp = $('inp-' + devId);
  if (!inp) return;
  const text = inp.value.trim();
  if (!text) return;
  const typeEl = $('type-' + devId);
  comments.push({
    id: Date.now(),
    type: typeEl ? typeEl.value : 'note',
    device: devId,
    route: currentPath,
    text,
    timestamp: new Date().toISOString(),
  });
  inp.value = '';
  saveComments();
}

function deleteComment(id) {
  comments = comments.filter((c) => c.id !== id);
  saveComments();
}

function clearDeviceComments(devId) {
  const count = comments.filter((c) => c.device === devId).length;
  if (!count) return;
  if (confirm(`¿Limpiar ${count} comentario(s) de ${devId}?`)) {
    comments = comments.filter((c) => c.device !== devId);
    saveComments();
  }
}

function renderAllComments() {
  const ICONS = { bug: '🐛', fix: '🔧', note: '📝', ok: '✅' };

  activeDevices.forEach((devId) => {
    const list = $('list-' + devId);
    const badge = $('badge-' + devId);
    if (!list) return;

    const dc = comments.filter((c) => c.device === devId);
    if (badge) badge.textContent = dc.length;

    if (!dc.length) { list.innerHTML = ''; return; }

    list.innerHTML = dc.map((c) => {
      const t = new Date(c.timestamp).toLocaleTimeString('es', { hour: '2-digit', minute: '2-digit' });
      return `<div class="c-item type-${c.type}">
        <span class="c-tag">${ICONS[c.type] || '💬'}</span>
        <span class="c-text">${escHtml(c.text)}</span>
        <span class="c-meta">
          <span class="c-route">${c.route}</span>
          ${t}
          <span class="c-del" data-id="${c.id}">×</span>
        </span>
      </div>`;
    }).join('');

    list.querySelectorAll('.c-del').forEach((btn) => {
      btn.addEventListener('click', () => deleteComment(parseInt(btn.dataset.id, 10)));
    });
  });
}

function escHtml(str) {
  const d = document.createElement('div');
  d.textContent = str;
  return d.innerHTML;
}

// ── Keyboard shortcuts ────────────────────────────────────────────────────
function setupKeyboard() {
  document.addEventListener('keydown', (e) => {
    if (e.target.closest('input, select, textarea')) return;
    if ((e.metaKey || e.ctrlKey) && e.key === 'r') { e.preventDefault(); reloadAll(); }
    if (e.key === 's') toggleSync();
  });
}

// ── URL input ─────────────────────────────────────────────────────────────
function setupUrlInput() {
  const inp = $('urlInput');
  if (!inp) return;
  inp.value = config.appUrl;
  inp.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      config.appUrl = inp.value.replace(/\/+$/, '');
      navigateTo(currentPath);
    }
  });
}

// ── Zoom buttons ──────────────────────────────────────────────────────────
function setupZoomButtons() {
  const zoomIn = $('zoomIn');
  const zoomOut = $('zoomOut');
  if (zoomIn) zoomIn.addEventListener('click', () => changeZoom(10));
  if (zoomOut) zoomOut.addEventListener('click', () => changeZoom(-10));
}

// ── Boot ──────────────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', async () => {
  await init();
  setupDeviceToggles();
  setupUrlInput();
  setupZoomButtons();
  $('reloadBtn')?.addEventListener('click', reloadAll);
  $('syncBtn')?.addEventListener('click', toggleSync);
});
