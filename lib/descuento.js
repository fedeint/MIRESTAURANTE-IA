// lib/descuento.js
// Pure discount calculation logic — no DB, fully unit-testable.
'use strict';

/**
 * Calculate discount amount and final total given a promo record and base total.
 *
 * @param {object} promo  - row from `promociones` table: { tipo, valor }
 * @param {number} base   - current order total before discount
 * @returns {{ descuento_monto: number, descuento_porcentaje: number, total_final: number }}
 */
function calcularDescuento(promo, base) {
  const b = Number(base || 0);
  let descuento_monto = 0;
  let descuento_porcentaje = 0;

  if (promo.tipo === 'porcentaje') {
    descuento_porcentaje = Number(promo.valor);
    descuento_monto = Math.round(b * (descuento_porcentaje / 100) * 100) / 100;
  } else if (promo.tipo === 'monto_fijo') {
    descuento_monto = Math.min(Number(promo.valor), b);
    descuento_porcentaje = b > 0 ? Math.round((descuento_monto / b) * 100) : 0;
  }

  const total_final = Math.max(0, Math.round((b - descuento_monto) * 100) / 100);
  return { descuento_monto, descuento_porcentaje, total_final };
}

/**
 * Validate a promo record against business rules (not DB queries).
 * Returns null if valid, or a motivo string if invalid.
 *
 * @param {object|null} promo  - DB row or null
 * @returns {string|null}
 */
function validarPromo(promo) {
  if (!promo) return 'Código inválido o expirado';
  if (promo.usos_maximo && Number(promo.usos_actual) >= Number(promo.usos_maximo)) {
    return 'Este código ya alcanzó el límite de usos';
  }
  return null;
}

module.exports = { calcularDescuento, validarPromo };
