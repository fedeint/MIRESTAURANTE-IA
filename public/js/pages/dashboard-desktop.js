(function(window, document) {
  function initDashboardDesktop() {}

  window.App = window.App || {};
  window.App.dashboardDesktop = { initDashboardDesktop: initDashboardDesktop };

  document.addEventListener('DOMContentLoaded', function() {
    if (document.body.dataset.page === 'dashboard-desktop') initDashboardDesktop();
  });
})(window, document);
