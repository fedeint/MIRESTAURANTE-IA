/**
 * services/printer.js
 * Stub de impresora térmica para cocina.
 * TODO: integrar driver real (ESC/POS vía USB o red) en V2.
 */

const logger = require('../lib/logger');

/**
 * Imprime (o loguea en modo stub) un ticket de cocina.
 * @param {number} pedidoId
 * @param {Array}  items     - [{ nombre, cantidad, notas }]
 * @param {string|number} mesa - número de mesa o tipo
 * @param {string} notas     - notas generales del pedido
 * @returns {Promise<{ ok: boolean, mode: string }>}
 */
async function printKitchenTicket(pedidoId, items, mesa, notas) {
  // TODO: integración real con impresora térmica (ESC/POS vía USB o red)
  logger.info('PRINTER_KITCHEN_TICKET', {
    pedidoId,
    mesa,
    itemsCount: (items || []).length,
    items: (items || []).map(function(i) {
      return { nombre: i.nombre || i.producto_nombre, cantidad: i.cantidad, notas: i.notas };
    }),
    notas,
    printedAt: new Date().toISOString(),
  });
  return { ok: true, mode: 'stub' };
}

module.exports = { printKitchenTicket };
