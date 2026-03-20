const { AsyncLocalStorage } = require('node:async_hooks');

const tenantStorage = new AsyncLocalStorage();

function getTenantId() {
    const store = tenantStorage.getStore();
    if (!store?.tenantId) return null;
    return store.tenantId;
}

function runWithTenant(tenantId, fn) {
    return tenantStorage.run({ tenantId }, fn);
}

module.exports = { getTenantId, runWithTenant };
