// DallIA Global FAB — inject floating button on all PWA pages
(function() {
  'use strict';

  var FAB_ID = 'dallia-global-fab';

  // Guard: already injected
  if (document.getElementById(FAB_ID)) return;

  // Guard: don't show on dallia pages themselves
  if (window.location.pathname.indexOf('/dallia') === 0) return;

  // ── Styles ────────────────────────────────────────────────────────────────
  var style = document.createElement('style');
  style.textContent = [
    '#dallia-global-fab {',
    '  position: fixed;',
    '  bottom: 84px;',
    '  right: 16px;',
    '  width: 52px;',
    '  height: 52px;',
    '  border-radius: 16px;',
    '  background: linear-gradient(135deg, #ef520f 0%, #df2c05 100%);',
    '  box-shadow: 0 4px 20px rgba(239,82,15,0.45);',
    '  display: flex;',
    '  align-items: center;',
    '  justify-content: center;',
    '  font-size: 24px;',
    '  cursor: pointer;',
    '  z-index: 900;',
    '  border: none;',
    '  animation: dallia-fab-float 3s ease-in-out infinite;',
    '  transition: transform 0.15s ease, box-shadow 0.15s ease;',
    '  -webkit-tap-highlight-color: transparent;',
    '}',
    '#dallia-global-fab:active {',
    '  transform: scale(0.9) !important;',
    '  box-shadow: 0 2px 10px rgba(239,82,15,0.3);',
    '}',
    '@keyframes dallia-fab-float {',
    '  0%,100% { transform: translateY(0); }',
    '  50%      { transform: translateY(-5px); }',
    '}',
    '#dallia-fab-badge {',
    '  position: absolute;',
    '  top: -5px;',
    '  right: -5px;',
    '  min-width: 18px;',
    '  height: 18px;',
    '  background: #EF4444;',
    '  border-radius: 9px;',
    '  font-size: 10px;',
    '  color: white;',
    '  font-weight: 700;',
    '  font-family: system-ui, sans-serif;',
    '  display: none;',
    '  align-items: center;',
    '  justify-content: center;',
    '  padding: 0 4px;',
    '  border: 1.5px solid white;',
    '  line-height: 1;',
    '}'
  ].join('\n');
  document.head.appendChild(style);

  // ── Button ────────────────────────────────────────────────────────────────
  var fab = document.createElement('button');
  fab.id = FAB_ID;
  fab.setAttribute('aria-label', 'Abrir DallIA');
  fab.innerHTML = '🤖<span id="dallia-fab-badge"></span>';

  fab.addEventListener('click', function() {
    window.location = '/dallia';
  });

  // Append after body is ready
  function mountFab() {
    if (document.body) {
      document.body.appendChild(fab);
      checkAlertas();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mountFab);
  } else {
    mountFab();
  }

  // ── Alert badge ───────────────────────────────────────────────────────────
  function checkAlertas() {
    fetch('/api/chat/dallia/alertas')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        var alertas = (data && data.alertas) ? data.alertas : [];
        if (alertas.length > 0) {
          var badge = document.getElementById('dallia-fab-badge');
          if (badge) {
            badge.textContent = alertas.length > 9 ? '9+' : String(alertas.length);
            badge.style.display = 'flex';
          }
        }
      })
      .catch(function() {});
  }

})();
