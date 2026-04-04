// mode-map.js — Interactive mind map of backend architecture

let _mapZoom = 1;
let _mapPanX = 0;
let _mapPanY = 0;
let _mapIsPanning = false;
let _mapLastX = 0;
let _mapLastY = 0;
let _selectedModule = null;
let _mapPanSetup = false;

function initMapMode() {
  const container = document.getElementById('mode-map');
  if (!container) return;

  container.innerHTML = `
    <div class="map-toolbar" id="mapToolbar">
      <span style="font-family:'Oswald',sans-serif;font-size:14px;font-weight:600;color:var(--purple);">MAPA DEL BACKEND</span>
      <span class="sep"></span>
      <div id="mapRoleFilters" style="display:flex;gap:4px;align-items:center;"></div>
      <span class="sep"></span>
      <button class="btn" onclick="mapMode.zoomIn()">+</button>
      <button class="btn" onclick="mapMode.zoomOut()">-</button>
      <button class="btn" onclick="mapMode.resetView()">Reset</button>
      <span style="font-size:9px;color:var(--text-secondary);min-width:30px;" id="mapZoomLabel">100%</span>
    </div>
    <div class="map-workspace" id="mapWorkspace">
      <div class="map-canvas" id="mapCanvas">
        <svg id="mapSvg" style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;overflow:visible;"></svg>
        <div id="mapNodes"></div>
      </div>
    </div>
    <div class="map-detail-panel" id="mapDetailPanel" style="display:none;">
      <div class="map-detail-header">
        <span class="map-detail-title" id="mapDetailTitle">Module</span>
        <button class="btn" onclick="mapMode.closeDetail()" style="margin-left:auto;">✕</button>
      </div>
      <div class="map-detail-body" id="mapDetailBody"></div>
    </div>
  `;

  setupPan();
  renderMap();
}

function setupPan() {
  if (_mapPanSetup) return;
  _mapPanSetup = true;
  const workspace = document.getElementById('mapWorkspace');
  if (!workspace) return;

  workspace.addEventListener('mousedown', e => {
    if (e.target.closest('.map-node')) return;
    _mapIsPanning = true;
    _mapLastX = e.clientX;
    _mapLastY = e.clientY;
    workspace.style.cursor = 'grabbing';
  });
  window.addEventListener('mousemove', e => {
    if (!_mapIsPanning) return;
    _mapPanX += e.clientX - _mapLastX;
    _mapPanY += e.clientY - _mapLastY;
    _mapLastX = e.clientX;
    _mapLastY = e.clientY;
    applyTransform();
  });
  window.addEventListener('mouseup', () => {
    _mapIsPanning = false;
    const workspace = document.getElementById('mapWorkspace');
    if (workspace) workspace.style.cursor = 'grab';
  });
  workspace.addEventListener('wheel', e => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? -0.1 : 0.1;
    _mapZoom = Math.max(0.3, Math.min(2, _mapZoom + delta));
    applyTransform();
  }, { passive: false });
  workspace.style.cursor = 'grab';
}

function applyTransform() {
  const canvas = document.getElementById('mapCanvas');
  if (canvas) canvas.style.transform = `translate(${_mapPanX}px, ${_mapPanY}px) scale(${_mapZoom})`;
  const label = document.getElementById('mapZoomLabel');
  if (label) label.textContent = Math.round(_mapZoom * 100) + '%';
}

function renderMap() {
  const mapData = window.miniMapSystem?.moduleMap;
  if (!mapData) {
    document.getElementById('mapNodes').innerHTML = '<div style="color:var(--text-secondary);padding:40px;font-size:12px;">Cargando mapa...</div>';
    return;
  }

  const categories = mapData.categories || [];
  const nodesEl = document.getElementById('mapNodes');
  const svgEl = document.getElementById('mapSvg');
  nodesEl.innerHTML = '';
  svgEl.innerHTML = '';

  // Layout: categories in columns, modules below category header
  const COL_WIDTH = 200;
  const COL_GAP = 40;
  const ROW_GAP = 12;
  const MODULE_H = 80;
  const CAT_H = 36;
  const START_X = 40;
  const START_Y = 40;

  const nodePositions = {}; // id -> {x, y, w, h}

  categories.forEach((cat, ci) => {
    const cx = START_X + ci * (COL_WIDTH + COL_GAP);
    let cy = START_Y;

    // Category header node
    const catEl = document.createElement('div');
    catEl.className = 'map-category-node';
    catEl.style.left = cx + 'px';
    catEl.style.top = cy + 'px';
    catEl.style.width = COL_WIDTH + 'px';
    catEl.style.borderColor = cat.color || 'var(--teal)';
    catEl.innerHTML = `<span style="font-family:'Oswald',sans-serif;font-size:13px;font-weight:700;color:${cat.color || 'var(--teal)'};">${cat.name}</span>`;
    nodesEl.appendChild(catEl);
    nodePositions['cat_' + cat.id] = { x: cx, y: cy, w: COL_WIDTH, h: CAT_H };

    cy += CAT_H + ROW_GAP;

    (cat.modules || []).forEach(mod => {
      const modEl = document.createElement('div');
      modEl.className = 'map-node ' + (mod.status === 'building' ? 'building' : mod.status === 'pending' ? 'pending' : '');
      modEl.style.left = cx + 'px';
      modEl.style.top = cy + 'px';
      modEl.style.width = COL_WIDTH + 'px';
      modEl.dataset.moduleId = mod.id;
      modEl.onclick = () => mapMode.selectModule(mod.id);

      const progress = mod.screens ? (mod.screens.filter(s => s.status === 'done').length / mod.screens.length) * 100 : 0;

      modEl.innerHTML = `
        <div class="map-node-title">${mod.name}</div>
        <div class="map-node-sub">${mod.routeFile || ''}</div>
        <div class="map-node-routes">${(mod.routes || []).join(' ')} · ${mod.endpointCount || 0} ep</div>
        <div class="map-node-progress"><div class="map-node-progress-fill" style="width:${progress}%"></div></div>
      `;
      nodesEl.appendChild(modEl);
      nodePositions[mod.id] = { x: cx, y: cy, w: COL_WIDTH, h: MODULE_H };
      cy += MODULE_H + ROW_GAP;
    });
  });

  // Draw connection lines for dependencies
  setTimeout(() => drawConnections(nodePositions, mapData), 50);
}

function drawConnections(positions, mapData) {
  const svgEl = document.getElementById('mapSvg');
  if (!svgEl) return;
  svgEl.innerHTML = '';

  const allModules = [];
  (mapData.categories || []).forEach(cat => (cat.modules || []).forEach(m => allModules.push(m)));

  allModules.forEach(mod => {
    const fromPos = positions[mod.id];
    if (!fromPos) return;
    (mod.blocks || []).forEach(targetId => {
      const toPos = positions[targetId];
      if (!toPos) return;
      const x1 = fromPos.x + fromPos.w / 2;
      const y1 = fromPos.y + fromPos.h;
      const x2 = toPos.x + toPos.w / 2;
      const y2 = toPos.y;
      const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
      const cy1 = y1 + 20;
      const cy2 = y2 - 20;
      line.setAttribute('d', `M${x1},${y1} C${x1},${cy1} ${x2},${cy2} ${x2},${y2}`);
      line.setAttribute('stroke', 'rgba(99,102,241,0.4)');
      line.setAttribute('stroke-width', '1.5');
      line.setAttribute('fill', 'none');
      line.setAttribute('stroke-dasharray', '4,3');
      svgEl.appendChild(line);
    });
  });
}

function selectModule(moduleId) {
  _selectedModule = moduleId;
  const mapData = window.miniMapSystem?.moduleMap;
  if (!mapData) return;

  const allModules = [];
  if (mapData.auth) allModules.push(mapData.auth);
  (mapData.categories || []).forEach(cat => (cat.modules || []).forEach(m => allModules.push(m)));
  const mod = allModules.find(m => m.id === moduleId);
  if (!mod) return;

  const panel = document.getElementById('mapDetailPanel');
  const title = document.getElementById('mapDetailTitle');
  const body = document.getElementById('mapDetailBody');
  if (!panel || !title || !body) return;

  title.textContent = mod.name;
  body.innerHTML = `
    <div style="display:flex;flex-direction:column;gap:8px;padding:12px;">
      <div><span class="mini-map-label">ESTADO</span><br><span class="chip ${mod.status === 'active' ? 'active' : 'active-orange'}" style="height:18px;font-size:9px;">${mod.status}</span></div>
      <div><span class="mini-map-label">RUTA</span><br><span style="font-size:9px;color:var(--teal);">${(mod.routes || []).join(', ')}</span></div>
      <div><span class="mini-map-label">ROLES</span><br><span style="font-size:9px;color:var(--text-primary);">${(mod.roles || []).join(', ')}</span></div>
      <div><span class="mini-map-label">ENDPOINTS CLAVE (${mod.endpointCount || 0} total)</span><br>
        ${(mod.keyEndpoints || []).map(ep => `<div class="endpoint-line">${ep}</div>`).join('')}
      </div>
      ${mod.screens ? `<div><span class="mini-map-label">PANTALLAS</span><br>
        ${mod.screens.map(s => `<div style="font-size:8px;"><span style="color:${s.status === 'done' ? 'var(--teal)' : 'var(--orange)'};">● </span>${s.name} <span style="color:var(--text-secondary);">${s.route}</span></div>`).join('')}
      </div>` : ''}
    </div>
  `;
  panel.style.display = 'flex';
}

function closeDetail() {
  const panel = document.getElementById('mapDetailPanel');
  if (panel) panel.style.display = 'none';
  _selectedModule = null;
}

function zoomIn() { _mapZoom = Math.min(2, _mapZoom + 0.15); applyTransform(); }
function zoomOut() { _mapZoom = Math.max(0.3, _mapZoom - 0.15); applyTransform(); }
function resetView() { _mapZoom = 1; _mapPanX = 0; _mapPanY = 0; applyTransform(); }

window.mapMode = { init: initMapMode, render: renderMap, selectModule, closeDetail, zoomIn, zoomOut, resetView };
