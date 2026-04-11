// public/js/salva-alerts.js
// Polls /api/alertas/salva every 5 minutes and injects alert banners
// into #salva-alerts-container (or appends to body if container missing).
// Dismissed alerts are stored in sessionStorage to avoid re-showing per session.
(function () {
  'use strict';

  const POLL_MS = 5 * 60 * 1000; // 5 minutes
  const DISMISSED_KEY = 'salva_dismissed';

  function getDismissed() {
    try { return JSON.parse(sessionStorage.getItem(DISMISSED_KEY) || '[]'); } catch (_) { return []; }
  }
  function dismiss(id) {
    const d = getDismissed();
    if (!d.includes(id)) { d.push(id); sessionStorage.setItem(DISMISSED_KEY, JSON.stringify(d)); }
  }

  function renderAlerts(alerts) {
    const dismissed = getDismissed();
    const visible = alerts.filter(a => !dismissed.includes(a.id));
    if (visible.length === 0) return;

    let container = document.getElementById('salva-alerts-container');
    if (!container) {
      container = document.createElement('div');
      container.id = 'salva-alerts-container';
      container.style.cssText = 'position:fixed;top:12px;left:50%;transform:translateX(-50%);z-index:9999;width:min(440px,calc(100vw - 24px));display:flex;flex-direction:column;gap:8px;pointer-events:none';
      document.body.appendChild(container);
    }

    // Clear old rendered alerts (re-render on each poll)
    container.innerHTML = '';

    const BG = { error: '#fef2f2', warning: '#fff7ed', info: '#f0fdf4' };
    const BORDER = { error: '#fecaca', warning: '#fed7aa', info: '#bbf7d0' };
    const TEXT   = { error: '#991b1b', warning: '#9a3412', info: '#166534' };

    visible.slice(0, 3).forEach(a => {
      const el = document.createElement('div');
      el.style.cssText = `
        background:${BG[a.tipo]||'#fff'};border:1.5px solid ${BORDER[a.tipo]||'#e5e7eb'};
        border-radius:14px;padding:12px 14px;display:flex;align-items:flex-start;gap:10px;
        box-shadow:0 4px 12px rgba(0,0,0,.1);pointer-events:all;animation:slideDown .3s ease;
      `;

      el.innerHTML = `
        <style>@keyframes slideDown{from{opacity:0;transform:translateY(-8px)}to{opacity:1;transform:translateY(0)}}</style>
        <span style="font-size:20px;flex-shrink:0;line-height:1.2">${a.icono}</span>
        <div style="flex:1;min-width:0">
          <div style="font-size:13px;font-weight:700;color:${TEXT[a.tipo]||'#1f2430'}">${a.titulo}</div>
          <div style="font-size:12px;color:#4b5563;margin-top:2px;line-height:1.4">${a.mensaje}</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:5px">
            ${a.accion ? `<a href="${a.accion.href}" style="font-size:11px;font-weight:700;color:${TEXT[a.tipo]||'#ef520f'};text-decoration:none">${a.accion.label} →</a>` : ''}
            ${a.dallia ? `<a href="${a.dallia.href}" style="font-size:11px;font-weight:700;color:#6366f1;text-decoration:none">🤖 ${a.dallia.label}</a>` : ''}
          </div>
        </div>
        <button onclick="salvaDismiss('${a.id}',this.closest('[data-alert-id]'))" data-alert-id="${a.id}"
          style="background:none;border:none;cursor:pointer;font-size:16px;color:#9ca3af;padding:0;line-height:1;flex-shrink:0">✕</button>
      `;

      el.dataset.alertId = a.id;
      container.appendChild(el);
    });
  }

  window.salvaDismiss = function (id, el) {
    dismiss(id);
    el?.remove();
  };

  async function fetchAlerts() {
    try {
      const r = await fetch('/api/alertas/salva', { credentials: 'same-origin' });
      if (!r.ok) return;
      const { alerts } = await r.json();
      if (Array.isArray(alerts) && alerts.length > 0) renderAlerts(alerts);
    } catch (_) {}
  }

  // Initial fetch after a short delay (don't block page load)
  setTimeout(fetchAlerts, 3000);
  setInterval(fetchAlerts, POLL_MS);
})();
