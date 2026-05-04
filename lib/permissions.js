const PERMISSIONS = {
  MESERO: ['inicio', 'pedidos', 'cocina'],
  CAJERO: ['inicio', 'caja', 'pedidos', 'facturacion', 'administracion'],
  ADMIN: [
    'inicio', 'caja', 'pedidos', 'cocina', 'almacen', 'facturacion', 'delivery', 
    'administracion', 'crm', 'usuarios', 'configuracion', 'dallia'
  ],
  SUPER_ADMIN: ['*']
};

function canAccess(role, module) {
  if (!role) return false;
  const upperRole = role.toUpperCase();
  
  // Superadmin bypass
  if (upperRole === 'SUPER_ADMIN' || upperRole === 'SUPERADMIN') return true;
  
  // Admin role normalization
  if (upperRole === 'ADMINISTRADOR' || upperRole === 'ADMIN') {
    return PERMISSIONS.ADMIN.includes(module) || module === '*';
  }
  
  return PERMISSIONS[upperRole]?.includes(module) || false;
}

module.exports = { PERMISSIONS, canAccess };
