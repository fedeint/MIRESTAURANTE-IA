(function () {
  if (window.__leyavi_sync__) return;
  window.__leyavi_sync__ = true;

  // deviceId viene de window.name (el previewer lo setea en el iframe)
  var deviceId = window.name || 'unknown';
  var WS_URL = 'ws://localhost:3001/sync';
  var ws = null;
  var syncing = false;

  // ── Conexión WebSocket con auto-reconexión ──────────────────────────────
  function connect() {
    try {
      ws = new WebSocket(WS_URL);

      ws.onopen = function () {
        ws.send(JSON.stringify({ t: 'register', device: deviceId }));
      };

      ws.onmessage = function (e) {
        var msg;
        try { msg = JSON.parse(e.data); } catch (ex) { return; }

        // reload: recargar esta página
        if (msg.t === 'reload') {
          window.location.reload();
          return;
        }

        syncing = true;
        try {
          if (msg.t === 'cl') clickElement(msg.s);
          if (msg.t === 'sc') scrollToPercent(msg.p);
          if (msg.t === 'in') setInputValue(msg.s, msg.v);
          if (msg.t === 'nav' && window.location.pathname !== msg.path) {
            window.location.href = msg.path;
          }
        } catch (ex) {}
        setTimeout(function () { syncing = false; }, 50);
      };

      ws.onclose = function () { setTimeout(connect, 600); };
      ws.onerror = function () {};
    } catch (ex) {
      setTimeout(connect, 1000);
    }
  }

  function send(obj) {
    if (syncing) return;
    if (ws && ws.readyState === 1 /* OPEN */) {
      try { ws.send(JSON.stringify(obj)); } catch (ex) {}
    }
  }

  // ── Selector CSS para reproducir el click en otro iframe ────────────────
  function buildSelector(el) {
    if (!el || !el.tagName) return '';
    if (el.id) return '#' + cssEscape(el.id);
    var parts = [];
    var cur = el;
    while (cur && cur.tagName && cur !== document.body) {
      if (cur.id) { parts.unshift('#' + cssEscape(cur.id)); break; }
      var sel = cur.tagName.toLowerCase();
      var par = cur.parentElement;
      if (par) {
        var sibs = Array.prototype.filter.call(par.children, function (c) {
          return c.tagName === cur.tagName;
        });
        if (sibs.length > 1) sel += ':nth-of-type(' + (sibs.indexOf(cur) + 1) + ')';
      }
      parts.unshift(sel);
      cur = cur.parentElement;
    }
    return parts.join(' > ');
  }

  function cssEscape(str) {
    if (typeof CSS !== 'undefined' && CSS.escape) return CSS.escape(str);
    return str.replace(/([^\w-])/g, '\\$1');
  }

  // ── Reproducir eventos recibidos ─────────────────────────────────────────
  function clickElement(selector) {
    try {
      var el = document.querySelector(selector);
      if (!el) return;
      el.style.outline = '2px solid #f97316';
      setTimeout(function () { el.style.outline = ''; }, 400);
      el.click();
    } catch (ex) {}
  }

  function scrollToPercent(p) {
    var el = document.documentElement;
    var max = el.scrollHeight - el.clientHeight;
    if (max > 0) el.scrollTop = p * max;
  }

  function setInputValue(selector, value) {
    try {
      var el = document.querySelector(selector);
      if (!el) return;
      el.value = value;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    } catch (ex) {}
  }

  // ── Capturar eventos del usuario ─────────────────────────────────────────
  document.addEventListener('click', function (e) {
    var s = buildSelector(e.target);
    if (s) send({ t: 'cl', s: s });
  }, true);

  var scrollTimer;
  document.addEventListener('scroll', function () {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(function () {
      var el = document.documentElement;
      var max = el.scrollHeight - el.clientHeight;
      send({ t: 'sc', p: max > 0 ? el.scrollTop / max : 0 });
    }, 30);
  }, true);

  document.addEventListener('input', function (e) {
    if (e.target && e.target.value !== undefined) {
      send({ t: 'in', s: buildSelector(e.target), v: e.target.value });
    }
  }, true);

  // Navigation sync
  document.addEventListener('click', function (e) {
    var link = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if (!link) return;
    var href = link.getAttribute('href');
    if (!href || href.charAt(0) === '#' || /^javascript:/i.test(href) || /^https?:/i.test(href)) return;
    setTimeout(function () {
      send({ t: 'nav', path: window.location.pathname });
    }, 300);
  }, true);

  connect();
})();
