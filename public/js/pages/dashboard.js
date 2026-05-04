(function(window, document) {
  function initDashboard() {}

  window.App = window.App || {};
  window.App.dashboard = { initDashboard: initDashboard };

  document.addEventListener('DOMContentLoaded', function() {
    if (document.body.dataset.page === 'dashboard') initDashboard();
  });
})(window, document);
