'use strict';

/**
 * Genera URLs relativas para el tenant actual.
 * Si estamos en un path de tenant (/:slug), prefija con /slug.
 * Si no, devuelve la ruta tal cual.
 *
 * Uso en EJS: tenantUrl('/mesas') → '/chuleta/mesas' o '/mesas'
 */
function createTenantUrlHelper(basePath) {
  return function tenantUrl(path) {
    if (!basePath) return path;
    return basePath + (path.startsWith('/') ? path : '/' + path);
  };
}

module.exports = { createTenantUrlHelper };
