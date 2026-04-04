// terminal.js — Terminal panel for command execution

let _termCollapsed = true;
let _termHistory = [];
let _termHistoryIdx = -1;

function initTerminal() {
  // Terminal HTML is already in index.html. Just wire it up.
  const header = document.querySelector('.term-header');
  if (header) {
    header.addEventListener('click', terminalSystem.toggle);
  }
}

function toggle() {
  _termCollapsed = !_termCollapsed;
  const panel = document.getElementById('terminalPanel');
  if (panel) panel.classList.toggle('collapsed', _termCollapsed);
}

function clear() {
  const output = document.getElementById('termOutput');
  if (output) output.innerHTML = '';
}

function addLine(text, type) {
  type = type || 'out';
  const output = document.getElementById('termOutput');
  if (!output) return;
  const line = document.createElement('div');
  line.className = 'term-line ' + type;
  line.textContent = text;
  output.appendChild(line);
  output.scrollTop = output.scrollHeight;
}

function handleKey(event) {
  const input = document.getElementById('termInput');
  if (!input) return;

  if (event.key === 'Enter') {
    const cmd = input.value.trim();
    if (!cmd) return;
    _termHistory.unshift(cmd);
    if (_termHistory.length > 50) _termHistory.pop();
    _termHistoryIdx = -1;
    addLine(cmd, 'cmd');
    input.value = '';
    if (window._vscode) window._vscode.postMessage({ type: 'run-command', command: cmd });
  }
  if (event.key === 'ArrowUp') {
    event.preventDefault();
    if (_termHistoryIdx < _termHistory.length - 1) { _termHistoryIdx++; input.value = _termHistory[_termHistoryIdx]; }
  }
  if (event.key === 'ArrowDown') {
    event.preventDefault();
    if (_termHistoryIdx > 0) { _termHistoryIdx--; input.value = _termHistory[_termHistoryIdx]; }
    else { _termHistoryIdx = -1; input.value = ''; }
  }
  if (event.key === 'c' && event.ctrlKey && window._currentPid) {
    if (window._vscode) window._vscode.postMessage({ type: 'kill-command', pid: window._currentPid });
    addLine('^C', 'info');
  }
}

window.terminalSystem = { init: initTerminal, toggle, clear, addLine, handleKey };
