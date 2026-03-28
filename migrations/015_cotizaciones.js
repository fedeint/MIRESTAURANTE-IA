'use strict';
const db = require('../db');

async function up() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS cotizaciones (
      id SERIAL PRIMARY KEY,
      nro_cotizacion VARCHAR(30) UNIQUE NOT NULL,
      nombre_cliente VARCHAR(200) NOT NULL,
      ruc_dni VARCHAR(20),
      telefono VARCHAR(20),
      email VARCHAR(150),
      nombre_restaurante VARCHAR(200),
      plan_base VARCHAR(30) NOT NULL,
      plan_precio DECIMAL(10,2) NOT NULL DEFAULT 0,
      modulos JSON NOT NULL DEFAULT '[]',
      usuarios_qty INT NOT NULL DEFAULT 1,
      usuario_precio_unit DECIMAL(10,2) NOT NULL DEFAULT 0,
      almacenamiento_gb INT NOT NULL DEFAULT 10,
      almacenamiento_precio_gb DECIMAL(10,2) NOT NULL DEFAULT 0,
      descuento DECIMAL(10,2) NOT NULL DEFAULT 0,
      nota TEXT,
      subtotal DECIMAL(10,2) NOT NULL DEFAULT 0,
      total DECIMAL(10,2) NOT NULL DEFAULT 0,
      moneda VARCHAR(5) NOT NULL DEFAULT 'PEN',
      estado VARCHAR(20) NOT NULL DEFAULT 'pendiente',
      valida_hasta DATE,
      pdf BYTEA,
      created_by INT REFERENCES usuarios(id),
      created_at TIMESTAMP DEFAULT NOW()
    )
  `);

  await db.query(`
    CREATE SEQUENCE IF NOT EXISTS cotizaciones_nro_seq START 1
  `);

  console.log('Migration 015_cotizaciones: OK');
}

module.exports = { up };
