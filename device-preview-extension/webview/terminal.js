// terminal.js — Terminal panel for command execution

let _termCollapsed = true;

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
  if (event.key !== 'Enter') return;
  const input = document.getElementById('termInput');
  if (!input || !input.value.trim()) return;
  const cmd = input.value.trim();
  addLine(cmd, 'cmd');
  input.value = '';
  if (window._vscode) {
    window._vscode.postMessage({ type: 'run-command', command: cmd });
  }
}

window.terminalSystem = { init: initTerminal, toggle, clear, addLine, handleKey };
