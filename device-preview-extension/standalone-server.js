// standalone-server.js — Serves Device Preview webview outside VS Code
// Run with: node standalone-server.js [port]
// Then open: http://localhost:3001

const express = require('express');
const path = require('path');
const fs = require('fs');

const PORT = parseInt(process.argv[2] || '3001', 10);
const app = express();

const EXTENSION_DIR = __dirname;
const WEBVIEW_DIR = path.join(EXTENSION_DIR, 'webview');
const PREVIEW_DIR = path.join(EXTENSION_DIR, 'preview');

// Serve webview static files (CSS, JS)
app.use('/webview', express.static(WEBVIEW_DIR));

// Serve module map API
app.get('/api/module-map', (req, res) => {
  const mapPath = path.join(PREVIEW_DIR, 'module-map.json');
  if (!fs.existsSync(mapPath)) return res.status(404).json({ error: 'module-map.json not found' });
  try {
    const data = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: 'Failed to parse module-map.json' });
  }
});

// Serve the main HTML with substituted values
app.get('/', (req, res) => {
  const htmlPath = path.join(WEBVIEW_DIR, 'index.html');
  if (!fs.existsSync(htmlPath)) {
    return res.status(404).send('webview/index.html not found. Run from the extension directory.');
  }

  const appUrl = process.env.APP_URL || 'http://localhost:1995';
  let html = fs.readFileSync(htmlPath, 'utf8');

  // Replace VS Code URI placeholders with relative web paths
  html = html.replace(/\{\{APP_URL\}\}/g, appUrl);
  html = html.replace(/\{\{CSS_URI\}\}/g, '/webview/styles.css');
  html = html.replace(/\{\{APP_JS_URI\}\}/g, '/webview/app.js');
  html = html.replace(/\{\{COMMENTS_JS_URI\}\}/g, '/webview/comments.js');
  html = html.replace(/\{\{TERMINAL_JS_URI\}\}/g, '/webview/terminal.js');
  html = html.replace(/\{\{MINI_MAP_JS_URI\}\}/g, '/webview/mini-map.js');
  html = html.replace(/\{\{MODE_MAP_JS_URI\}\}/g, '/webview/mode-map.js');
  html = html.replace(/\{\{MODE_BUILD_JS_URI\}\}/g, '/webview/mode-build.js');
  // CSP source — use '*' permissively for local dev
  html = html.replace(/\{\{CSP_SOURCE\}\}/g, "'unsafe-inline' *");

  // Inject module map data via script tag (since no VS Code postMessage available)
  const mapPath = path.join(PREVIEW_DIR, 'module-map.json');
  let moduleMapScript = '';
  if (fs.existsSync(mapPath)) {
    try {
      const mapData = JSON.parse(fs.readFileSync(mapPath, 'utf8'));
      // Inject after app.js loads
      moduleMapScript = `<script>
window.addEventListener('load', () => {
  if (window.miniMapSystem) {
    miniMapSystem.load(${JSON.stringify(mapData)});
    miniMapSystem.render('mini-map-context', '/');
  }
  // Polyfill vscode for standalone mode
  if (!window.vscode) {
    window.vscode = { postMessage: () => {} };
    window._vscode = window.vscode;
  }
});
</script>`;
    } catch (e) { /* ignore */ }
  }

  html = html.replace('</body>', moduleMapScript + '\n</body>');
  res.send(html);
});

// Health check
app.get('/health', (req, res) => res.json({ status: 'ok', port: PORT }));

app.listen(PORT, () => {
  console.log(`Device Preview standalone server running at http://localhost:${PORT}`);
  console.log(`App URL: ${process.env.APP_URL || 'http://localhost:1995'}`);
  console.log(`Set APP_URL env var to change the target app URL`);
});
