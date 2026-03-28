'use strict';

const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const db = require('../db');

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const PLANES = {
  gratis:  { label: 'Prueba Gratis', precio: 0 },
  mensual: { label: 'Mensual', precio: 150 },
  anual:   { label: 'Anual', precio: 1500 },
  '2anos': { label: '2 Años', precio: 2500 },
  vida:    { label: 'De Por Vida', precio: 3200 },
};

const MODULOS = [
  { key: 'mesas',        label: 'Mesas y Pedidos',               precio: 0,  icon: 'bi-grid-3x3-gap-fill' },
  { key: 'cocina',       label: 'Cocina',                        precio: 0,  icon: 'bi-fire' },
  { key: 'almacen',      label: 'Almacén / Inventario',          precio: 30, icon: 'bi-box-seam' },
  { key: 'sunat',        label: 'SUNAT / Facturación electrónica', precio: 50, icon: 'bi-building' },
  { key: 'delivery',     label: 'Delivery',                      precio: 30, icon: 'bi-bicycle' },
  { key: 'reservas',     label: 'Reservas',                      precio: 20, icon: 'bi-calendar-check' },
  { key: 'facturacion',  label: 'Facturación rápida',            precio: 0,  icon: 'bi-receipt-cutoff' },
  { key: 'caja',         label: 'Caja y Turnos',                 precio: 0,  icon: 'bi-wallet2' },
  { key: 'reportes',     label: 'Reportes y Analítica',          precio: 20, icon: 'bi-bar-chart-line-fill' },
  { key: 'chat_ia',      label: 'Chat IA (DalIA)',               precio: 40, icon: 'bi-stars' },
  { key: 'recetas',      label: 'Recetas',                       precio: 25, icon: 'bi-journal-text' },
  { key: 'promociones',  label: 'Promociones',                   precio: 20, icon: 'bi-megaphone' },
];

// ---------------------------------------------------------------------------
// GET /superadmin/cotizador — Render page
// ---------------------------------------------------------------------------

router.get('/', (req, res) => {
  res.render('superadmin/cotizador', {
    planes: PLANES,
    modulos: MODULOS,
    pageTitle: 'Cotizador',
  });
});

// ---------------------------------------------------------------------------
// GET /api/superadmin/cotizador/cotizaciones — List all quotes
// ---------------------------------------------------------------------------

router.get('/cotizaciones', async (req, res) => {
  try {
    const [rows] = await db.query(
      `SELECT id, nro_cotizacion, nombre_cliente, nombre_restaurante,
              plan_base, total, estado, valida_hasta, created_at
       FROM cotizaciones ORDER BY created_at DESC`
    );
    res.json(rows || []);
  } catch (err) {
    console.error('List cotizaciones error:', err.message);
    res.status(500).json({ error: 'Error al listar cotizaciones' });
  }
});

// ---------------------------------------------------------------------------
// POST /api/superadmin/cotizador/cotizaciones — Create quote + generate PDF
// ---------------------------------------------------------------------------

router.post('/cotizaciones', async (req, res) => {
  try {
    const {
      nombre_cliente, ruc_dni, telefono, email, nombre_restaurante,
      plan_base, plan_precio, modulos, usuarios_qty, usuario_precio_unit,
      almacenamiento_gb, almacenamiento_precio_gb, descuento, nota, vigencia_dias
    } = req.body;

    if (!nombre_cliente || !plan_base) {
      return res.status(400).json({ error: 'Nombre del cliente y plan base son requeridos' });
    }

    // Calculate totals
    const planPrecio = Number(plan_precio) || 0;
    const mods = Array.isArray(modulos) ? modulos : [];
    const modulosTotal = mods.reduce((sum, m) => sum + (m.incluido ? Number(m.precio) || 0 : 0), 0);
    const usersQty = Number(usuarios_qty) || 1;
    const userUnit = Number(usuario_precio_unit) || 0;
    const usersTotal = usersQty > 1 ? (usersQty - 1) * userUnit : 0;
    const storageGb = Number(almacenamiento_gb) || 10;
    const storageUnit = Number(almacenamiento_precio_gb) || 0;
    const storageTotal = storageGb > 10 ? (storageGb - 10) * storageUnit : 0;
    const subtotal = planPrecio + modulosTotal + usersTotal + storageTotal;
    const desc = Number(descuento) || 0;
    const total = Math.max(0, subtotal - desc);

    const vigencia = Number(vigencia_dias) || 15;
    const validaHasta = new Date();
    validaHasta.setDate(validaHasta.getDate() + vigencia);

    // Generate nro_cotizacion
    const [[seqRow]] = await db.query("SELECT nextval('cotizaciones_nro_seq') as seq");
    const hoy = new Date();
    const nro = `COT-${hoy.getFullYear()}${String(hoy.getMonth()+1).padStart(2,'0')}${String(hoy.getDate()).padStart(2,'0')}-${String(seqRow.seq).padStart(4,'0')}`;

    // Generate PDF
    const pdfBuffer = await generarPDF({
      nro, nombre_cliente, ruc_dni, telefono, email, nombre_restaurante,
      plan_base, plan_precio: planPrecio, modulos: mods,
      usuarios_qty: usersQty, usuario_precio_unit: userUnit,
      almacenamiento_gb: storageGb, almacenamiento_precio_gb: storageUnit,
      subtotal, descuento: desc, total, nota, valida_hasta: validaHasta,
    });

    // Insert into DB
    const [[row]] = await db.query(
      `INSERT INTO cotizaciones (nro_cotizacion, nombre_cliente, ruc_dni, telefono, email,
        nombre_restaurante, plan_base, plan_precio, modulos, usuarios_qty, usuario_precio_unit,
        almacenamiento_gb, almacenamiento_precio_gb, descuento, nota, subtotal, total,
        estado, valida_hasta, pdf, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,'pendiente',?,?,?)
       RETURNING id, nro_cotizacion`,
      [nro, nombre_cliente, ruc_dni||null, telefono||null, email||null,
       nombre_restaurante||null, plan_base, planPrecio, JSON.stringify(mods),
       usersQty, userUnit, storageGb, storageUnit, desc, nota||null,
       subtotal, total, validaHasta, pdfBuffer, req.session?.user?.id||null]
    );

    res.status(201).json({ id: row.id, nro_cotizacion: row.nro_cotizacion, total });
  } catch (err) {
    console.error('Create cotizacion error:', err.message);
    res.status(500).json({ error: 'Error al crear cotización' });
  }
});

// ---------------------------------------------------------------------------
// GET /api/superadmin/cotizador/cotizaciones/:id/pdf — Download PDF
// ---------------------------------------------------------------------------

router.get('/cotizaciones/:id/pdf', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const [[row]] = await db.query('SELECT nro_cotizacion, pdf FROM cotizaciones WHERE id = ?', [id]);
    if (!row || !row.pdf) return res.status(404).json({ error: 'Cotización no encontrada' });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${row.nro_cotizacion}.pdf"`);
    res.send(row.pdf);
  } catch (err) {
    console.error('Download cotizacion PDF error:', err.message);
    res.status(500).json({ error: 'Error al descargar PDF' });
  }
});

// ---------------------------------------------------------------------------
// PUT /api/superadmin/cotizador/cotizaciones/:id/estado — Update status
// ---------------------------------------------------------------------------

router.put('/cotizaciones/:id/estado', async (req, res) => {
  try {
    const id = Number(req.params.id);
    const { estado } = req.body;
    const validos = ['pendiente', 'enviada', 'aceptada', 'rechazada', 'expirada'];
    if (!validos.includes(estado)) return res.status(400).json({ error: 'Estado inválido' });

    await db.query('UPDATE cotizaciones SET estado = ? WHERE id = ?', [estado, id]);
    res.json({ ok: true });
  } catch (err) {
    console.error('Update cotizacion estado error:', err.message);
    res.status(500).json({ error: 'Error al actualizar estado' });
  }
});

// ---------------------------------------------------------------------------
// PDF Generation Helper
// ---------------------------------------------------------------------------

function generarPDF(data) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margins: { top: 50, bottom: 50, left: 55, right: 55 } });
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('error', reject);
    doc.on('end', () => resolve(Buffer.concat(chunks)));

    const W = doc.page.width - 110;

    // --- Header ---
    const logoPath = path.join(__dirname, '..', 'public', 'img', 'logo-mirest.png');
    if (fs.existsSync(logoPath)) {
      doc.image(logoPath, 55, 40, { width: 80 });
    }
    doc.fontSize(20).fillColor('#f97316').text('COTIZACIÓN', 200, 50, { align: 'right' });
    doc.fontSize(10).fillColor('#64748b').text(data.nro, 200, 75, { align: 'right' });

    const fechaEmision = new Date().toLocaleDateString('es-PE');
    const fechaVigencia = new Date(data.valida_hasta).toLocaleDateString('es-PE');
    doc.text(`Fecha: ${fechaEmision}`, 200, 90, { align: 'right' });
    doc.text(`Válida hasta: ${fechaVigencia}`, 200, 103, { align: 'right' });

    doc.moveDown(2);
    const afterHeader = Math.max(doc.y, 130);
    doc.y = afterHeader;

    // --- Client info ---
    doc.fontSize(11).fillColor('#1e293b').text('DATOS DEL CLIENTE', 55, doc.y, { underline: true });
    doc.moveDown(0.5);
    doc.fontSize(10).fillColor('#334155');
    if (data.nombre_cliente) doc.text(`Nombre: ${data.nombre_cliente}`);
    if (data.ruc_dni) doc.text(`RUC/DNI: ${data.ruc_dni}`);
    if (data.nombre_restaurante) doc.text(`Restaurante: ${data.nombre_restaurante}`);
    if (data.telefono) doc.text(`Teléfono: ${data.telefono}`);
    if (data.email) doc.text(`Email: ${data.email}`);

    doc.moveDown(1.5);

    // --- Table header ---
    doc.fontSize(11).fillColor('#1e293b').text('DETALLE DE LA COTIZACIÓN', 55, doc.y, { underline: true });
    doc.moveDown(0.8);

    const colDesc = 55;
    const colPrice = 420;

    function tableLine(desc, price, bold) {
      doc.fontSize(10).fillColor(bold ? '#1e293b' : '#334155');
      if (bold) doc.font('Helvetica-Bold'); else doc.font('Helvetica');
      doc.text(desc, colDesc, doc.y, { width: 340 });
      const lineY = doc.y - doc.currentLineHeight();
      doc.text(`S/ ${Number(price).toFixed(2)}`, colPrice, lineY, { width: W - colPrice + 55, align: 'right' });
    }

    // Plan base
    const planLabel = PLANES[data.plan_base]?.label || data.plan_base;
    tableLine(`Plan: ${planLabel}`, data.plan_precio, false);

    // Modules
    const activeMods = (data.modulos || []).filter(m => m.incluido);
    activeMods.forEach(m => {
      tableLine(`  ${m.label}`, m.precio, false);
    });

    // Users
    if (data.usuarios_qty > 1 && data.usuario_precio_unit > 0) {
      const usersExtra = data.usuarios_qty - 1;
      tableLine(`Usuarios extra: ${usersExtra} × S/ ${Number(data.usuario_precio_unit).toFixed(2)}`, usersExtra * data.usuario_precio_unit, false);
    }

    // Storage
    if (data.almacenamiento_gb > 10 && data.almacenamiento_precio_gb > 0) {
      const gbExtra = data.almacenamiento_gb - 10;
      tableLine(`Almacenamiento extra: ${gbExtra} GB × S/ ${Number(data.almacenamiento_precio_gb).toFixed(2)}`, gbExtra * data.almacenamiento_precio_gb, false);
    }

    // Separator
    doc.moveDown(0.5);
    doc.moveTo(colDesc, doc.y).lineTo(colPrice + 80, doc.y).strokeColor('#cbd5e1').lineWidth(0.5).stroke();
    doc.moveDown(0.5);

    // Subtotal
    tableLine('Subtotal', data.subtotal, false);

    // Discount
    if (data.descuento > 0) {
      doc.fillColor('#22c55e');
      tableLine('Descuento', `-${data.descuento}`, false);
    }

    // Total
    doc.moveDown(0.3);
    doc.moveTo(colDesc, doc.y).lineTo(colPrice + 80, doc.y).strokeColor('#1e293b').lineWidth(1).stroke();
    doc.moveDown(0.5);
    tableLine('TOTAL', data.total, true);

    // Note
    if (data.nota) {
      doc.moveDown(1.5);
      doc.fontSize(10).fillColor('#64748b').font('Helvetica-Oblique').text(`Nota: ${data.nota}`, colDesc);
    }

    // Footer
    doc.moveDown(2);
    doc.fontSize(9).fillColor('#94a3b8').font('Helvetica');
    doc.text('—', colDesc);
    doc.text('mirestconia.com — Sistema de Gestión para Restaurantes');
    doc.text('Contacto: info@mirestconia.com');

    doc.end();
  });
}

module.exports = router;
