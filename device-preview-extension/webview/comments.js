// comments.js — Shared comment system for Build and Test modes

function _esc(str) {
  return String(str).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

const COMMENT_TYPES = {
  bug: { label: 'BUG', color: '#EF4444', cssClass: 'bug' },
  fix: { label: 'FIX', color: '#F97316', cssClass: 'fix' },
  note: { label: 'NOTE', color: '#6366F1', cssClass: 'note' },
  ok: { label: 'OK', color: '#22C55E', cssClass: 'ok' },
};

let _comments = [];

function loadComments(data) {
  _comments = Array.isArray(data) ? data : [];
}

function getComments() {
  return _comments;
}

function addComment(type, text, route, device, mode) {
  if (!text.trim()) return null;
  const comment = {
    id: Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
    type,
    text: text.trim(),
    route: route || '/',
    device: device || 'all',
    mode: mode || 'test',
    timestamp: new Date().toISOString(),
  };
  _comments.push(comment);
  return comment;
}

function deleteComment(id) {
  _comments = _comments.filter(c => c.id !== id);
}

function clearComments(filter) {
  if (filter) {
    _comments = _comments.filter(c => c.device !== filter);
  } else {
    _comments = [];
  }
}

function renderCommentsPanel(containerId, options = {}) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const { filterDevice } = options;
  let filtered = _comments;
  if (filterDevice) filtered = filtered.filter(c => c.device === filterDevice || c.device === 'all');

  container.innerHTML = `
    <div class="dc-head">
      <span class="dc-title">Correcciones — ${filterDevice || 'todos'}</span>
      <span class="dc-badge" id="${containerId}-badge">${filtered.length}</span>
      <button class="dc-clear" onclick="commentSystem.clearAndRerender('${filterDevice || ''}','${containerId}')">Limpiar</button>
    </div>
    <div class="dc-list" id="${containerId}-list">
      ${filtered.map(c => `
        <div class="c-item ${c.type}">
          <span class="c-tag ${c.type}">${COMMENT_TYPES[c.type]?.label || c.type.toUpperCase()}</span>
          <span class="c-text">${_esc(c.text)}</span>
          <span class="c-meta">
            <span class="c-route">${c.route}</span>
            <span class="c-del" onclick="commentSystem.deleteAndRerender('${c.id}','${containerId}')">✕</span>
          </span>
        </div>
      `).join('')}
    </div>
    <div class="dc-input">
      <select id="${containerId}-type">
        ${Object.entries(COMMENT_TYPES).map(([k, v]) => `<option value="${k}">${v.label}</option>`).join('')}
      </select>
      <input id="${containerId}-input" placeholder="Comentario..." onkeydown="if(event.key==='Enter')commentSystem.submitFromInput('${containerId}','${filterDevice || ''}')" />
      <button class="send" onclick="commentSystem.submitFromInput('${containerId}','${filterDevice || ''}')">&#x2191;</button>
    </div>
  `;
}

function submitFromInput(containerId, deviceId) {
  const typeEl = document.getElementById(containerId + '-type');
  const inputEl = document.getElementById(containerId + '-input');
  if (!typeEl || !inputEl || !inputEl.value.trim()) return;

  addComment(typeEl.value, inputEl.value, window._currentRoute || '/', deviceId || 'all', window._currentMode || 'test');
  inputEl.value = '';
  renderCommentsPanel(containerId, { filterDevice: deviceId || undefined });
  _notifyExtension();
}

function deleteAndRerender(id, containerId) {
  const comment = _comments.find(c => c.id === id);
  const device = comment ? comment.device : undefined;
  deleteComment(id);
  renderCommentsPanel(containerId, { filterDevice: device !== 'all' ? device : undefined });
  _notifyExtension();
}

function clearAndRerender(deviceFilter, containerId) {
  clearComments(deviceFilter || undefined);
  renderCommentsPanel(containerId, { filterDevice: deviceFilter || undefined });
  _notifyExtension();
}

function _notifyExtension() {
  if (window._vscode) window._vscode.postMessage({ type: 'save-feedback', comments: _comments });
}

window.commentSystem = {
  load: loadComments,
  get: getComments,
  add: addComment,
  delete: deleteComment,
  clear: clearComments,
  render: renderCommentsPanel,
  submitFromInput,
  deleteAndRerender,
  clearAndRerender,
  TYPES: COMMENT_TYPES,
};
