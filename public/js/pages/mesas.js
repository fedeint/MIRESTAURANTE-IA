(function(window, document) {
  function abrirMesa(mesaId, numero, estado) {
    if (estado === 'bloqueada') return;
    var config = window.MesasConfig || {};
    var basePath = config.basePath || '';
    window.location.href = basePath + '/pedido-nuevo?mesa=' + mesaId;
  }

  function initPwaFilters() {
    var currentFilter = 'todas';
    var allCards = Array.from(document.querySelectorAll('.m-card[data-mesa-id]'));
    var filterButtons = document.querySelectorAll('.m-filter-btn');
    if (!allCards.length || !filterButtons.length) return;

    function applyFilter() {
      allCards.forEach(function(card) {
        var estado = card.dataset.estado;
        var show = true;
        if (currentFilter === 'libre') show = estado === 'libre';
        else if (currentFilter === 'ocupada') show = estado === 'ocupada';
        else if (currentFilter === 'reservada') show = estado === 'reservada';
        card.style.display = show ? '' : 'none';
      });
    }

    filterButtons.forEach(function(btn) {
      btn.addEventListener('click', function() {
        currentFilter = btn.dataset.filter;
        filterButtons.forEach(function(b) { b.classList.remove('active'); });
        btn.classList.add('active');
        applyFilter();
      });
    });
  }

  function initPwaAutoRefresh() {
    var prevOcupadas = document.querySelectorAll('.m-card[data-estado="ocupada"]').length;
    window.setInterval(function() { window.location.reload(); }, 30 * 1000);
    window.addEventListener('pageshow', function() {
      var now = document.querySelectorAll('.m-card[data-estado="ocupada"]').length;
      if (now > prevOcupadas) {
        document.title = '🍽️ (' + now + ') Mesas';
        if (navigator.vibrate) navigator.vibrate([80, 40, 80]);
        window.setTimeout(function() { document.title = 'Mesas'; }, 4000);
      }
      prevOcupadas = now;
    });
  }

  function initMesas() {
    initPwaFilters();
    initPwaAutoRefresh();
  }

  window.App = window.App || {};
  window.App.mesas = {
    initMesas: initMesas,
    initPwaFilters: initPwaFilters,
    initPwaAutoRefresh: initPwaAutoRefresh,
    abrirMesa: abrirMesa
  };
  window.Mesas = Object.assign(window.Mesas || {}, window.App.mesas);
  window.abrirMesa = abrirMesa;

  document.addEventListener('DOMContentLoaded', function() {
    if (document.body.dataset.page === 'mesas') initMesas();
  });
})(window, document);
