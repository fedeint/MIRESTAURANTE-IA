// iOS PWA Install Banner — shows only on iOS Safari when not in standalone mode
(function() {
  'use strict';

  // Only show on iOS Safari, not already installed as PWA
  var isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  var isStandalone = window.navigator.standalone === true;
  var isSafari = /Safari/.test(navigator.userAgent) && !/CriOS|FxiOS|OPiOS|EdgiOS/.test(navigator.userAgent);

  if (!isIOS || isStandalone || !isSafari) return;

  // Check if user dismissed it before (show max once per day)
  var dismissed = localStorage.getItem('ios_install_dismissed');
  if (dismissed && (Date.now() - Number(dismissed)) < 86400000) return;

  // Wait for page to settle
  setTimeout(function() {
    var banner = document.createElement('div');
    banner.id = 'ios-install-banner';
    banner.innerHTML = [
      '<div style="display:flex;align-items:center;gap:10px;flex:1;min-width:0">',
        '<div style="font-size:24px;flex-shrink:0">📱</div>',
        '<div style="min-width:0">',
          '<div style="font-size:13px;font-weight:700;color:#0a0f24">Instala MiRestcon IA</div>',
          '<div style="font-size:11px;color:#6b7280;margin-top:1px">Toca <strong>Compartir</strong> <span style="font-size:13px">⬆️</span> y luego <strong>"Agregar a inicio"</strong></div>',
        '</div>',
      '</div>',
      '<button id="ios-install-close" style="background:none;border:none;color:#8B8FAD;font-size:18px;padding:4px 8px;cursor:pointer;flex-shrink:0">&times;</button>'
    ].join('');

    banner.style.cssText = [
      'position:fixed;bottom:0;left:0;right:0;z-index:9998;',
      'background:#fff;border-top:1px solid #e5e7eb;',
      'padding:12px 16px;padding-bottom:max(12px, env(safe-area-inset-bottom));',
      'display:flex;align-items:center;gap:8px;',
      'box-shadow:0 -4px 20px rgba(0,0,0,0.1);',
      'animation:iosSlideUp 0.3s ease;',
      'font-family:"DM Sans",system-ui,sans-serif;'
    ].join('');

    // Animation
    var style = document.createElement('style');
    style.textContent = '@keyframes iosSlideUp{from{transform:translateY(100%)}to{transform:translateY(0)}}';
    document.head.appendChild(style);

    document.body.appendChild(banner);

    document.getElementById('ios-install-close').addEventListener('click', function() {
      banner.style.animation = 'none';
      banner.style.transform = 'translateY(100%)';
      banner.style.transition = 'transform 0.25s ease';
      setTimeout(function() { banner.remove(); }, 300);
      localStorage.setItem('ios_install_dismissed', String(Date.now()));
    });
  }, 2000);
})();
