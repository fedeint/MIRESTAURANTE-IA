# Cotizador Superadmin — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a quote generator in the superadmin panel that creates customizable pricing quotes (plan + modules + users + storage), generates PDFs, and sends them via WhatsApp Web.

**Architecture:** New route file `routes/cotizaciones.js` mounted under `/superadmin/cotizador` and `/api/superadmin/cotizaciones`. EJS view with 2-column layout (form + live preview). PDFKit for PDF generation. WhatsApp via `wa.me` link. Data stored in `cotizaciones` table for future CRM.

**Tech Stack:** Express, EJS, PDFKit (already in project), PostgreSQL, Bootstrap 5 (dark theme matching superadmin)

---

### Task 1: Database Migration

**Files:**
- Create: `migrations/015_cotizaciones.js`

- [ ] **Step 1: Create migration file**

```javascript
// migrations/015_cotizaciones.js
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
```

- [ ] **Step 2: Run migration**

Run: `node -e "require('./migrations/015_cotizaciones').up().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)})"`
Expected: "Migration 015_cotizaciones: OK"

- [ ] **Step 3: Verify table exists**

Run: `node -e "const db=require('./db');db.query(\"SELECT column_name,data_type FROM information_schema.columns WHERE table_name='cotizaciones' ORDER BY ordinal_position\").then(([r])=>{console.log(r.map(c=>c.column_name).join(', '));process.exit(0)})"`
Expected: All columns listed

- [ ] **Step 4: Commit**

```bash
git add migrations/015_cotizaciones.js
git commit -m "feat(cotizador): add cotizaciones table migration"
```

---

### Task 2: Backend Routes

**Files:**
- Create: `routes/cotizaciones.js`
- Modify: `server.js` (add route mount)

- [ ] **Step 1: Create routes/cotizaciones.js**

```javascript
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
// GET /api/superadmin/cotizaciones — List all quotes
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
// POST /api/superadmin/cotizaciones — Create quote + generate PDF
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
    const usersTotal = usersQty > 1 ? (usersQty - 1) * userUnit : 0; // first user included
    const storageGb = Number(almacenamiento_gb) || 10;
    const storageUnit = Number(almacenamiento_precio_gb) || 0;
    const storageTotal = storageGb > 10 ? (storageGb - 10) * storageUnit : 0; // 10GB included
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
// GET /api/superadmin/cotizaciones/:id/pdf — Download PDF
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
// PUT /api/superadmin/cotizaciones/:id/estado — Update status
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

    const W = doc.page.width - 110; // usable width

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
      const opts = bold ? { continued: false } : { continued: false };
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
```

- [ ] **Step 2: Mount routes in server.js**

Add after the superadmin route mount (around line 841). Find this block in `server.js`:

```javascript
// Superadmin panel (superadmin role only - cross-tenant)
app.use('/superadmin', requireAuth, requireRole('superadmin'), superadminRoutes);
app.use('/api/superadmin', requireAuth, requireRole('superadmin'), superadminRoutes);
```

Add below it:

```javascript
// Cotizador (superadmin only)
const cotizacionesRoutes = require('./routes/cotizaciones');
app.use('/superadmin/cotizador', requireAuth, requireRole('superadmin'), cotizacionesRoutes);
app.use('/api/superadmin/cotizador', requireAuth, requireRole('superadmin'), cotizacionesRoutes);
```

- [ ] **Step 3: Commit**

```bash
git add routes/cotizaciones.js server.js
git commit -m "feat(cotizador): add backend routes and PDF generation"
```

---

### Task 3: Sidebar Navigation

**Files:**
- Modify: `views/partials/sidebar.ejs`

- [ ] **Step 1: Add cotizador link in expanded nav**

In `views/partials/sidebar.ejs`, find this block (around line 242-244):

```html
              <a href="/contratos" class="dg-sidebar-link <%= currentPath.startsWith('/contratos') ? 'active' : '' %>">
                <i class="bi bi-file-earmark-text"></i><span>Contratos</span>
              </a>
```

Add immediately after:

```html
              <a href="/superadmin/cotizador" class="dg-sidebar-link <%= currentPath.startsWith('/superadmin/cotizador') ? 'active' : '' %>">
                <i class="bi bi-calculator"></i><span>Cotizador</span>
              </a>
```

- [ ] **Step 2: Add cotizador link in icon nav**

Find this block (around line 367-369):

```html
              <a href="/contratos" class="dg-sidebar-icon-item <%= currentPath.startsWith('/contratos') ? 'active' : '' %>" title="Contratos">
                <i class="bi bi-file-earmark-text"></i>
              </a>
```

Add immediately after:

```html
              <a href="/superadmin/cotizador" class="dg-sidebar-icon-item <%= currentPath.startsWith('/superadmin/cotizador') ? 'active' : '' %>" title="Cotizador">
                <i class="bi bi-calculator"></i>
              </a>
```

- [ ] **Step 3: Add cotizador link in panel nav**

Find this block (around line 501):

```html
              <a href="/contratos" class="dg-panel-item <%= currentPath.startsWith('/contratos') ? 'active' : '' %>"><span class="dg-panel-dot"></span>Contratos</a>
```

Add immediately after:

```html
              <a href="/superadmin/cotizador" class="dg-panel-item <%= currentPath.startsWith('/superadmin/cotizador') ? 'active' : '' %>"><span class="dg-panel-dot"></span>Cotizador</a>
```

- [ ] **Step 4: Commit**

```bash
git add views/partials/sidebar.ejs
git commit -m "feat(cotizador): add sidebar navigation link"
```

---

### Task 4: EJS View — Cotizador Page

**Files:**
- Create: `views/superadmin/cotizador.ejs`

- [ ] **Step 1: Create the full cotizador view**

Create `views/superadmin/cotizador.ejs` with:
- Dark theme matching other superadmin pages
- 2-column layout: form (left) + live preview (right)
- Client data section
- Plan selector with editable price
- Module toggles with editable prices (12 modules)
- Users and storage extras with editable prices
- Discount input + note textarea + vigencia
- Live preview panel that updates in real-time via JS
- Buttons: Guardar, Generar PDF, Enviar WhatsApp
- Quotes table below

The complete file content:

```html
<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Cotizador - mirestconia.com</title>
  <link href="/vendor/bootstrap/css/bootstrap.min.css" rel="stylesheet">
  <link rel="stylesheet" href="/vendor/bootstrap-icons/bootstrap-icons.css">
  <link rel="stylesheet" href="/css/theme.css">
  <style>
    body { background: #0f172a; }
    .dg-main { background: #0f172a; }
    .sa-card { background: #1e2235; border: 1px solid rgba(255,255,255,0.07); border-radius: 16px; color: #e2e8f0; }
    .form-control, .form-select { background: #0f172a; border: 1px solid rgba(255,255,255,0.1); color: #e2e8f0; border-radius: 8px; font-size: 0.85rem; }
    .form-control:focus, .form-select:focus { background: #0f172a; color: #e2e8f0; border-color: #f97316; box-shadow: 0 0 0 3px rgba(249,115,22,0.15); }
    .form-label { font-size: 0.78rem; font-weight: 600; color: #94a3b8; }
    .section-title { font-size: 0.72rem; font-weight: 700; text-transform: uppercase; letter-spacing: 1.5px; color: #f97316; margin-bottom: 12px; }
    .mod-row { display: flex; align-items: center; gap: 10px; padding: 7px 10px; background: rgba(255,255,255,0.02); border-radius: 8px; margin-bottom: 4px; }
    .mod-row label { flex: 1; font-size: 0.82rem; color: #94a3b8; cursor: pointer; margin: 0; display: flex; align-items: center; gap: 8px; }
    .mod-row .form-control { width: 90px; text-align: right; }
    .form-check-input:checked { background-color: #f97316; border-color: #f97316; }
    .preview-card { background: #161b2e; border: 1px solid rgba(249,115,22,0.2); border-radius: 16px; position: sticky; top: 20px; }
    .preview-line { display: flex; justify-content: space-between; padding: 4px 0; font-size: 0.83rem; color: #cbd5e1; }
    .preview-line.total { font-size: 1.1rem; font-weight: 800; color: #f97316; border-top: 2px solid rgba(249,115,22,0.3); padding-top: 10px; margin-top: 6px; }
    .preview-line.descuento { color: #22c55e; }
    .btn-orange { background: #f97316; color: #fff; border: none; border-radius: 8px; font-weight: 600; }
    .btn-orange:hover { background: #ea580c; color: #fff; }
    .btn-wa { background: #25d366; color: #fff; border: none; border-radius: 8px; font-weight: 600; }
    .btn-wa:hover { background: #1fb855; color: #fff; }
    .sa-table th { font-size: 0.7rem; font-weight: 700; text-transform: uppercase; letter-spacing: 1px; color: #64748b; border-bottom: 1px solid rgba(255,255,255,0.06); padding: 10px 12px; }
    .sa-table td { font-size: 0.83rem; color: #cbd5e1; padding: 10px 12px; border-bottom: 1px solid rgba(255,255,255,0.04); vertical-align: middle; }
    .sa-table tr:hover td { background: rgba(255,255,255,0.03); }
    .badge-estado { border-radius: 20px; padding: 3px 12px; font-size: 0.72rem; font-weight: 700; }
    .badge-pendiente { background: rgba(251,191,36,0.15); color: #fbbf24; }
    .badge-enviada { background: rgba(59,130,246,0.15); color: #3b82f6; }
    .badge-aceptada { background: rgba(34,197,94,0.15); color: #22c55e; }
    .badge-rechazada { background: rgba(239,68,68,0.15); color: #ef4444; }
    .badge-expirada { background: rgba(100,116,139,0.15); color: #94a3b8; }
    .action-btn { width: 30px; height: 30px; border-radius: 8px; display: inline-flex; align-items: center; justify-content: center; font-size: 0.8rem; cursor: pointer; border: none; }
  </style>
</head>
<body>
  <%- include('../partials/sidebar') %>
  <div class="dg-main">
    <main class="flex-grow-1">
      <div class="container-fluid" style="max-width:1400px;padding:1.5rem 1.5rem 3rem;">

        <!-- Header -->
        <div class="d-flex justify-content-between align-items-center mb-4">
          <div>
            <h4 style="font-weight:800;color:#e2e8f0;margin:0;">Cotizador</h4>
            <div style="font-size:0.78rem;color:#64748b;">Genera cotizaciones personalizadas y envíalas por WhatsApp</div>
          </div>
        </div>

        <!-- Two column layout -->
        <div class="row g-4">
          <!-- LEFT: Form -->
          <div class="col-lg-7">
            <div class="sa-card p-4">

              <!-- Client data -->
              <div class="section-title"><i class="bi bi-person me-1"></i> Datos del Cliente</div>
              <div class="row g-2 mb-3">
                <div class="col-md-6">
                  <label class="form-label">Nombre / Razón social *</label>
                  <input type="text" class="form-control" id="q_nombre" placeholder="Restaurante El Buen Sabor S.A.C.">
                </div>
                <div class="col-md-6">
                  <label class="form-label">Nombre del restaurante</label>
                  <input type="text" class="form-control" id="q_restaurante" placeholder="El Buen Sabor">
                </div>
                <div class="col-md-4">
                  <label class="form-label">RUC / DNI</label>
                  <input type="text" class="form-control" id="q_ruc" placeholder="20123456789">
                </div>
                <div class="col-md-4">
                  <label class="form-label">WhatsApp *</label>
                  <input type="text" class="form-control" id="q_telefono" placeholder="987654321">
                </div>
                <div class="col-md-4">
                  <label class="form-label">Email</label>
                  <input type="email" class="form-control" id="q_email" placeholder="contacto@ejemplo.com">
                </div>
              </div>

              <!-- Plan base -->
              <div class="section-title mt-4"><i class="bi bi-box me-1"></i> Plan Base</div>
              <div class="row g-2 mb-3">
                <div class="col-md-7">
                  <select class="form-select" id="q_plan" onchange="onPlanChange()">
                    <% Object.entries(planes).forEach(([k, v]) => { %>
                      <option value="<%= k %>" data-precio="<%= v.precio %>"><%= v.label %> — S/ <%= v.precio.toLocaleString() %></option>
                    <% }); %>
                  </select>
                </div>
                <div class="col-md-5">
                  <div class="input-group">
                    <span class="input-group-text" style="background:#0f172a;border-color:rgba(255,255,255,0.1);color:#64748b;font-size:0.8rem;">S/</span>
                    <input type="number" class="form-control" id="q_plan_precio" value="0" min="0" step="0.01" oninput="updatePreview()">
                  </div>
                </div>
              </div>

              <!-- Modules -->
              <div class="section-title mt-4"><i class="bi bi-grid me-1"></i> Módulos</div>
              <div class="mb-3" id="modulosContainer">
                <% modulos.forEach((m, i) => { %>
                  <div class="mod-row">
                    <div class="form-check form-switch mb-0">
                      <input class="form-check-input mod-check" type="checkbox" id="mod_<%= m.key %>" data-key="<%= m.key %>" data-label="<%= m.label %>" style="width:36px;height:20px;" onchange="updatePreview()">
                    </div>
                    <label for="mod_<%= m.key %>"><i class="bi <%= m.icon %>" style="color:#f97316;width:16px;text-align:center;"></i> <%= m.label %></label>
                    <div class="input-group" style="width:110px;">
                      <span class="input-group-text" style="background:#0f172a;border-color:rgba(255,255,255,0.1);color:#64748b;font-size:0.75rem;padding:2px 6px;">S/</span>
                      <input type="number" class="form-control mod-price" data-key="<%= m.key %>" value="<%= m.precio %>" min="0" step="0.01" style="padding:4px 6px;" oninput="updatePreview()">
                    </div>
                  </div>
                <% }); %>
              </div>

              <!-- Extras -->
              <div class="section-title mt-4"><i class="bi bi-plus-circle me-1"></i> Extras</div>
              <div class="row g-2 mb-3">
                <div class="col-md-6">
                  <label class="form-label">Usuarios (1 incluido)</label>
                  <div class="d-flex gap-2">
                    <input type="number" class="form-control" id="q_users" value="1" min="1" oninput="updatePreview()" style="width:70px;">
                    <div class="input-group">
                      <span class="input-group-text" style="background:#0f172a;border-color:rgba(255,255,255,0.1);color:#64748b;font-size:0.75rem;">S/ c/u</span>
                      <input type="number" class="form-control" id="q_user_price" value="10" min="0" step="0.01" oninput="updatePreview()">
                    </div>
                  </div>
                </div>
                <div class="col-md-6">
                  <label class="form-label">Almacenamiento (10 GB incluidos)</label>
                  <div class="d-flex gap-2">
                    <input type="number" class="form-control" id="q_storage" value="10" min="10" oninput="updatePreview()" style="width:70px;">
                    <div class="input-group">
                      <span class="input-group-text" style="background:#0f172a;border-color:rgba(255,255,255,0.1);color:#64748b;font-size:0.75rem;">S/ /GB</span>
                      <input type="number" class="form-control" id="q_storage_price" value="5" min="0" step="0.01" oninput="updatePreview()">
                    </div>
                  </div>
                </div>
              </div>

              <!-- Discount, Note, Vigencia -->
              <div class="row g-2 mb-3">
                <div class="col-md-4">
                  <label class="form-label">Descuento (S/)</label>
                  <input type="number" class="form-control" id="q_descuento" value="0" min="0" step="0.01" oninput="updatePreview()">
                </div>
                <div class="col-md-4">
                  <label class="form-label">Vigencia (días)</label>
                  <input type="number" class="form-control" id="q_vigencia" value="15" min="1">
                </div>
                <div class="col-md-4"></div>
                <div class="col-12">
                  <label class="form-label">Nota para el cliente</label>
                  <textarea class="form-control" id="q_nota" rows="2" placeholder="Observaciones, condiciones especiales..."></textarea>
                </div>
              </div>

            </div>
          </div>

          <!-- RIGHT: Live Preview -->
          <div class="col-lg-5">
            <div class="preview-card p-4">
              <div class="section-title"><i class="bi bi-receipt me-1"></i> Resumen de Cotización</div>
              <div id="previewBody">
                <!-- Filled by JS -->
              </div>

              <div class="d-flex flex-column gap-2 mt-4">
                <button class="btn btn-orange btn-sm" onclick="guardarCotizacion()">
                  <i class="bi bi-floppy me-1"></i> Guardar Cotización
                </button>
                <button class="btn btn-sm" style="background:rgba(255,255,255,0.06);color:#e2e8f0;border-radius:8px;" onclick="descargarPDF()" id="btnPDF" disabled>
                  <i class="bi bi-file-earmark-pdf me-1"></i> Descargar PDF
                </button>
                <button class="btn btn-wa btn-sm" onclick="enviarWhatsApp()" id="btnWA" disabled>
                  <i class="bi bi-whatsapp me-1"></i> Enviar por WhatsApp
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Quotes table -->
        <div class="sa-card p-4 mt-4">
          <div class="d-flex justify-content-between align-items-center mb-3">
            <div class="section-title mb-0"><i class="bi bi-list-ul me-1"></i> Cotizaciones Generadas</div>
          </div>
          <div class="table-responsive">
            <table class="sa-table w-100">
              <thead>
                <tr>
                  <th>Nro</th>
                  <th>Cliente</th>
                  <th>Restaurante</th>
                  <th>Plan</th>
                  <th>Total</th>
                  <th>Estado</th>
                  <th>Vigencia</th>
                  <th>Acciones</th>
                </tr>
              </thead>
              <tbody id="quotesBody">
                <tr><td colspan="8" class="text-center" style="color:#64748b;padding:2rem;">Cargando...</td></tr>
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </main>
  </div>

  <script src="/vendor/bootstrap/js/bootstrap.bundle.min.js"></script>
  <script src="/js/modal-fix.js" defer></script>
  <script>
    let lastSavedId = null;

    const PLANES = <%- JSON.stringify(planes) %>;

    function onPlanChange() {
      const sel = document.getElementById('q_plan');
      const opt = sel.options[sel.selectedIndex];
      document.getElementById('q_plan_precio').value = opt.dataset.precio;
      updatePreview();
    }

    function getFormData() {
      const mods = [];
      document.querySelectorAll('.mod-check').forEach(cb => {
        const key = cb.dataset.key;
        const label = cb.dataset.label;
        const priceInput = document.querySelector(`.mod-price[data-key="${key}"]`);
        mods.push({ key, label, incluido: cb.checked, precio: Number(priceInput.value) || 0 });
      });

      const usersQty = Math.max(1, Number(document.getElementById('q_users').value) || 1);
      const userPrice = Number(document.getElementById('q_user_price').value) || 0;
      const storageGb = Math.max(10, Number(document.getElementById('q_storage').value) || 10);
      const storagePrice = Number(document.getElementById('q_storage_price').value) || 0;
      const planPrecio = Number(document.getElementById('q_plan_precio').value) || 0;
      const descuento = Number(document.getElementById('q_descuento').value) || 0;

      const modulosTotal = mods.filter(m => m.incluido).reduce((s, m) => s + m.precio, 0);
      const usersTotal = usersQty > 1 ? (usersQty - 1) * userPrice : 0;
      const storageTotal = storageGb > 10 ? (storageGb - 10) * storagePrice : 0;
      const subtotal = planPrecio + modulosTotal + usersTotal + storageTotal;
      const total = Math.max(0, subtotal - descuento);

      return {
        nombre_cliente: document.getElementById('q_nombre').value.trim(),
        nombre_restaurante: document.getElementById('q_restaurante').value.trim(),
        ruc_dni: document.getElementById('q_ruc').value.trim(),
        telefono: document.getElementById('q_telefono').value.trim(),
        email: document.getElementById('q_email').value.trim(),
        plan_base: document.getElementById('q_plan').value,
        plan_precio: planPrecio,
        modulos: mods,
        usuarios_qty: usersQty,
        usuario_precio_unit: userPrice,
        almacenamiento_gb: storageGb,
        almacenamiento_precio_gb: storagePrice,
        descuento,
        nota: document.getElementById('q_nota').value.trim(),
        vigencia_dias: Number(document.getElementById('q_vigencia').value) || 15,
        // Calculated
        _modulosTotal: modulosTotal,
        _usersTotal: usersTotal,
        _storageTotal: storageTotal,
        _subtotal: subtotal,
        _total: total,
      };
    }

    function updatePreview() {
      const d = getFormData();
      const planLabel = PLANES[d.plan_base]?.label || d.plan_base;
      let html = '';

      html += `<div class="preview-line"><span>Plan: ${planLabel}</span><span>S/ ${d.plan_precio.toFixed(2)}</span></div>`;

      const activeMods = d.modulos.filter(m => m.incluido);
      activeMods.forEach(m => {
        html += `<div class="preview-line" style="font-size:0.78rem;color:#94a3b8;"><span>&nbsp;&nbsp;${m.label}</span><span>S/ ${m.precio.toFixed(2)}</span></div>`;
      });

      if (d.usuarios_qty > 1 && d.usuario_precio_unit > 0) {
        html += `<div class="preview-line"><span>Usuarios extra: ${d.usuarios_qty - 1} × S/ ${d.usuario_precio_unit.toFixed(2)}</span><span>S/ ${d._usersTotal.toFixed(2)}</span></div>`;
      }

      if (d.almacenamiento_gb > 10 && d.almacenamiento_precio_gb > 0) {
        html += `<div class="preview-line"><span>Almac. extra: ${d.almacenamiento_gb - 10} GB × S/ ${d.almacenamiento_precio_gb.toFixed(2)}</span><span>S/ ${d._storageTotal.toFixed(2)}</span></div>`;
      }

      html += `<div class="preview-line" style="margin-top:8px;padding-top:8px;border-top:1px solid rgba(255,255,255,0.06);"><span>Subtotal</span><span>S/ ${d._subtotal.toFixed(2)}</span></div>`;

      if (d.descuento > 0) {
        html += `<div class="preview-line descuento"><span>Descuento</span><span>- S/ ${d.descuento.toFixed(2)}</span></div>`;
      }

      html += `<div class="preview-line total"><span>TOTAL</span><span>S/ ${d._total.toFixed(2)}</span></div>`;

      document.getElementById('previewBody').innerHTML = html;
    }

    async function guardarCotizacion() {
      const d = getFormData();
      if (!d.nombre_cliente) return alert('El nombre del cliente es requerido');
      if (!d.telefono) return alert('El teléfono WhatsApp es requerido');

      try {
        const res = await fetch('/api/superadmin/cotizador/cotizaciones', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(d),
        });
        const json = await res.json();
        if (!res.ok) return alert('Error: ' + (json.error || 'desconocido'));

        lastSavedId = json.id;
        document.getElementById('btnPDF').disabled = false;
        document.getElementById('btnWA').disabled = false;
        alert('Cotización ' + json.nro_cotizacion + ' guardada. Total: S/ ' + Number(json.total).toFixed(2));
        loadQuotes();
      } catch (e) {
        alert('Error de red: ' + e.message);
      }
    }

    function descargarPDF() {
      if (!lastSavedId) return;
      window.open('/api/superadmin/cotizador/cotizaciones/' + lastSavedId + '/pdf', '_blank');
    }

    function enviarWhatsApp() {
      if (!lastSavedId) return;
      const d = getFormData();
      const planLabel = PLANES[d.plan_base]?.label || d.plan_base;
      const activeMods = d.modulos.filter(m => m.incluido).map(m => m.label).join(', ');

      // Download PDF first
      window.open('/api/superadmin/cotizador/cotizaciones/' + lastSavedId + '/pdf', '_blank');

      // Build WhatsApp message
      const tel = d.telefono.replace(/\D/g, '');
      const telFull = tel.startsWith('51') ? tel : '51' + tel;
      const msg = `Hola ${d.nombre_cliente}, le envío la cotización para ${d.nombre_restaurante || 'su restaurante'}.

Plan: ${planLabel}
${activeMods ? 'Módulos: ' + activeMods : ''}
Total: S/ ${d._total.toFixed(2)}

Le adjunto el PDF con el detalle completo.

mirestconia.com`;

      setTimeout(() => {
        window.open('https://wa.me/' + telFull + '?text=' + encodeURIComponent(msg), '_blank');
      }, 500);
    }

    async function loadQuotes() {
      try {
        const res = await fetch('/api/superadmin/cotizador/cotizaciones');
        const rows = await res.json();
        const body = document.getElementById('quotesBody');

        if (!rows.length) {
          body.innerHTML = '<tr><td colspan="8" class="text-center" style="color:#64748b;padding:2rem;">Sin cotizaciones aún</td></tr>';
          return;
        }

        body.innerHTML = rows.map(r => {
          const fecha = r.created_at ? new Date(r.created_at).toLocaleDateString('es-PE') : '-';
          const vigencia = r.valida_hasta ? new Date(r.valida_hasta).toLocaleDateString('es-PE') : '-';
          return `<tr>
            <td style="font-weight:600;color:#e2e8f0;font-size:0.78rem;">${r.nro_cotizacion}</td>
            <td>${r.nombre_cliente || '-'}</td>
            <td style="color:#64748b;">${r.nombre_restaurante || '-'}</td>
            <td>${(r.plan_base || '').toUpperCase()}</td>
            <td style="color:#22c55e;font-weight:600;">S/ ${Number(r.total).toFixed(2)}</td>
            <td><span class="badge-estado badge-${r.estado}">${r.estado}</span></td>
            <td style="font-size:0.75rem;color:#64748b;">${vigencia}</td>
            <td>
              <div class="d-flex gap-1">
                <button class="action-btn" style="background:rgba(99,102,241,0.12);color:#818cf8;" onclick="window.open('/api/superadmin/cotizador/cotizaciones/${r.id}/pdf','_blank')" title="Descargar PDF">
                  <i class="bi bi-file-pdf"></i>
                </button>
                <select class="form-select form-select-sm" style="width:auto;font-size:0.72rem;background:#0f172a;color:#94a3b8;border:1px solid rgba(255,255,255,0.08);padding:2px 6px;" onchange="cambiarEstado(${r.id}, this.value)" title="Cambiar estado">
                  ${['pendiente','enviada','aceptada','rechazada','expirada'].map(e => `<option value="${e}" ${r.estado===e?'selected':''}>${e}</option>`).join('')}
                </select>
              </div>
            </td>
          </tr>`;
        }).join('');
      } catch (e) {
        console.error('Error loading quotes:', e);
      }
    }

    async function cambiarEstado(id, estado) {
      try {
        await fetch('/api/superadmin/cotizador/cotizaciones/' + id + '/estado', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ estado }),
        });
        loadQuotes();
      } catch (e) {
        alert('Error: ' + e.message);
      }
    }

    // Init
    onPlanChange();
    updatePreview();
    loadQuotes();
  </script>
</body>
</html>
```

- [ ] **Step 2: Commit**

```bash
git add views/superadmin/cotizador.ejs
git commit -m "feat(cotizador): add cotizador view with form, live preview, and quotes table"
```

---

### Task 5: Integration Test

**Files:** None (manual verification)

- [ ] **Step 1: Run migration**

```bash
node -e "require('./migrations/015_cotizaciones').up().then(()=>process.exit(0)).catch(e=>{console.error(e);process.exit(1)})"
```

- [ ] **Step 2: Start server and verify page loads**

```bash
node server.js
```

Navigate to `http://localhost:3000/superadmin/cotizador` (login as superadmin first).

Expected: Page loads with form on left, preview on right, empty quotes table.

- [ ] **Step 3: Test creating a quote**

1. Fill in: nombre="Test Restaurant SAC", telefono="987654321", select plan "Anual"
2. Enable modules: Almacén, SUNAT, DalIA
3. Set usuarios=3, almacenamiento=20GB
4. Click "Guardar Cotización"

Expected: Alert with COT-XXXXXXXX-XXXX number. PDF and WhatsApp buttons become active. Quote appears in table below.

- [ ] **Step 4: Test PDF download**

Click "Descargar PDF". Expected: PDF opens with quote details matching the preview.

- [ ] **Step 5: Test WhatsApp send**

Click "Enviar por WhatsApp". Expected: PDF downloads + WhatsApp Web opens with pre-filled message.

- [ ] **Step 6: Verify sidebar link**

Check that "Cotizador" link appears in sidebar between "Contratos" and the rest of superadmin links, with calculator icon.

- [ ] **Step 7: Commit final**

```bash
git add -A
git commit -m "feat(cotizador): complete quote generator with PDF and WhatsApp integration"
```
