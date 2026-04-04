const vscode = acquireVsCodeApi();
window._vscode = vscode;
let baseUrl = document.getElementById('urlInput')?.value || 'http://localhost:1995';
let curPath = '/';
window._currentRoute = '/';
let zoomVal = 50;
let syncOn = true;
let comments = [];
let focused = null;
let dualOn = false;
let syncing = false;
let touring = false;

const $ = id => document.getElementById(id);

// ===== MODE TOGGLE =====
let currentMode = 'test';

function switchMode(mode) {
  currentMode = mode;
  document.querySelectorAll('.mode-container').forEach(c => c.classList.remove('active'));
  const container = document.getElementById('mode-' + mode);
  if (container) container.classList.add('active');

  document.querySelectorAll('.mode-toggle-btn').forEach(btn => {
    btn.className = 'mode-toggle-btn';
    if (btn.dataset.mode === mode) {
      btn.classList.add('active-' + mode);
    }
  });

  if (mode === 'map' && window.mapMode) {
    mapMode.init();
  }

  if (mode === 'build' && window.buildMode) {
    buildMode.init();
  }

  window._currentMode = mode;
}

// Wire mode toggle buttons (app.js loads at end of <body>, DOM is ready)
document.querySelectorAll('.mode-toggle-btn').forEach(btn => {
  btn.addEventListener('click', () => switchMode(btn.dataset.mode));
});

// ===== DEVICE DEFINITIONS =====
const DEVICES = {
  iphone: {
    name: 'iPhone 15 Pro', width: 393, height: 852, category: 'mobile', os: 'ios',
    frameClass: 'frame-iphone',
    frameExtra: '<div class="home-indicator"></div>',
  },
  android: {
    name: 'Pixel 8', width: 412, height: 915, category: 'mobile', os: 'android',
    frameClass: 'frame-android',
    frameExtra: '<div class="nav-bar"><div class="nav-tri"></div><div class="nav-dot"></div><div class="nav-sq"></div></div>',
  },
  ipad: {
    name: 'iPad Air', width: 820, height: 1180, category: 'tablet', os: 'ios',
    frameClass: 'frame-ipad', frameExtra: '',
  },
  'android-tab': {
    name: 'Galaxy Tab S9', width: 800, height: 1280, category: 'tablet', os: 'android',
    frameClass: 'frame-android-tab', frameExtra: '',
  },
  macbook: {
    name: 'MacBook Pro', width: 1440, height: 900, category: 'desktop', os: 'macos',
    frameClass: 'frame-macbook', frameExtra: '',
  },
  windows: {
    name: 'Windows PC', width: 1366, height: 768, category: 'desktop', os: 'windows',
    frameClass: 'frame-windows', frameExtra: '',
  },
};

let activeDevices = new Set(['macbook', 'windows', 'iphone', 'android']);

// ===== BUILD DEVICES =====
function buildDevices() {
  const area = $('devicesArea');
  area.innerHTML = '';

  activeDevices.forEach(devId => {
    const d = DEVICES[devId];
    if (!d) return;

    const col = document.createElement('div');
    col.className = 'device-col';
    col.id = 'col-' + devId;

    col.innerHTML =
      '<div class="device-header">' +
        '<span class="device-label">' + d.name + ' ' + d.width + 'x' + d.height + '</span>' +
        '<button class="screenshot-btn" onclick="screenshotDevice(\'' + devId + '\')">' + String.fromCodePoint(128247) + '</button>' +
      '</div>' +
      '<div class="' + d.frameClass + '">' +
        '<div class="screen" style="width:' + d.width + 'px;height:' + d.height + 'px;">' +
          '<iframe id="if-' + devId + '" src="' + baseUrl + curPath + '"></iframe>' +
        '</div>' +
        d.frameExtra +
      '</div>' +
      '<div class="dc-box" data-dev="' + devId + '">' +
        '<div class="dc-head" onclick="focusDevice(\'' + devId + '\')">' +
          '<span class="dc-title">' + d.name + '</span>' +
          '<span class="dc-badge" id="badge-' + devId + '">0</span>' +
          '<button class="dc-clear" onclick="event.stopPropagation();clearComments(\'' + devId + '\')">Limpiar</button>' +
        '</div>' +
        '<div class="dc-list" id="list-' + devId + '"></div>' +
        '<div class="dc-input">' +
          '<select id="type-' + devId + '"><option value="bug">Bug</option><option value="fix">Fix</option><option value="note">Nota</option><option value="ok">OK</option></select>' +
          '<input id="inp-' + devId + '" placeholder="Comentario..." onkeydown="if(event.key===\'Enter\')addC(\'' + devId + '\')" />' +
          '<button class="send" onclick="addC(\'' + devId + '\')">&#x2191;</button>' +
        '</div>' +
      '</div>';

    area.appendChild(col);
  });

  zoom(0);
  render();
  setupSync();
}

function toggleDevice(el) {
  const devId = el.dataset.dev;
  el.classList.toggle('active');
  if (activeDevices.has(devId)) activeDevices.delete(devId);
  else activeDevices.add(devId);
  buildDevices();
}

function getIframes() {
  return Array.from(activeDevices).map(d => $('if-' + d)).filter(Boolean);
}

// ===== ZOOM =====
function zoom(d) {
  zoomVal = Math.max(20, Math.min(150, zoomVal + d));
  $('zoomLbl').textContent = zoomVal + '%';
  const s = zoomVal / 100;
  document.querySelectorAll('.device-col').forEach(c => {
    c.style.transform = 'scale(' + s + ')';
    c.style.transformOrigin = 'top center';
  });
}

// ===== NAV =====
function nav(path, el) {
  curPath = path;
  window._currentRoute = path;
  if (window.miniMapSystem) miniMapSystem.render('mini-map-context', path);
  const url = baseUrl + path;
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  if (el) el.classList.add('active');
  getIframes().forEach(f => f.src = url);
}

function reloadAll() {
  baseUrl = $('urlInput').value.replace(/\/+$/, '');
  getIframes().forEach(f => { f.src = baseUrl + curPath; });
}

// ===== TOGGLE =====
function toggleSync() {
  syncOn = !syncOn;
  $('syncBtn').textContent = syncOn ? 'Sync' : 'Sync OFF';
  $('syncBtn').classList.toggle('active', syncOn);
}

function toggleDual() {
  dualOn = !dualOn;
  document.body.classList.toggle('dual-mode', dualOn);
  $('dualBtn').classList.toggle('active', dualOn);
  if (dualOn && focused) exitFocus();
}

// ===== FOCUS =====
function focusDevice(dev) {
  if (dualOn) return;
  if (focused === dev) { exitFocus(); return; }
  focused = dev;
  document.body.classList.add('focus-mode');
  document.querySelectorAll('.device-col').forEach(c => c.classList.remove('focused'));
  var el = $('col-' + dev);
  if (el) el.classList.add('focused');
}

function exitFocus() {
  focused = null;
  document.body.classList.remove('focus-mode');
  document.querySelectorAll('.device-col').forEach(c => c.classList.remove('focused'));
  zoom(0);
}

// ===== COMMENTS =====
function addC(dev) {
  const inp = $('inp-' + dev);
  if (!inp) return;
  const text = inp.value.trim();
  if (!text) return;
  comments.push({ id: Date.now(), type: $('type-' + dev).value, device: dev, route: curPath, text, timestamp: new Date().toISOString() });
  inp.value = '';
  save();
}

function delC(id) { comments = comments.filter(c => c.id !== id); save(); }
function clearComments(dev) { comments = comments.filter(c => c.device !== dev); save(); }

function save() {
  render();
  vscode.setState({ comments });
  vscode.postMessage({ type: 'save-feedback', comments });
}

function render() {
  const allDevs = [...activeDevices, 'ambos'];
  allDevs.forEach(dev => {
    const list = $('list-' + dev);
    const badge = $('badge-' + dev);
    if (!list) return;
    const dc = comments.filter(c => c.device === dev);
    if (badge) badge.textContent = dc.length;
    if (!dc.length) { list.innerHTML = ''; return; }
    const tags = { bug: 'BUG', fix: 'FIX', note: 'NOTA', ok: 'OK' };
    list.innerHTML = dc.map(c => {
      const t = new Date(c.timestamp).toLocaleTimeString('es', { hour:'2-digit', minute:'2-digit' });
      return '<div class="c-item ' + c.type + '"><span class="c-tag ' + c.type + '">' + tags[c.type] + '</span>'
        + '<span class="c-text">' + esc(c.text) + '</span>'
        + '<span class="c-meta"><span class="c-route">' + c.route + '</span> ' + t
        + ' <span class="c-del" onclick="delC(' + c.id + ')">x</span></span></div>';
    }).join('');
  });
}

function esc(s) { const d = document.createElement('div'); d.textContent = s; return d.innerHTML; }

// ===== TOUR =====
function getRoutes() {
  return Array.from(document.querySelectorAll('.chip')).map(c => {
    const m = c.getAttribute('onclick')?.match(/nav\('([^']+)'/);
    return m ? m[1] : null;
  }).filter(Boolean);
}

function startTour() {
  if (touring) return;
  touring = true;
  $('tourBar').classList.add('visible');
  $('tourBtn').classList.add('active');
  $('tourBtn').innerHTML = '&#9632; Running...';
  $('tourInfo').textContent = 'Iniciando Playwright...';
  $('tourProgress').style.width = '0%';
  vscode.postMessage({ type: 'start-tour', url: baseUrl, routes: getRoutes() });
}

function stopTour() {
  touring = false;
  $('tourBar').classList.remove('visible');
  $('tourBtn').classList.remove('active');
  $('tourBtn').innerHTML = '&#9654; Tour';
  vscode.postMessage({ type: 'stop-tour' });
}

function screenshotAll() { vscode.postMessage({ type: 'take-screenshot', url: baseUrl, route: curPath }); }
function screenshotDevice(dev) { vscode.postMessage({ type: 'take-screenshot', url: baseUrl, route: curPath, device: dev }); }
function openScreenshots() { vscode.postMessage({ type: 'open-screenshots' }); }

function handleTourProgress(data) {
  const pct = Math.round((data.current / data.total) * 100);
  $('tourProgress').style.width = pct + '%';
  $('tourDevice').textContent = data.device;
  $('tourInfo').textContent = data.route + ' (' + data.current + '/' + data.total + ')';
  const chip = document.querySelector('.chip[onclick*="\'' + data.route + '\'"]');
  if (chip) nav(data.route, chip);
}

function handleTourDone(results) {
  stopTour();
  if (!results?.length) return;
  $('tourResultsCount').textContent = results.filter(r => r.success).length + '/' + results.length;
  $('tourResultsGrid').innerHTML = results.map(r =>
    '<div class="tour-result-card">' +
    (r.success
      ? '<div style="padding:12px;text-align:center;color:var(--green);font-size:10px">&#10003; ' + esc(r.filename) + '</div>'
      : '<div style="padding:12px;text-align:center;color:var(--red);font-size:10px">Error: ' + esc(r.error || '') + '</div>') +
    '<div class="tour-result-info"><span class="tour-result-route">' + r.route + '</span><span class="tour-result-device">' + r.device + '</span></div></div>'
  ).join('');
  $('tourResults').classList.add('visible');
}

function closeTourResults() { $('tourResults').classList.remove('visible'); }

// ===== SYNC =====
function attachSync(src, targets) {
  try {
    const doc = src.contentDocument;
    if (!doc) return;
    doc.addEventListener('click', e => {
      if (!syncOn || syncing) return;
      syncing = true;
      const sel = getSelector(e.target);
      targets.forEach(t => {
        try { const el = t.contentDocument?.querySelector(sel); if (el) { el.style.outline = '2px solid #fab387'; setTimeout(() => el.style.outline = '', 400); el.click(); } } catch {}
      });
      setTimeout(() => syncing = false, 100);
    }, true);
    doc.addEventListener('scroll', e => {
      if (!syncOn || syncing) return;
      syncing = true;
      const s = e.target === doc ? doc.documentElement : e.target;
      const max = s.scrollHeight - s.clientHeight;
      const pct = max > 0 ? s.scrollTop / max : 0;
      targets.forEach(t => {
        try { const td = t.contentDocument; const el = e.target === doc ? td.documentElement : td.querySelector(getSelector(e.target)); if (el) el.scrollTop = pct * (el.scrollHeight - el.clientHeight); } catch {}
      });
      setTimeout(() => syncing = false, 50);
    }, true);
    doc.addEventListener('input', e => {
      if (!syncOn || syncing) return;
      syncing = true;
      const sel = getSelector(e.target);
      targets.forEach(t => {
        try { const el = t.contentDocument.querySelector(sel); if (el) { el.value = e.target.value; el.dispatchEvent(new Event('input', {bubbles:true})); } } catch {}
      });
      setTimeout(() => syncing = false, 50);
    }, true);
  } catch {}
}

function getSelector(el) {
  if (el.id) return '#' + el.id;
  const parts = [];
  let cur = el;
  while (cur && cur.tagName && cur !== cur.ownerDocument.body) {
    let sel = cur.tagName.toLowerCase();
    if (cur.id) { parts.unshift('#' + cur.id); break; }
    const p = cur.parentElement;
    if (p) { const sibs = Array.from(p.children).filter(c => c.tagName === cur.tagName); if (sibs.length > 1) sel += ':nth-of-type(' + (sibs.indexOf(cur) + 1) + ')'; }
    parts.unshift(sel);
    cur = cur.parentElement;
  }
  return parts.join('>') || 'body';
}

function setupSync() {
  const ifs = getIframes();
  ifs.forEach(src => {
    src.addEventListener('load', () => attachSync(src, ifs.filter(f => f !== src)));
  });
}

// ===== TERMINAL (delegated to terminal.js) =====
let currentPid = null;

function toggleTerminal() { terminalSystem.toggle(); }
function clearTerminal() { terminalSystem.clear(); }
function handleTermKey(event) { terminalSystem.handleKey(event); }

// ===== CONNECTION =====
async function checkConn() {
  try { await fetch(baseUrl, { mode: 'no-cors', cache: 'no-cache' }); $('statusDot').classList.remove('off'); } catch { $('statusDot').classList.add('off'); }
}

// ===== MESSAGES =====
window.addEventListener('message', e => {
  const msg = e.data;
  switch (msg.type) {
    case 'reload': reloadAll(); break;
    case 'start-tour-ui': startTour(); break;
    case 'tour-status': if (msg.status === 'error' || msg.status === 'stopped') stopTour(); break;
    case 'tour-progress': handleTourProgress(msg); break;
    case 'tour-done': case 'screenshot-done': handleTourDone(msg.results); break;
    case 'tour-error': case 'screenshot-error': stopTour(); break;
    case 'term-started': currentPid = msg.pid; window._currentPid = msg.pid; terminalSystem.addLine('$ ' + msg.command, 'info'); break;
    case 'term-output': terminalSystem.addLine(msg.data.replace(/\n$/, ''), msg.isError ? 'err' : 'out'); break;
    case 'term-exit': currentPid = null; window._currentPid = null; terminalSystem.addLine('Process exited with code ' + msg.code, msg.code === 0 ? 'exit-ok' : 'exit-fail'); break;
    case 'load-module-map':
      miniMapSystem.load(msg.data);
      miniMapSystem.render('mini-map-context', window._currentRoute || '/');
      break;
  }
});

// ===== KEYS =====
document.addEventListener('keydown', e => {
  if (e.target.closest('input,select')) return;
  if (e.key === 'Escape') { if ($('tourResults').classList.contains('visible')) closeTourResults(); else if (focused) exitFocus(); }
  if (e.key === 'd') toggleDual();
  if (e.key === 's') toggleSync();
  if (e.key === 't') startTour();
});

// ===== RESTORE & INIT =====
const state = vscode.getState();
if (state?.comments) { comments = state.comments; }

buildDevices();
terminalSystem.init();
setInterval(checkConn, 3000);
checkConn();
