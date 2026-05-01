/**
 * modal-fix.js - Fallback para modales que queden dentro de .dg-main
 * Solo actua cuando un modal se va a abrir (show.bs.modal)
 */
document.addEventListener('show.bs.modal', function(e) {
  if (e.target.parentElement && e.target.parentElement !== document.body) {
    document.body.appendChild(e.target);
  }
});
