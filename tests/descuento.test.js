// tests/descuento.test.js
// Unit tests for lib/descuento.js — discount calculation and validation.
'use strict';

const { test } = require('node:test');
const assert   = require('node:assert/strict');
const { calcularDescuento, validarPromo } = require('../lib/descuento');

// ─── calcularDescuento ───────────────────────────────────────────────────────

test('calcularDescuento: porcentaje 20% on S/100', () => {
  const result = calcularDescuento({ tipo: 'porcentaje', valor: 20 }, 100);
  assert.equal(result.descuento_porcentaje, 20);
  assert.equal(result.descuento_monto, 20);
  assert.equal(result.total_final, 80);
});

test('calcularDescuento: porcentaje 15% on S/89.90 rounds correctly', () => {
  const result = calcularDescuento({ tipo: 'porcentaje', valor: 15 }, 89.90);
  assert.equal(result.descuento_monto, 13.49); // 89.90 * 0.15 = 13.485 → rounded to 13.49
  assert.equal(result.total_final, 76.41);     // 89.90 - 13.49 = 76.41
});

test('calcularDescuento: porcentaje 100% does not exceed total', () => {
  const result = calcularDescuento({ tipo: 'porcentaje', valor: 100 }, 50);
  assert.equal(result.total_final, 0);
});

test('calcularDescuento: monto_fijo S/10 on S/80', () => {
  const result = calcularDescuento({ tipo: 'monto_fijo', valor: 10 }, 80);
  assert.equal(result.descuento_monto, 10);
  assert.equal(result.total_final, 70);
  assert.equal(result.descuento_porcentaje, 13); // Math.round(10/80*100) = 13
});

test('calcularDescuento: monto_fijo capped at total when discount > total', () => {
  const result = calcularDescuento({ tipo: 'monto_fijo', valor: 200 }, 50);
  assert.equal(result.descuento_monto, 50);   // capped at base
  assert.equal(result.total_final, 0);
  assert.equal(result.descuento_porcentaje, 100);
});

test('calcularDescuento: monto_fijo with base = 0 gives 0 porcentaje', () => {
  const result = calcularDescuento({ tipo: 'monto_fijo', valor: 10 }, 0);
  assert.equal(result.descuento_monto, 0);
  assert.equal(result.descuento_porcentaje, 0);
  assert.equal(result.total_final, 0);
});

test('calcularDescuento: unknown tipo returns zeros', () => {
  const result = calcularDescuento({ tipo: 'regalo_especial', valor: 50 }, 100);
  assert.equal(result.descuento_monto, 0);
  assert.equal(result.descuento_porcentaje, 0);
  assert.equal(result.total_final, 100);
});

// ─── validarPromo ────────────────────────────────────────────────────────────

test('validarPromo: null promo returns motivo', () => {
  const motivo = validarPromo(null);
  assert.equal(motivo, 'Código inválido o expirado');
});

test('validarPromo: undefined promo returns motivo', () => {
  const motivo = validarPromo(undefined);
  assert.equal(motivo, 'Código inválido o expirado');
});

test('validarPromo: valid promo with no usage limit returns null', () => {
  const motivo = validarPromo({ tipo: 'porcentaje', valor: 10, usos_maximo: 0, usos_actual: 0 });
  assert.equal(motivo, null);
});

test('validarPromo: valid promo with usage limit not reached returns null', () => {
  const motivo = validarPromo({ tipo: 'porcentaje', valor: 10, usos_maximo: 100, usos_actual: 50 });
  assert.equal(motivo, null);
});

test('validarPromo: promo at exactly usage limit returns motivo', () => {
  const motivo = validarPromo({ tipo: 'porcentaje', valor: 10, usos_maximo: 100, usos_actual: 100 });
  assert.ok(motivo);
  assert.match(motivo, /límite/i);
});

test('validarPromo: promo over usage limit returns motivo', () => {
  const motivo = validarPromo({ tipo: 'porcentaje', valor: 10, usos_maximo: 5, usos_actual: 7 });
  assert.ok(motivo);
});

test('validarPromo: string values for usos are coerced (DB may return strings)', () => {
  const motivo = validarPromo({ tipo: 'porcentaje', valor: 10, usos_maximo: '100', usos_actual: '100' });
  assert.ok(motivo); // should detect limit reached even with string values
});
