// mode-build.js — Build mode: split/overlay comparison of Pencil design vs reality

let _buildLayout = 'split'; // 'split' or 'overlay'
let _buildOpacity = 0.5;
let _buildRoute = '/';
let _buildDevice = 'iphone';
let _buildInitialized = false;

const BUILD_DEVICES = {
  iphone:  { name: 'iPhone',   width: 393,  height: 852 },
  android: { name: 'Android',  width: 412,  height: 915 },
  desktop: { name: 'Desktop',  width: 1280, height: 800 },
};

const BUILD_ROUTES = ['/', '/mesas', '/cocina', '/pedido-nuevo', '/caja', '/productos', '/almacen', '/chat'];

function initBuildMode() {
  if (_buildInitialized) { refreshBuild(); return; }
  _buildInitialized = true;

  const container = document.getElementById('mode-build');
  if (!container) return;

  container.innerHTML = `
    <div class="build-toolbar">
      <span style="font-family:'Oswald',sans-serif;font-size:14px;font-weight:600;color:var(--orange);">MODO BUILD</span>
      <span class="sep"></span>
      <div style="display:flex;gap:3px;">
        ${BUILD_ROUTES.map(r => `<button class="route-chip${r === _buildRoute ? ' active' : ''}" onclick="buildMode.setRoute('${r}',this)">${r}</button>`).join('')}
      </div>
      <span class="sep"></span>
      <div style="display:flex;gap:3px;">
        ${Object.entries(BUILD_DEVICES).map(([k, v]) => `<button class="chip${k === _buildDevice ? ' active-orange' : ''}" onclick="buildMode.setDevice('${k}',this)">${v.name}</button>`).join('')}
      </div>
      <span class="sep"></span>
      <button class="btn${_buildLayout === 'split' ? ' active' : ''}" id="buildSplitBtn" onclick="buildMode.setLayout('split')">Split</button>
      <button class="btn${_buildLayout === 'overlay' ? ' active' : ''}" id="buildOverlayBtn" onclick="buildMode.setLayout('overlay')">Overlay</button>
      <span class="sep"></span>
      <div class="match-badge" id="buildMatchBadge" style="display:none;">
        <span style="font-size:9px;color:var(--text-secondary);">match</span>
        <span id="buildMatchPct" style="font-family:'Oswald',sans-serif;font-size:16px;font-weight:700;color:var(--teal);">—</span>
      </div>
    </div>
    <div class="build-area" id="buildArea"></div>
    <div id="build-comments" class="comments-panel" style="width:240px;flex-shrink:0;display:flex;flex-direction:column;"></div>
  `;

  if (window.commentSystem) {
    commentSystem.render('build-comments', { filterDevice: 'build' });
  }

  refreshBuild();
}

function refreshBuild() {
  const area = document.getElementById('buildArea');
  if (!area) return;

  const device = BUILD_DEVICES[_buildDevice] || BUILD_DEVICES.iphone;
  const appUrl = document.getElementById('urlInput')?.value || 'http://localhost:1995';
  const frameUrl = appUrl + _buildRoute;

  // Scale to fit in ~400px height
  const scale = Math.min(1, 380 / device.height);
  const displayW = Math.round(device.width * scale);
  const displayH = Math.round(device.height * scale);

  if (_buildLayout === 'split') {
    area.innerHTML = `
      <div class="build-split-container">
        <div class="build-panel">
          <div class="build-panel-label">DISEÑO (Pencil)</div>
          <div class="build-frame" style="width:${displayW}px;height:${displayH}px;">
            <div class="build-design-placeholder" style="width:100%;height:100%;">
              <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;gap:8px;color:var(--text-secondary);">
                <div style="font-size:28px;">✏️</div>
                <div style="font-size:11px;font-family:'Oswald',sans-serif;color:var(--orange);">Pencil Design</div>
                <div style="font-size:9px;text-align:center;">${_buildRoute}<br>${device.name} ${device.width}×${device.height}</div>
                <div style="font-size:8px;color:var(--inactive);">Use MCP to load screenshot</div>
              </div>
            </div>
          </div>
        </div>
        <div class="build-divider"></div>
        <div class="build-panel">
          <div class="build-panel-label">REALIDAD (App)</div>
          <div class="build-frame" style="width:${displayW}px;height:${displayH}px;">
            <iframe src="${frameUrl}" style="width:${device.width}px;height:${device.height}px;border:none;transform:scale(${scale});transform-origin:top left;display:block;"></iframe>
          </div>
        </div>
      </div>
    `;
  } else {
    area.innerHTML = `
      <div class="build-overlay-container">
        <div class="build-panel">
          <div class="build-panel-label">OVERLAY (${Math.round(_buildOpacity * 100)}% diseño)</div>
          <div class="build-frame" style="width:${displayW}px;height:${displayH}px;position:relative;">
            <iframe src="${frameUrl}" style="width:${device.width}px;height:${device.height}px;border:none;transform:scale(${scale});transform-origin:top left;display:block;position:absolute;top:0;left:0;"></iframe>
            <div class="build-design-placeholder" style="position:absolute;top:0;left:0;width:100%;height:100%;opacity:${_buildOpacity};">
              <div style="display:flex;flex-direction:column;align-items:center;justify-content:center;height:100%;background:var(--elevated);gap:4px;">
                <div style="font-size:20px;">✏️</div>
                <div style="font-size:9px;color:var(--orange);">Pencil overlay</div>
              </div>
            </div>
          </div>
          <input type="range" min="0" max="100" value="${Math.round(_buildOpacity * 100)}"
            style="width:${displayW}px;margin-top:8px;"
            oninput="buildMode.setOpacity(this.value/100);this.previousElementSibling.querySelector('.build-panel-label').textContent='OVERLAY (' + this.value + '% diseño)'" />
        </div>
      </div>
    `;
  }
}

function setRoute(route, el) {
  _buildRoute = route;
  document.querySelectorAll('.build-toolbar .route-chip').forEach(c => c.classList.remove('active'));
  if (el) el.classList.add('active');
  window._currentRoute = route;
  if (window.miniMapSystem) miniMapSystem.render('mini-map-context', route);
  refreshBuild();
}

function setDevice(device, el) {
  _buildDevice = device;
  document.querySelectorAll('.build-toolbar .chip').forEach(c => { c.classList.remove('active'); c.classList.remove('active-orange'); });
  if (el) { el.classList.add('active-orange'); }
  refreshBuild();
}

function setLayout(layout) {
  _buildLayout = layout;
  document.getElementById('buildSplitBtn')?.classList.toggle('active', layout === 'split');
  document.getElementById('buildOverlayBtn')?.classList.toggle('active', layout === 'overlay');
  refreshBuild();
}

function setOpacity(val) {
  _buildOpacity = val;
  refreshBuild();
}

window.buildMode = { init: initBuildMode, setRoute, setDevice, setLayout, setOpacity, refresh: refreshBuild };
