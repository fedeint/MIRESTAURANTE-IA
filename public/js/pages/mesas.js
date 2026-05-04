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

  function initMenuPreselection() {
    if (window.location.search.indexOf('from=menu') === -1) return;
    
    try {
      var raw = sessionStorage.getItem('menuSelection');
      if (!raw) return;
      var items = JSON.parse(raw);
      if (!Array.isArray(items) || items.length === 0) {
        sessionStorage.removeItem('menuSelection');
        return;
      }
      
      var block = document.createElement('div');
      block.className = 'menu-preselection-block';
      block.style.cssText = 'background: rgba(239, 82, 15, 0.1); color: #EF520F; padding: 12px 16px; border-radius: 12px; margin: 16px; border: 1px dashed #EF520F; font-weight: 500; font-size: 14px;';
      
      var names = items.slice(0, 3).map(function(i) { return i.nombre; }).join(', ');
      var suffix = items.length > 3 ? '...' : '';
      block.innerHTML = '<i class="bi bi-info-circle"></i> Preselección: ' + items.length + ' ítems (' + names + suffix + ')';
      
      var container = document.querySelector('.m-tabs') || document.querySelector('.m-header') || document.body;
      if (container) {
        container.insertAdjacentElement('afterend', block);
      }
      
      console.log('Preselección activa:', items);
      // NOTE: We don't remove it here so it persists on refresh. 
      // It will be cleared when the session ends or user navigates back to /menu.
    } catch(e) {
      sessionStorage.removeItem('menuSelection');
    }
  }

  function initMesas() {
    initPwaFilters();
    initPwaAutoRefresh();
    initMenuPreselection();
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
