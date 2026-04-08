'use strict';

const DEVICES = {
  iphone: {
    id: 'iphone',
    name: 'iPhone 15 Pro',
    width: 393,
    height: 852,
    category: 'mobile',
  },
  android: {
    id: 'android',
    name: 'Pixel 8',
    width: 412,
    height: 915,
    category: 'mobile',
  },
  ipad: {
    id: 'ipad',
    name: 'iPad Air',
    width: 820,
    height: 1180,
    category: 'tablet',
  },
  macbook: {
    id: 'macbook',
    name: 'MacBook Pro',
    width: 1440,
    height: 900,
    category: 'desktop',
  },
  windows: {
    id: 'windows',
    name: 'Windows PC',
    width: 1366,
    height: 768,
    category: 'desktop',
  },
};

function buildDeviceHTML(dev, appUrl, path) {
  const src = appUrl + (path || '/');
  const inner = `
    <iframe
      id="if-${dev.id}"
      name="${dev.id}"
      src="${src}"
      style="width:${dev.width}px;height:${dev.height}px;border:none;display:block;"
      loading="lazy"
    ></iframe>`;

  if (dev.category === 'mobile') {
    const notch = dev.id === 'iphone'
      ? `<div style="position:absolute;top:14px;left:50%;transform:translateX(-50%);
           width:120px;height:32px;background:#1c1c1e;border-radius:0 0 20px 20px;z-index:10;"></div>`
      : '';
    return `
      <div class="device-col" id="col-${dev.id}" data-dev="${dev.id}">
        <div class="device-label">${dev.name} <span class="res">${dev.width}×${dev.height}</span></div>
        <div class="device-frame mobile-frame" style="border-radius:50px;padding:14px;background:#1c1c1e;
             box-shadow:0 0 0 2px #3a3a3c,0 0 0 4px #1c1c1e,0 20px 60px rgba(0,0,0,.5);position:relative;">
          ${notch}
          <div class="screen" style="width:${dev.width}px;height:${dev.height}px;
               border-radius:38px;overflow:hidden;background:#fff;">
            ${inner}
          </div>
        </div>
        ${buildCommentsHTML(dev.id, dev.name)}
      </div>`;
  }

  if (dev.category === 'tablet') {
    return `
      <div class="device-col" id="col-${dev.id}" data-dev="${dev.id}">
        <div class="device-label">${dev.name} <span class="res">${dev.width}×${dev.height}</span></div>
        <div class="device-frame" style="border-radius:24px;padding:20px 12px;background:#2c2c2e;
             box-shadow:0 0 0 2px #3a3a3c,0 0 0 4px #2c2c2e,0 20px 60px rgba(0,0,0,.5);">
          <div class="screen" style="width:${dev.width}px;height:${dev.height}px;
               border-radius:8px;overflow:hidden;background:#fff;">
            ${inner}
          </div>
        </div>
        ${buildCommentsHTML(dev.id, dev.name)}
      </div>`;
  }

  // Desktop
  return `
    <div class="device-col" id="col-${dev.id}" data-dev="${dev.id}">
      <div class="device-label">${dev.name} <span class="res">${dev.width}×${dev.height}</span></div>
      <div class="device-frame desktop-frame" style="border-radius:12px;padding:36px 4px 4px;background:#2d3148;
           box-shadow:0 20px 60px rgba(0,0,0,.5);position:relative;">
        <div style="position:absolute;top:12px;left:14px;display:flex;gap:6px;">
          <span style="width:10px;height:10px;border-radius:50%;background:#ef4444;display:block;"></span>
          <span style="width:10px;height:10px;border-radius:50%;background:#f59e0b;display:block;"></span>
          <span style="width:10px;height:10px;border-radius:50%;background:#22c55e;display:block;"></span>
        </div>
        <div class="screen" style="width:${dev.width}px;height:${dev.height}px;
             border-radius:0 0 8px 8px;overflow:hidden;background:#fff;">
          ${inner}
        </div>
      </div>
      ${buildCommentsHTML(dev.id, dev.name)}
    </div>`;
}

function buildCommentsHTML(devId, devName) {
  return `
    <div class="dc-box" id="dc-${devId}">
      <div class="dc-head" data-dev="${devId}">
        <span class="dc-title">💬 ${devName}</span>
        <span class="dc-badge" id="badge-${devId}">0</span>
        <button class="dc-clear" data-dev="${devId}">Limpiar</button>
      </div>
      <div class="dc-list" id="list-${devId}"></div>
      <div class="dc-input-row">
        <select id="type-${devId}" class="dc-type-select">
          <option value="bug">🐛 Bug</option>
          <option value="fix">🔧 Fix</option>
          <option value="note">📝 Nota</option>
          <option value="ok">✅ OK</option>
        </select>
        <input id="inp-${devId}" class="dc-input" placeholder="Comentario..." />
        <button class="dc-send" data-dev="${devId}">↑</button>
      </div>
    </div>`;
}

// Exportar para uso en app.js (browser global) y en tests (Node)
if (typeof module !== 'undefined') {
  module.exports = { DEVICES, buildDeviceHTML, buildCommentsHTML };
}
