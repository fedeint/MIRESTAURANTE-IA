(function(window, document) {
  function initPedidoTabs() {
    document.querySelectorAll('.ped-tab').forEach(function(btn) {
      btn.addEventListener('click', function() {
        var target = this.dataset.tab;
        document.querySelectorAll('.ped-tab').forEach(function(b) { b.classList.remove('active'); });
        document.querySelectorAll('.ped-tab-content').forEach(function(c) { c.classList.remove('active'); });
        this.classList.add('active');
        var content = document.getElementById('tab-' + target);
        if (content) content.classList.add('active');
        var url = new URL(window.location);
        url.searchParams.set('tab', target);
        history.replaceState(null, '', url);
      });
    });
  }

  function initPedidosAutoRefresh() {
    window.setInterval(function() { window.location.reload(); }, 30 * 1000);
  }

  function initPedidos() {
    initPedidoTabs();
    initPedidosAutoRefresh();
  }

  window.App = window.App || {};
  window.App.pedidos = {
    initPedidos: initPedidos,
    initPedidoTabs: initPedidoTabs,
    initPedidosAutoRefresh: initPedidosAutoRefresh
  };

  document.addEventListener('DOMContentLoaded', function() {
    if (document.body.dataset.page === 'pedidos') initPedidos();
  });
})(window, document);
