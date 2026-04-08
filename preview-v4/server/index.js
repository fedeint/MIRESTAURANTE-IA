'use strict';
const http = require('http');
const path = require('path');
const fs = require('fs');
const express = require('express');
const syncRelay = require('./sync-relay');
const { startWatcher } = require('./file-watcher');

// ── Config ──────────────────────────────────────────────────────────────────
const PREVIEWER_PORT = parseInt(process.env.LEYAVI_PORT || '3001', 10);
const PROJECT_ROOT = process.env.PROJECT_ROOT ||
  path.join(__dirname, '..', '..'); // preview-v4/../.. = project root

let APP_PORT = parseInt(process.env.APP_PORT || '1995', 10);

// Auto-detect app port from project package.json
try {
  const pkg = JSON.parse(fs.readFileSync(path.join(PROJECT_ROOT, 'package.json'), 'utf-8'));
  const startScript = (pkg.scripts || {}).start || (pkg.scripts || {}).dev || '';
  const m = startScript.match(/PORT[=\s]+(\d{3,5})/);
  if (m && !process.env.APP_PORT) APP_PORT = parseInt(m[1], 10);
} catch (_) {}

// Auto-detect routes from Express routes/ directory
function detectRoutes(root) {
  const base = ['/', '/login', '/register', '/dashboard'];
  const routesDir = path.join(root, 'routes');
  if (!fs.existsSync(routesDir)) return base;
  try {
    fs.readdirSync(routesDir)
      .filter(f => f.endsWith('.js') && f !== 'index.js')
      .forEach(f => {
        const route = '/' + f.replace('.js', '');
        if (!base.includes(route)) base.push(route);
      });
  } catch (_) {}
  return base;
}

const routes = detectRoutes(PROJECT_ROOT);

// ── Express ──────────────────────────────────────────────────────────────────
const app = express();
const server = http.createServer(app);

// Cabeceras permisivas para desarrollo local
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  next();
});

// Servir el bridge script
const BRIDGE_FILE = path.join(__dirname, '..', 'bridge', 'sync-bridge.js');
app.get('/bridge/sync-bridge.js', (_req, res) => {
  res.setHeader('Content-Type', 'application/javascript');
  res.sendFile(BRIDGE_FILE);
});

// API: config del proyecto (el cliente la lee al arrancar)
app.get('/api/config', (_req, res) => {
  res.json({
    appUrl: `http://localhost:${APP_PORT}`,
    appPort: APP_PORT,
    routes,
  });
});

// Guardar feedback de comentarios
const FEEDBACK_FILE = path.join(PROJECT_ROOT, '.leyavi', 'feedback-queue.json');

app.use(express.json({ limit: '1mb' }));

app.post('/api/feedback', (req, res) => {
  const data = req.body;
  if (!Array.isArray(data)) return res.status(400).json({ error: 'Expected array' });

  try {
    const dir = path.dirname(FEEDBACK_FILE);
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(FEEDBACK_FILE, JSON.stringify(data, null, 2));

    // Log new bugs to terminal for Claude Code to see
    const bugs = data.filter((c) => c.type === 'bug');
    if (bugs.length) {
      console.log('\n  ─── 🐛 Feedback desde Device Preview ───');
      bugs.forEach((c) => {
        console.log(`  [${c.device}] ${c.route} → ${c.text}`);
      });
      console.log('');
    }

    res.json({ ok: true, count: data.length });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Servir el cliente estático
const CLIENT_DIR = path.join(__dirname, '..', 'client');
app.use(express.static(CLIENT_DIR));

// SPA fallback
app.get('*', (_req, res) => {
  res.sendFile(path.join(CLIENT_DIR, 'index.html'));
});

// ── Arrancar ──────────────────────────────────────────────────────────────────
syncRelay.attach(server);
startWatcher(PROJECT_ROOT);

server.listen(PREVIEWER_PORT, () => {
  console.log('');
  console.log('  ╔═══════════════════════════════════════════╗');
  console.log('  ║        Leyavi Previewer v4                ║');
  console.log(`  ║  Preview: http://localhost:${PREVIEWER_PORT}           ║`);
  console.log(`  ║  App:     http://localhost:${APP_PORT}          ║`);
  console.log('  ║  Sync:    WebSocket /sync                 ║');
  console.log('  ╚═══════════════════════════════════════════╝');
  console.log('');
});
