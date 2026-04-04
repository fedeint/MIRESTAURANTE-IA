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
  const htmlPath = path.join(context.extensionPath, 'webview', 'index.html');
  let html = fs.readFileSync(htmlPath, 'utf8');

  const cssUri = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'webview', 'styles.css'));
  const appJsUri = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'webview', 'app.js'));
  const commentsJsUri = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'webview', 'comments.js'));
  const terminalJsUri = webview.asWebviewUri(vscode.Uri.joinPath(context.extensionUri, 'webview', 'terminal.js'));

  html = html.replace(/\{\{APP_URL\}\}/g, appUrl);
  html = html.replace(/\{\{CSS_URI\}\}/g, cssUri.toString());
  html = html.replace(/\{\{APP_JS_URI\}\}/g, appJsUri.toString());
  html = html.replace(/\{\{COMMENTS_JS_URI\}\}/g, commentsJsUri.toString());
  html = html.replace(/\{\{TERMINAL_JS_URI\}\}/g, terminalJsUri.toString());
  html = html.replace(/\{\{CSP_SOURCE\}\}/g, webview.cspSource);

  return html;
}

function deactivate() { stopTour(); }
module.exports = { activate, deactivate };
