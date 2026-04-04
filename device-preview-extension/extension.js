const vscode = require('vscode');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');

let panel = null;
let tourProcess = null;
let shellProcesses = new Map();

function activate(context) {
  const openCmd = vscode.commands.registerCommand('devicePreview.open', () => openDevicePreview(context));
  const reloadCmd = vscode.commands.registerCommand('devicePreview.reload', () => {
    if (panel) panel.webview.postMessage({ type: 'reload' });
  });
  const tourCmd = vscode.commands.registerCommand('devicePreview.tour', () => {
    if (!panel) openDevicePreview(context);
    setTimeout(() => panel?.webview.postMessage({ type: 'start-tour-ui' }), panel ? 0 : 1000);
  });

  const saveWatcher = vscode.workspace.onDidSaveTextDocument((doc) => {
    const config = vscode.workspace.getConfiguration('devicePreview');
    if (!config.get('autoReload') || !panel) return;
    if (['.ejs', '.html', '.css', '.js', '.json'].includes(path.extname(doc.fileName).toLowerCase())) {
      panel.webview.postMessage({ type: 'reload', file: doc.fileName });
    }
  });

  context.subscriptions.push(openCmd, reloadCmd, tourCmd, saveWatcher);
}

function openDevicePreview(context) {
  if (panel) { panel.reveal(vscode.ViewColumn.Beside); return; }

  const config = vscode.workspace.getConfiguration('devicePreview');
  const appUrl = config.get('appUrl') || 'http://localhost:1995';

  panel = vscode.window.createWebviewPanel(
    'devicePreview', 'Device Preview', vscode.ViewColumn.Beside,
    { enableScripts: true, retainContextWhenHidden: true, localResourceRoots: [vscode.Uri.joinPath(context.extensionUri, 'webview')] }
  );

  const workspaceRoot = vscode.workspace.workspaceFolders?.[0]?.uri.fsPath || '';
  const feedbackPath = path.join(workspaceRoot, 'preview', 'feedback.json');
  const screenshotDir = path.join(workspaceRoot, 'preview', 'screenshots');

  panel.webview.html = getWebviewContent(context, panel.webview, appUrl);

  panel.webview.onDidReceiveMessage((msg) => {
    switch (msg.type) {
      case 'save-feedback': saveFeedback(feedbackPath, msg.comments); break;
      case 'start-tour': startPlaywrightTour(msg, screenshotDir, appUrl); break;
      case 'stop-tour': stopTour(); break;
      case 'take-screenshot': takeScreenshot(msg, screenshotDir, appUrl); break;
      case 'open-screenshots': openScreenshotsFolder(screenshotDir); break;
      case 'run-command': runShellCommand(msg, workspaceRoot); break;
      case 'kill-command': killShellCommand(msg.pid); break;
    }
  });

  panel.onDidDispose(() => { panel = null; stopTour(); });
}

// ===== FEEDBACK =====
function saveFeedback(feedbackPath, comments) {
  try {
    const dir = path.dirname(feedbackPath);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(feedbackPath, JSON.stringify(comments, null, 2));
  } catch (e) {
    vscode.window.showErrorMessage('Error guardando feedback: ' + e.message);
  }
}

// ===== PLAYWRIGHT TOUR =====
function startPlaywrightTour(msg, screenshotDir, defaultUrl) {
  stopTour();
  if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });

  const args = [
    path.join(__dirname, 'tour-runner.js'),
    `--url=${msg.url || defaultUrl}`,
    `--routes=${(msg.routes || ['/']).join(',')}`,
    `--output=${screenshotDir}`,
  ];
  if (msg.device) args.push(`--device=${msg.device}`);

  panel?.webview.postMessage({ type: 'tour-status', status: 'starting' });
  tourProcess = spawn('node', args, { cwd: __dirname });

  let buffer = '';
  tourProcess.stdout.on('data', (data) => {
    buffer += data.toString();
    const lines = buffer.split('\n');
    buffer = lines.pop() || '';
    lines.forEach(line => {
      if (!line.trim()) return;
      try {
        const parsed = JSON.parse(line);
        if (parsed.type === 'progress') panel?.webview.postMessage({ type: 'tour-progress', ...parsed });
        else if (parsed.type === 'done') {
          panel?.webview.postMessage({ type: 'tour-done', results: parsed.results });
          vscode.window.showInformationMessage(`Tour: ${parsed.results.filter(r => r.success).length} screenshots`);
        }
      } catch {}
    });
  });

  tourProcess.stderr.on('data', (data) => {
    try {
      const p = JSON.parse(data.toString());
      if (p.error) { panel?.webview.postMessage({ type: 'tour-error', error: p.error }); }
    } catch {}
  });

  tourProcess.on('close', (code) => {
    tourProcess = null;
    if (code !== 0) panel?.webview.postMessage({ type: 'tour-status', status: 'error' });
  });
}

function takeScreenshot(msg, screenshotDir, defaultUrl) {
  if (!fs.existsSync(screenshotDir)) fs.mkdirSync(screenshotDir, { recursive: true });
  const args = [
    path.join(__dirname, 'tour-runner.js'),
    `--url=${msg.url || defaultUrl}`, `--routes=${msg.route || '/'}`,
    `--output=${screenshotDir}`, `--action=screenshot`,
  ];
  if (msg.device) args.push(`--device=${msg.device}`);

  const proc = spawn('node', args, { cwd: __dirname });
  let output = '';
  proc.stdout.on('data', d => output += d.toString());
  proc.on('close', () => {
    try {
      const lines = output.split('\n').filter(l => l.trim());
      const parsed = JSON.parse(lines[lines.length - 1]);
      if (parsed.type === 'done') panel?.webview.postMessage({ type: 'screenshot-done', results: parsed.results });
    } catch {}
  });
}

function stopTour() {
  if (tourProcess) { tourProcess.kill(); tourProcess = null; panel?.webview.postMessage({ type: 'tour-status', status: 'stopped' }); }
}

// ===== SHELL =====
function runShellCommand(msg, cwd) {
  const cmd = msg.command;
  if (!cmd?.trim()) return;
  const shell = process.platform === 'win32' ? 'cmd.exe' : '/bin/zsh';
  const shellArgs = process.platform === 'win32' ? ['/c', cmd] : ['-c', cmd];

  const proc = spawn(shell, shellArgs, { cwd: cwd || process.env.HOME, env: { ...process.env, FORCE_COLOR: '0' } });
  const pid = proc.pid;
  shellProcesses.set(pid, proc);
  panel?.webview.postMessage({ type: 'term-started', pid, command: cmd });

  proc.stdout.on('data', d => panel?.webview.postMessage({ type: 'term-output', pid, data: d.toString() }));
  proc.stderr.on('data', d => panel?.webview.postMessage({ type: 'term-output', pid, data: d.toString(), isError: true }));
  proc.on('close', code => { shellProcesses.delete(pid); panel?.webview.postMessage({ type: 'term-exit', pid, code }); });
}

function killShellCommand(pid) {
  const proc = shellProcesses.get(pid);
  if (proc) { proc.kill('SIGTERM'); shellProcesses.delete(pid); }
}

function openScreenshotsFolder(dir) {
  if (fs.existsSync(dir)) vscode.env.openExternal(vscode.Uri.file(dir));
  else vscode.window.showWarningMessage('No hay screenshots. Ejecuta un tour primero.');
}

// ===== WEBVIEW =====
function getWebviewContent(context, webview, appUrl) {
  const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'webview', 'styles.css'));
  return `<!DOCTYPE html>
<html lang="es">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; frame-src *; style-src 'unsafe-inline' ${webview.cspSource} https://fonts.googleapis.com; script-src 'unsafe-inline'; img-src * data:; font-src https://fonts.gstatic.com;">
<link rel="stylesheet" href="${cssUri}">
</head>
<body>

<div class="topbar">
  <div class="topbar-brand"><div class="topbar-logo">D</div><span class="topbar-title">Device Preview</span></div>
  <input class="url-input" id="urlInput" value="${appUrl}" onkeydown="if(event.key==='Enter'){baseUrl=this.value.replace(/\\\\/+$/,'');reloadAll()}" />
  <button class="btn" onclick="reloadAll()">&#x21bb;</button>
  <span class="sep"></span>
  <div class="zoom">
    <button class="btn" onclick="zoom(-10)">-</button>
    <span class="zoom-label" id="zoomLbl">50%</span>
    <button class="btn" onclick="zoom(10)">+</button>
  </div>
  <span class="sep"></span>
  <button class="btn active" id="syncBtn" onclick="toggleSync()">Sync</button>
  <button class="btn" id="dualBtn" onclick="toggleDual()">Dual</button>
  <span class="sep"></span>
  <button class="btn primary" onclick="startTour()" id="tourBtn">&#9654; Tour</button>
  <button class="btn" onclick="screenshotAll()">&#128247;</button>
  <button class="btn" onclick="openScreenshots()">&#128193;</button>
  <span class="sep"></span>
  <span class="status-dot" id="statusDot"></span>
</div>

<!-- DEVICE SELECTOR -->
<div class="device-bar" id="deviceBar">
  <span class="device-bar-label">Desktop:</span>
  <div class="device-chip active" data-dev="macbook" onclick="toggleDevice(this)"><span class="dev-icon">&#63743;</span> Mac</div>
  <div class="device-chip active" data-dev="windows" onclick="toggleDevice(this)"><span class="dev-icon">&#128187;</span> Windows</div>
  <span class="sep"></span>
  <span class="device-bar-label">Mobile:</span>
  <div class="device-chip active" data-dev="iphone" onclick="toggleDevice(this)"><span class="dev-icon">&#128241;</span> iOS</div>
  <div class="device-chip active" data-dev="android" onclick="toggleDevice(this)"><span class="dev-icon">&#128241;</span> Android</div>
  <span class="sep"></span>
  <span class="device-bar-label">Tablet:</span>
  <div class="device-chip" data-dev="ipad" onclick="toggleDevice(this)"><span class="dev-icon">&#128195;</span> iPad</div>
  <div class="device-chip" data-dev="android-tab" onclick="toggleDevice(this)"><span class="dev-icon">&#128195;</span> Galaxy Tab</div>
</div>

<!-- ROUTES -->
<div class="routes" id="routesBar">
  <div class="chip active" onclick="nav('/',this)">/</div>
  <div class="chip" onclick="nav('/home',this)">/home</div>
  <div class="chip" onclick="nav('/login',this)">/login</div>
  <div class="chip" onclick="nav('/register',this)">/register</div>
  <div class="chip" onclick="nav('/dashboard',this)">/dashboard</div>
  <div class="chip" onclick="nav('/menu',this)">/menu</div>
  <div class="chip" onclick="nav('/pedidos',this)">/pedidos</div>
  <div class="chip" onclick="nav('/caja',this)">/caja</div>
  <div class="chip" onclick="nav('/reportes',this)">/reportes</div>
  <div class="chip" onclick="nav('/config',this)">/config</div>
</div>

<!-- TOUR PROGRESS -->
<div class="tour-bar" id="tourBar">
  <button class="btn danger" onclick="stopTour()" style="font-size:8px">&#9724; Stop</button>
  <span class="tour-device-tag" id="tourDevice">--</span>
  <span class="tour-info" id="tourInfo">Iniciando...</span>
  <div class="tour-progress"><div class="tour-progress-fill" id="tourProgress"></div></div>
</div>

<button class="focus-back" onclick="exitFocus()">&#8592; Volver</button>

<div class="devices-area" id="devicesArea"></div>

<!-- DUAL COMMENTS -->
<div class="dual-panel" id="dualPanel">
  <div class="dc-head"><span class="dc-title">Correcciones para todos</span><span class="dc-badge" id="badge-ambos">0</span><button class="dc-clear" onclick="clearComments('ambos')">Limpiar</button></div>
  <div class="dc-list" id="list-ambos"></div>
  <div class="dc-input">
    <select id="type-ambos"><option value="bug">Bug</option><option value="fix">Fix</option><option value="note">Nota</option><option value="ok">OK</option></select>
    <input id="inp-ambos" placeholder="Correccion para todos..." onkeydown="if(event.key==='Enter')addC('ambos')" />
    <button class="send" onclick="addC('ambos')">&#x2191;</button>
  </div>
</div>

<!-- TERMINAL -->
<div class="terminal-panel collapsed" id="terminalPanel">
  <div class="term-header" onclick="toggleTerminal()">
    <span class="term-title">&#62;_ Terminal</span>
    <div style="display:flex;gap:3px;align-items:center;margin-left:auto">
      <button class="btn" onclick="event.stopPropagation();clearTerminal()" style="font-size:8px;padding:1px 5px">Clear</button>
    </div>
  </div>
  <div class="term-body" id="termBody">
    <div class="term-output" id="termOutput"></div>
    <div class="term-input-row">
      <span class="term-prompt">$</span>
      <input class="term-input" id="termInput" placeholder="Escribe un comando..." spellcheck="false" onkeydown="handleTermKey(event)" />
    </div>
  </div>
</div>

<!-- TOUR RESULTS -->
<div class="tour-results" id="tourResults">
  <div class="tour-results-header">
    <h3>Tour Results</h3>
    <span id="tourResultsCount" style="font-size:10px;color:var(--subtext)"></span>
    <button class="btn" onclick="closeTourResults()">Cerrar</button>
  </div>
  <div class="tour-results-grid" id="tourResultsGrid"></div>
</div>

<script>
const vscode = acquireVsCodeApi();
let baseUrl = '${appUrl}';
let curPath = '/';
let zoomVal = 50;
let syncOn = true;
let comments = [];
let focused = null;
let dualOn = false;
let syncing = false;
let touring = false;

const $ = id => document.getElementById(id);

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
        '<button class="screenshot-btn" onclick="screenshotDevice(\\'' + devId + '\\')">' + String.fromCodePoint(128247) + '</button>' +
      '</div>' +
      '<div class="' + d.frameClass + '">' +
        '<div class="screen" style="width:' + d.width + 'px;height:' + d.height + 'px;">' +
          '<iframe id="if-' + devId + '" src="' + baseUrl + curPath + '"></iframe>' +
        '</div>' +
        d.frameExtra +
      '</div>' +
      '<div class="dc-box" data-dev="' + devId + '">' +
        '<div class="dc-head" onclick="focusDevice(\\'' + devId + '\\')">' +
          '<span class="dc-title">' + d.name + '</span>' +
          '<span class="dc-badge" id="badge-' + devId + '">0</span>' +
          '<button class="dc-clear" onclick="event.stopPropagation();clearComments(\\'' + devId + '\\')">Limpiar</button>' +
        '</div>' +
        '<div class="dc-list" id="list-' + devId + '"></div>' +
        '<div class="dc-input">' +
          '<select id="type-' + devId + '"><option value="bug">Bug</option><option value="fix">Fix</option><option value="note">Nota</option><option value="ok">OK</option></select>' +
          '<input id="inp-' + devId + '" placeholder="Comentario..." onkeydown="if(event.key===\\'Enter\\')addC(\\'' + devId + '\\')" />' +
          '<button class="send" onclick="addC(\\'' + devId + '\\')">&#x2191;</button>' +
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
  const url = baseUrl + path;
  document.querySelectorAll('.chip').forEach(c => c.classList.remove('active'));
  if (el) el.classList.add('active');
  getIframes().forEach(f => f.src = url);
}

function reloadAll() {
  baseUrl = $('urlInput').value.replace(/\\/+$/, '');
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
    const m = c.getAttribute('onclick')?.match(/nav\\('([^']+)'/);
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
  const chip = document.querySelector('.chip[onclick*="\\'' + data.route + '\\'"]');
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

// ===== TERMINAL =====
let termHistory = [];
let termHistoryIdx = -1;
let termCollapsed = true;
let currentPid = null;

function toggleTerminal() {
  termCollapsed = !termCollapsed;
  $('terminalPanel').classList.toggle('collapsed', termCollapsed);
  if (!termCollapsed) $('termInput').focus();
}

function clearTerminal() { $('termOutput').innerHTML = ''; }

function appendTerm(text, cls) {
  const output = $('termOutput');
  const line = document.createElement('div');
  line.className = 'term-line ' + cls;
  line.textContent = text;
  output.appendChild(line);
  output.scrollTop = output.scrollHeight;
}

function handleTermKey(e) {
  if (e.key === 'Enter') {
    const cmd = $('termInput').value.trim();
    if (!cmd) return;
    termHistory.unshift(cmd);
    if (termHistory.length > 50) termHistory.pop();
    termHistoryIdx = -1;
    appendTerm(cmd, 'cmd');
    $('termInput').value = '';
    vscode.postMessage({ type: 'run-command', command: cmd });
  }
  if (e.key === 'ArrowUp') { e.preventDefault(); if (termHistoryIdx < termHistory.length - 1) { termHistoryIdx++; $('termInput').value = termHistory[termHistoryIdx]; } }
  if (e.key === 'ArrowDown') { e.preventDefault(); if (termHistoryIdx > 0) { termHistoryIdx--; $('termInput').value = termHistory[termHistoryIdx]; } else { termHistoryIdx = -1; $('termInput').value = ''; } }
  if (e.key === 'c' && e.ctrlKey && currentPid) { vscode.postMessage({ type: 'kill-command', pid: currentPid }); appendTerm('^C', 'info'); }
}

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
    case 'term-started': currentPid = msg.pid; break;
    case 'term-output': appendTerm(msg.data.replace(/\\n$/, ''), msg.isError ? 'err' : 'out'); break;
    case 'term-exit': currentPid = null; appendTerm('exit ' + msg.code, msg.code === 0 ? 'exit-ok' : 'exit-fail'); break;
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
setInterval(checkConn, 3000);
checkConn();
</script>
</body>
</html>`;
}

function deactivate() { stopTour(); }
module.exports = { activate, deactivate };
