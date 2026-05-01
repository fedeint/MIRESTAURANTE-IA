// Offline/Online detection with role-specific messages
// Also shows a persistent LOCAL MODE banner when MODO=local
(function() {
  const role      = window.__USER_ROLE__ || '';
  const isLocal   = window.__APP_MODO__  === 'local';

  const messages = {
    mesero: { offline: '📡 Sin conexión. Los pedidos se guardan localmente.', online: '✅ Conexión restaurada. Sincronizando...' },
    cocinero: { offline: '📡 Sin conexión. La pantalla no se actualiza automáticamente.', online: '✅ Conexión restaurada.' },
    cajero: { offline: '📡 Sin conexión. Las facturas se enviarán al reconectar.', online: '✅ Conexión restaurada. Sincronizando facturas...' },
    administrador: { offline: '📡 Sin conexión. Las operaciones se guardarán localmente.', online: '✅ Conexión restaurada. Sincronizando...' },
    almacenero: { offline: '📡 Sin conexión. Los movimientos se guardarán localmente.', online: '✅ Conexión restaurada.' },
    superadmin: { offline: '📡 Sin conexión al servidor.', online: '✅ Conexión restaurada.' },
  };

  const defaultMsg = { offline: '📡 Sin conexión a internet.', online: '✅ Conexión restaurada.' };
  const msg = messages[role] || defaultMsg;

  // Create banner element
  const banner = document.createElement('div');
  banner.id = 'offlineBanner';
  banner.style.cssText = `
    display: none;
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    z-index: 9999;
    padding: 10px 20px;
    text-align: center;
    font-size: 0.85rem;
    font-weight: 600;
    transition: all 0.3s ease;
    box-shadow: 0 2px 12px rgba(0,0,0,0.15);
  `;
  document.body.appendChild(banner);

  // Also create a small persistent dot indicator in the sidebar
  const dot = document.createElement('div');
  dot.id = 'connectionDot';
  dot.style.cssText = `
    position: fixed;
    bottom: 16px;
    left: 16px;
    width: 10px;
    height: 10px;
    border-radius: 50%;
    background: #22c55e;
    z-index: 9998;
    box-shadow: 0 0 6px rgba(34,197,94,0.5);
    transition: all 0.3s;
  `;
  dot.title = 'Conectado';
  document.body.appendChild(dot);

  // Pending operations counter
  let pendingCount = 0;

  function showOffline() {
    banner.textContent = msg.offline;
    banner.style.display = 'block';
    banner.style.background = 'linear-gradient(135deg, #dc2626, #b91c1c)';
    banner.style.color = '#fff';

    dot.style.background = '#dc2626';
    dot.style.boxShadow = '0 0 6px rgba(220,38,38,0.5)';
    dot.title = 'Sin conexión';

    // Pulse animation on dot
    dot.style.animation = 'pulse-red 1.5s infinite';
  }

  function showOnline() {
    banner.textContent = msg.online;
    banner.style.background = 'linear-gradient(135deg, #16a34a, #15803d)';
    banner.style.color = '#fff';
    banner.style.display = 'block';

    dot.style.background = '#22c55e';
    dot.style.boxShadow = '0 0 6px rgba(34,197,94,0.5)';
    dot.title = 'Conectado';
    dot.style.animation = 'none';

    // Hide banner after 3 seconds
    setTimeout(() => {
      banner.style.display = 'none';
    }, 3000);
  }

  // Add CSS animation
  const style = document.createElement('style');
  style.textContent = `
    @keyframes pulse-red {
      0%, 100% { opacity: 1; transform: scale(1); }
      50% { opacity: 0.5; transform: scale(1.3); }
    }
  `;
  document.head.appendChild(style);

  // ── Local Mode persistent banner ──────────────────────────────────────────
  if (isLocal) {
    const localBanner = document.createElement('div');
    localBanner.id = 'localModeBanner';
    localBanner.style.cssText = `
      position: fixed;
      top: 0;
      left: 0;
      right: 0;
      z-index: 9997;
      padding: 6px 20px;
      text-align: center;
      font-size: 0.78rem;
      font-weight: 600;
      background: linear-gradient(135deg, #1d4ed8, #1e40af);
      color: #fff;
      letter-spacing: 0.01em;
      box-shadow: 0 2px 8px rgba(30,64,175,0.3);
    `;
    localBanner.innerHTML =
      'Modo Local — Los datos se guardan en este servidor &nbsp;|&nbsp; ' +
      '<a href="/api/sync/status" target="_blank" ' +
      'style="color:#bfdbfe;text-decoration:underline;font-weight:700;">Ver estado de sync</a>';
    document.body.prepend(localBanner);

    // Push all fixed-position elements down so they don't overlap the banner
    const bannerHeight = 30; // px — approximate
    const style2 = document.createElement('style');
    style2.textContent = `
      #offlineBanner { top: ${bannerHeight}px !important; }
    `;
    document.head.appendChild(style2);
  }

  // ── Network online/offline listeners ──────────────────────────────────────
  // Listen for online/offline events
  window.addEventListener('offline', showOffline);
  window.addEventListener('online', showOnline);

  // Initial check
  if (!navigator.onLine) {
    showOffline();
  }

  // Expose for future sync queue use
  window.__offlineUI = {
    updatePendingCount: function(count) {
      pendingCount = count;
      if (!navigator.onLine && count > 0) {
        banner.textContent = msg.offline + ` (${count} operaciones pendientes)`;
      }
    },
    showSyncing: function() {
      banner.textContent = '🔄 Sincronizando operaciones pendientes...';
      banner.style.background = 'linear-gradient(135deg, #f97316, #ea580c)';
      banner.style.display = 'block';
    },
    showSyncComplete: function(count) {
      banner.textContent = `✅ ${count} operaciones sincronizadas correctamente.`;
      banner.style.background = 'linear-gradient(135deg, #16a34a, #15803d)';
      setTimeout(() => { banner.style.display = 'none'; }, 3000);
    }
  };
})();
