# Firma Electronica de Contratos - Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add e-signature flow so superadmin generates contracts, sends signing links via email/WhatsApp, and clients sign electronically with audit trail.

**Architecture:** Separate public route file (`routes/firmar.js`) for unauthenticated signing endpoints. Existing `routes/contratos.js` refactored to output PDF to buffer + store in PostgreSQL. `lib/mailer.js` wraps nodemailer for Gmail SMTP. `pdf-lib` embeds client signature PNG into the generated PDF.

**Tech Stack:** Node.js/Express, PDFKit (generation), pdf-lib (signature embedding), nodemailer (Gmail SMTP), signature_pad (CDN, client-side), PostgreSQL (BYTEA storage)

**Spec:** `docs/superpowers/specs/2026-03-20-firma-electronica-contratos-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `migrations/011_contratos.js` | CREATE | DB migration: contratos table + sequence |
| `lib/mailer.js` | CREATE | Nodemailer transporter config + sendContractEmail helper |
| `routes/firmar.js` | CREATE | Public routes: GET /firmar/:token, GET /firmar/:token/pdf, POST /firmar/:token/submit |
| `views/firmar.ejs` | CREATE | Public signing page: PDF viewer + signature_pad canvas |
| `routes/contratos.js` | MODIFY | Refactor POST /generar to buffer+BD, add /lista, /reenviar, /descargar |
| `views/contratos.ejs` | MODIFY | Add contracts table with status, copy-link, reenviar buttons |
| `server.js` | MODIFY | Mount /firmar public route with rate limiter, require firmarRoutes |

---

### Task 1: Install dependencies + run migration

**Files:**
- Modify: `package.json`
- Create: `migrations/011_contratos.js`

- [ ] **Step 1: Install npm packages**

Run: `cd "/Users/leonidasyauri/Sistema para gesionar restaurantes" && npm install pdf-lib nodemailer`

- [ ] **Step 2: Create migration file**

Create `migrations/011_contratos.js`:

```js
'use strict';
require('dotenv').config();
const { Client } = require('pg');

const client = new Client(
  process.env.DATABASE_URL
    ? { connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } }
    : {
        host: process.env.DB_HOST || 'localhost',
        port: Number(process.env.DB_PORT) || 5432,
        database: process.env.DB_DATABASE || 'postgres',
        user: process.env.DB_USER || 'postgres',
        password: process.env.DB_PASSWORD || '',
        ssl: { rejectUnauthorized: false },
      }
);

async function run(label, sql) {
  try {
    await client.query(sql);
    console.log(`  OK  ${label}`);
  } catch (err) {
    if (err.code === '42P07' || err.code === '42710' || err.message.includes('already exists')) {
      console.log(`  --  ${label} (already exists)`);
    } else {
      console.error(`  ERR ${label}: ${err.message}`);
      throw err;
    }
  }
}

async function main() {
  console.log('=== Migration 011: Contratos ===');
  await client.connect();

  await run('CREATE TABLE contratos', `
    CREATE TABLE contratos (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER NOT NULL DEFAULT 1,
      token UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
      nro_contrato VARCHAR(30) NOT NULL UNIQUE,
      nombre_cliente VARCHAR(200) NOT NULL,
      razon_social VARCHAR(200),
      dni VARCHAR(8) NOT NULL,
      ruc VARCHAR(11),
      email VARCHAR(200),
      telefono VARCHAR(20),
      direccion TEXT,
      nombre_establecimiento VARCHAR(200),
      nombre_representante VARCHAR(200),
      cargo_representante VARCHAR(100),
      dni_representante VARCHAR(8),
      pdf_original BYTEA NOT NULL,
      pdf_hash VARCHAR(64) NOT NULL,
      pdf_firmado BYTEA,
      firma_png BYTEA,
      estado VARCHAR(20) NOT NULL DEFAULT 'pendiente'
        CHECK (estado IN ('pendiente', 'firmado', 'expirado')),
      token_expires_at TIMESTAMP WITH TIME ZONE DEFAULT NOW() + INTERVAL '30 days',
      firmado_ip VARCHAR(45),
      firmado_user_agent TEXT,
      firmado_at TIMESTAMP WITH TIME ZONE,
      email_enviado_at TIMESTAMP WITH TIME ZONE,
      created_by INTEGER,
      created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    )
  `);

  await run('idx_contratos_token', `CREATE INDEX idx_contratos_token ON contratos(token)`);
  await run('idx_contratos_estado', `CREATE INDEX idx_contratos_estado ON contratos(estado)`);
  await run('idx_contratos_tenant', `CREATE INDEX idx_contratos_tenant ON contratos(tenant_id)`);
  await run('contratos_nro_seq', `CREATE SEQUENCE contratos_nro_seq START 1`);

  console.log('=== Migration 011 complete ===');
  await client.end();
}

main().catch(err => { console.error('FATAL:', err.message); process.exit(1); });
```

- [ ] **Step 3: Run migration**

Run: `cd "/Users/leonidasyauri/Sistema para gesionar restaurantes" && node migrations/011_contratos.js`
Expected: All OK or already exists messages.

- [ ] **Step 4: Commit**

```bash
git add package.json package-lock.json migrations/011_contratos.js
git commit -m "feat(contratos): add contratos table migration + install pdf-lib, nodemailer"
```

---

### Task 2: Create lib/mailer.js

**Files:**
- Create: `lib/mailer.js`

- [ ] **Step 1: Create mailer module**

Create `lib/mailer.js`:

```js
'use strict';
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: Number(process.env.SMTP_PORT) || 587,
    secure: false,
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
    },
});

/**
 * Send contract signing link to client
 */
async function sendSigningLink({ to, nombreCliente, nroContrato, link }) {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        console.warn('SMTP not configured — skipping email');
        return false;
    }
    try {
        await transporter.sendMail({
            from: process.env.SMTP_FROM || `"dignita.tech" <${process.env.SMTP_USER}>`,
            to,
            subject: `Contrato ${nroContrato} — MiRestconIA por dignita.tech`,
            html: `
                <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
                    <div style="background:linear-gradient(135deg,#FF6B35,#E55A2B);padding:24px;border-radius:12px 12px 0 0;text-align:center;">
                        <h1 style="color:#fff;margin:0;font-size:22px;">dignita.tech</h1>
                        <p style="color:rgba(255,255,255,0.9);margin:4px 0 0;">MiRestconIA — Sistema de Gestion para Restaurantes</p>
                    </div>
                    <div style="background:#fff;padding:28px;border:1px solid #eee;border-top:none;">
                        <p>Estimado(a) <strong>${nombreCliente}</strong>,</p>
                        <p>Le hacemos llegar el contrato <strong>${nroContrato}</strong> para su revision y firma electronica.</p>
                        <p>Para revisar y firmar el contrato, haga clic en el siguiente boton:</p>
                        <div style="text-align:center;margin:28px 0;">
                            <a href="${link}" style="background:#FF6B35;color:#fff;padding:14px 32px;border-radius:8px;text-decoration:none;font-weight:bold;font-size:16px;">
                                Revisar y Firmar Contrato
                            </a>
                        </div>
                        <p style="color:#666;font-size:13px;">Este enlace es valido por 30 dias. Si tiene alguna consulta, no dude en contactarnos.</p>
                        <hr style="border:none;border-top:1px solid #eee;margin:20px 0;">
                        <p style="color:#999;font-size:11px;text-align:center;">
                            dignita.tech — Lima, Peru<br>
                            Este correo fue enviado automaticamente. No responda a este mensaje.
                        </p>
                    </div>
                </div>
            `,
        });
        return true;
    } catch (err) {
        console.error('Email send error:', err.message);
        return false;
    }
}

/**
 * Send signed contract PDF to both parties
 */
async function sendSignedContract({ to, nombreCliente, nroContrato, pdfBuffer }) {
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        console.warn('SMTP not configured — skipping email');
        return false;
    }
    const recipients = [to, process.env.SMTP_USER].filter(Boolean);
    try {
        await transporter.sendMail({
            from: process.env.SMTP_FROM || `"dignita.tech" <${process.env.SMTP_USER}>`,
            to: recipients.join(','),
            subject: `Contrato ${nroContrato} FIRMADO — MiRestconIA`,
            html: `
                <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;">
                    <div style="background:linear-gradient(135deg,#22c55e,#16a34a);padding:24px;border-radius:12px 12px 0 0;text-align:center;">
                        <h1 style="color:#fff;margin:0;font-size:22px;">Contrato Firmado</h1>
                    </div>
                    <div style="background:#fff;padding:28px;border:1px solid #eee;border-top:none;">
                        <p>El contrato <strong>${nroContrato}</strong> ha sido firmado electronicamente por <strong>${nombreCliente}</strong>.</p>
                        <p>Adjuntamos el contrato firmado en formato PDF.</p>
                        <p style="color:#666;font-size:13px;">Este documento tiene validez legal bajo la Ley 27269 — Firma Electronica Simple (Peru).</p>
                        <hr style="border:none;border-top:1px solid #eee;margin:20px 0;">
                        <p style="color:#999;font-size:11px;text-align:center;">dignita.tech — Lima, Peru</p>
                    </div>
                </div>
            `,
            attachments: [{
                filename: `Contrato_${nroContrato}_FIRMADO.pdf`,
                content: pdfBuffer,
                contentType: 'application/pdf',
            }],
        });
        return true;
    } catch (err) {
        console.error('Signed email send error:', err.message);
        return false;
    }
}

module.exports = { sendSigningLink, sendSignedContract };
```

- [ ] **Step 2: Verify it loads**

Run: `cd "/Users/leonidasyauri/Sistema para gesionar restaurantes" && node -e "require('./lib/mailer'); console.log('OK')"`
Expected: `OK`

- [ ] **Step 3: Add SMTP vars to .env**

Append to `.env`:
```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=leonidas.yauri@dignita.tech
SMTP_PASS=
SMTP_FROM="dignita.tech <leonidas.yauri@dignita.tech>"
```

Note: `SMTP_PASS` must be filled with a Google App Password by the user.

- [ ] **Step 4: Commit**

```bash
git add lib/mailer.js
git commit -m "feat(contratos): add nodemailer config for contract emails"
```

---

### Task 3: Refactor routes/contratos.js — PDF to buffer + DB insert + API routes

**Files:**
- Modify: `routes/contratos.js`

This is the largest task. The existing POST `/generar` pipes PDF directly to response. It must be refactored to:
1. Collect PDF into a Buffer
2. Embed firma-dignita.png during PDFKit generation
3. Compute SHA-256 hash
4. INSERT into `contratos` table with RETURNING
5. Send email if client has one
6. Return JSON (not PDF)

Additionally, add three new routes: `/lista`, `/:id/reenviar`, `/:id/descargar/:tipo`.

- [ ] **Step 1: Add requires at top of routes/contratos.js**

Add after existing requires (line 3):

```js
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { sendSigningLink } = require('../lib/mailer');
```

- [ ] **Step 2: Refactor POST /generar to output buffer + save to DB**

Replace the existing `router.post('/generar', ...)` handler. The key changes:
- Instead of `doc.pipe(res)`, collect chunks into a buffer:
  ```js
  const chunks = [];
  doc.on('data', c => chunks.push(c));
  doc.on('end', async () => {
      const pdfBuffer = Buffer.concat(chunks);
      // ... save to DB, send email, respond JSON
  });
  ```
- Before the firma section, embed firma-dignita.png using PDFKit's `doc.image()`:
  ```js
  const firmaPath = path.join(__dirname, '..', 'public', 'uploads', 'firma-dignita.png');
  if (fs.existsSync(firmaPath)) {
      doc.image(firmaPath, ml + 40, firmaY - 60, { width: 130 });
  }
  ```
- In the `doc.on('end')` callback:
  ```js
  const pdfHash = crypto.createHash('sha256').update(pdfBuffer).digest('hex');
  const { rows } = await db.query(
      `INSERT INTO contratos (tenant_id, nro_contrato, nombre_cliente, razon_social, dni, ruc, email, telefono, direccion, nombre_establecimiento, nombre_representante, cargo_representante, dni_representante, pdf_original, pdf_hash, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
       RETURNING id, token, nro_contrato`,
      [req.tenantId || 1, nroContrato, nombre_cliente, razon_social || null, dni, ruc || null, email || null, telefono || null, direccion || null, nombre_establecimiento || null, nombre_representante || null, cargo_representante || null, dni_representante || null, pdfBuffer, pdfHash, req.session?.user?.id || null]
  );
  const contrato = rows[0];
  const baseUrl = `${req.protocol}://${req.get('host')}`;
  const link = `${baseUrl}/firmar/${contrato.token}`;

  let emailEnviado = false;
  if (email) {
      emailEnviado = await sendSigningLink({ to: email, nombreCliente: nombre_cliente, nroContrato: contrato.nro_contrato, link });
      if (emailEnviado) {
          await db.query('UPDATE contratos SET email_enviado_at = NOW() WHERE id = $1', [contrato.id]);
      }
  }

  res.json({ id: contrato.id, token: contrato.token, nro_contrato: contrato.nro_contrato, link, email_enviado: emailEnviado });
  ```
- Change `nroContrato` generation to use sequence:
  ```js
  const [[seqRow]] = await db.query("SELECT nextval('contratos_nro_seq') as seq");
  const nroContrato = `CTR-${hoy.getFullYear()}${String(hoy.getMonth()+1).padStart(2,'0')}${String(hoy.getDate()).padStart(2,'0')}-${String(seqRow.seq).padStart(4,'0')}`;
  ```

- [ ] **Step 3: Add GET /lista route**

After the `/generar` route, add:

```js
// GET /api/contratos/lista
router.get('/lista', async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT id, nro_contrato, nombre_cliente, razon_social, dni, ruc, email, estado,
                    token, firmado_at, email_enviado_at, created_at
             FROM contratos WHERE tenant_id = $1 ORDER BY created_at DESC`,
            [req.tenantId || 1]
        );
        res.json(rows);
    } catch (err) {
        console.error('Lista contratos error:', err.message);
        res.status(500).json({ error: 'Error al obtener contratos' });
    }
});
```

- [ ] **Step 4: Add POST /:id/reenviar route**

```js
// POST /api/contratos/:id/reenviar
router.post('/:id/reenviar', async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT id, token, nro_contrato, nombre_cliente, email, estado FROM contratos WHERE id = $1 AND tenant_id = $2',
            [req.params.id, req.tenantId || 1]
        );
        if (!rows.length) return res.status(404).json({ error: 'Contrato no encontrado' });
        const c = rows[0];
        if (!c.email) return res.status(400).json({ error: 'El cliente no tiene email registrado' });

        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const link = `${baseUrl}/firmar/${c.token}`;
        const ok = await sendSigningLink({ to: c.email, nombreCliente: c.nombre_cliente, nroContrato: c.nro_contrato, link });
        if (ok) await db.query('UPDATE contratos SET email_enviado_at = NOW() WHERE id = $1', [c.id]);
        res.json({ ok, message: ok ? 'Email reenviado' : 'Error al enviar email' });
    } catch (err) {
        console.error('Reenviar error:', err.message);
        res.status(500).json({ error: 'Error al reenviar' });
    }
});
```

- [ ] **Step 5: Add GET /:id/descargar/:tipo route**

```js
// GET /api/contratos/:id/descargar/:tipo (original|firmado)
router.get('/:id/descargar/:tipo', async (req, res) => {
    try {
        const col = req.params.tipo === 'firmado' ? 'pdf_firmado' : 'pdf_original';
        const [rows] = await db.query(
            `SELECT ${col}, nro_contrato, nombre_cliente FROM contratos WHERE id = $1 AND tenant_id = $2`,
            [req.params.id, req.tenantId || 1]
        );
        if (!rows.length || !rows[0][col]) return res.status(404).json({ error: 'PDF no encontrado' });
        const c = rows[0];
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Contrato_${c.nro_contrato}_${req.params.tipo}.pdf"`);
        res.send(c[col]);
    } catch (err) {
        console.error('Descargar error:', err.message);
        res.status(500).json({ error: 'Error al descargar' });
    }
});
```

- [ ] **Step 6: Verify route loads**

Run: `cd "/Users/leonidasyauri/Sistema para gesionar restaurantes" && node -e "require('./routes/contratos'); console.log('OK')"`

- [ ] **Step 7: Commit**

```bash
git add routes/contratos.js
git commit -m "feat(contratos): refactor to buffer+DB storage, add lista/reenviar/descargar routes"
```

---

### Task 4: Create routes/firmar.js — public signing routes

**Files:**
- Create: `routes/firmar.js`

- [ ] **Step 1: Create routes/firmar.js**

```js
'use strict';
const express = require('express');
const router = express.Router();
const crypto = require('crypto');
const { PDFDocument } = require('pdf-lib');
const db = require('../db');
const { sendSignedContract } = require('../lib/mailer');
const rateLimit = require('express-rate-limit');

const submitLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: 5,
    message: { error: 'Demasiados intentos. Intenta en 15 minutos.' }
});

// Helper: find valid contract by token
async function findPendingContract(token) {
    const [rows] = await db.query(
        `SELECT * FROM contratos WHERE token = $1 AND estado = 'pendiente' AND token_expires_at > NOW()`,
        [token]
    );
    return rows.length ? rows[0] : null;
}

// GET /firmar/:token — public signing page
router.get('/:token', async (req, res) => {
    try {
        const contrato = await findPendingContract(req.params.token);
        if (!contrato) return res.status(404).render('firmar', { contrato: null, error: 'Este contrato no existe, ya fue firmado o el enlace ha expirado.' });
        res.render('firmar', { contrato, error: null });
    } catch (err) {
        console.error('Firmar GET error:', err.message);
        res.status(500).render('firmar', { contrato: null, error: 'Error interno del servidor.' });
    }
});

// GET /firmar/:token/pdf — serve PDF for iframe
router.get('/:token/pdf', async (req, res) => {
    try {
        const contrato = await findPendingContract(req.params.token);
        if (!contrato) return res.status(404).send('No encontrado');
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', 'inline');
        res.send(contrato.pdf_original);
    } catch (err) {
        console.error('PDF serve error:', err.message);
        res.status(500).send('Error');
    }
});

// POST /firmar/:token/submit — process client signature
router.post('/:token/submit', submitLimiter, async (req, res) => {
    try {
        const { signature } = req.body;

        // Validate signature payload
        if (!signature || !signature.startsWith('data:image/png;base64,')) {
            return res.status(400).json({ error: 'Firma invalida' });
        }
        const base64Data = signature.replace(/^data:image\/png;base64,/, '');
        const signatureBuffer = Buffer.from(base64Data, 'base64');
        if (signatureBuffer.length > 500 * 1024) {
            return res.status(400).json({ error: 'La firma es demasiado grande' });
        }

        // Find contract
        const contrato = await findPendingContract(req.params.token);
        if (!contrato) {
            return res.status(404).json({ error: 'Contrato no encontrado, ya firmado o expirado' });
        }

        // Verify PDF integrity
        const currentHash = crypto.createHash('sha256').update(contrato.pdf_original).digest('hex');
        if (currentHash !== contrato.pdf_hash) {
            return res.status(500).json({ error: 'Error de integridad del documento' });
        }

        // Embed signature into PDF using pdf-lib
        const pdfDoc = await PDFDocument.load(contrato.pdf_original);
        const pages = pdfDoc.getPages();
        const lastPage = pages[pages.length - 1];
        const { width } = lastPage.getSize();

        // Embed client signature PNG on the right side (client section)
        const sigImage = await pdfDoc.embedPng(signatureBuffer);
        const sigDims = sigImage.scale(0.35);
        // Position: right half of the page, above the signature line area
        const sigX = width / 2 + 30;
        const sigY = 120;
        lastPage.drawImage(sigImage, {
            x: sigX,
            y: sigY,
            width: Math.min(sigDims.width, 150),
            height: Math.min(sigDims.height, 60),
        });

        // Add audit text
        const { rgb } = require('pdf-lib');
        const ahora = new Date();
        const fechaFirma = ahora.toLocaleString('es-PE', { timeZone: 'America/Lima' });
        const auditText = `Firmado electronicamente el ${fechaFirma} — IP: ${req.ip}`;
        lastPage.drawText(auditText, {
            x: width / 2 + 10,
            y: sigY - 10,
            size: 6,
            color: rgb(0.5, 0.5, 0.5),
        });

        // Legal acceptance text at bottom
        lastPage.drawText(
            'El firmante declara haber leido y aceptado todos los terminos del Contrato de Licencia de Software y Servicios Tecnologicos.',
            { x: 55, y: 30, size: 6, color: rgb(0.5, 0.5, 0.5) }
        );

        const signedPdfBytes = await pdfDoc.save();
        const signedPdfBuffer = Buffer.from(signedPdfBytes);

        // Update DB
        await db.query(
            `UPDATE contratos SET
                pdf_firmado = $1, firma_png = $2, estado = 'firmado',
                firmado_ip = $3, firmado_user_agent = $4, firmado_at = NOW()
             WHERE id = $5`,
            [signedPdfBuffer, signatureBuffer, req.ip, req.headers['user-agent'], contrato.id]
        );

        // Send signed PDF by email (non-blocking — don't fail if email fails)
        if (contrato.email) {
            const emailOk = await sendSignedContract({
                to: contrato.email,
                nombreCliente: contrato.nombre_cliente,
                nroContrato: contrato.nro_contrato,
                pdfBuffer: signedPdfBuffer,
            });
            if (emailOk) {
                await db.query('UPDATE contratos SET email_enviado_at = NOW() WHERE id = $1', [contrato.id]);
            }
        }

        res.json({ ok: true, message: 'Contrato firmado exitosamente' });
    } catch (err) {
        console.error('Firma submit error:', err.message);
        res.status(500).json({ error: 'Error al procesar la firma' });
    }
});

module.exports = router;
```

- [ ] **Step 2: Verify it loads**

Run: `cd "/Users/leonidasyauri/Sistema para gesionar restaurantes" && node -e "require('./routes/firmar'); console.log('OK')"`

- [ ] **Step 3: Commit**

```bash
git add routes/firmar.js
git commit -m "feat(contratos): add public signing routes (firmar.js)"
```

---

### Task 5: Create views/firmar.ejs — public signing page

**Files:**
- Create: `views/firmar.ejs`

- [ ] **Step 1: Create the view**

Create `views/firmar.ejs` — a public page (no sidebar) with:
- Brand header (dignita.tech logo, orange gradient)
- If `error`: show error card with message
- If `contrato`: show contract info (nro, client name, date), iframe with PDF, signature_pad canvas, clear button, submit button, legal text
- Success state after signing (green card with confirmation)
- Mobile responsive
- CDN: `https://cdn.jsdelivr.net/npm/signature_pad@4/dist/signature_pad.umd.min.js`
- JS: on submit, POST to `/firmar/<%= contrato.token %>/submit` with `{ signature: signaturePad.toDataURL() }`

Key layout:
```
┌──────────────────────────────┐
│  dignita.tech header (orange)│
├──────────────────────────────┤
│  Contrato CTR-XXX            │
│  Cliente: Nombre             │
├──────────────────────────────┤
│  ┌──────────────────────┐    │
│  │   PDF iframe          │    │
│  │   (scrollable)        │    │
│  └──────────────────────┘    │
├──────────────────────────────┤
│  Su firma:                   │
│  ┌──────────────────────┐    │
│  │   signature_pad       │    │
│  │   canvas              │    │
│  └──────────────────────┘    │
│  [Limpiar]                   │
│  ☑ Al firmar, declaro...     │
│  [Aceptar y Firmar Contrato] │
└──────────────────────────────┘
```

- [ ] **Step 2: Commit**

```bash
git add views/firmar.ejs
git commit -m "feat(contratos): add public signing view (firmar.ejs)"
```

---

### Task 6: Mount public /firmar route in server.js

**Files:**
- Modify: `server.js`

- [ ] **Step 1: Add require for firmarRoutes**

At `server.js:221` (after `const contratosRoutes`), add:

```js
const firmarRoutes   = require('./routes/firmar');
```

- [ ] **Step 2: Mount public route with rate limiter**

At `server.js:254` (in the public routes section, after pagos), add:

```js
// Firma electronica de contratos (public - no auth, rate limited)
const firmaLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 15, message: { error: 'Demasiados intentos.' } });
app.use('/firmar', firmaLimiter, firmarRoutes);
```

- [ ] **Step 3: Verify server starts**

Run: `cd "/Users/leonidasyauri/Sistema para gesionar restaurantes" && node -e "require('./server')" &` then kill after 3 seconds.
Or just: `node -e "require('./routes/firmar'); require('./routes/contratos'); console.log('OK')"`

- [ ] **Step 4: Commit**

```bash
git add server.js
git commit -m "feat(contratos): mount public /firmar route with rate limiter"
```

---

### Task 7: Update views/contratos.ejs — add contracts table + actions

**Files:**
- Modify: `views/contratos.ejs`

- [ ] **Step 1: Update the view**

After the existing form, add a section below with:
- "Contratos Enviados" header
- Table loaded via `fetch('/api/contratos/lista')` on page load
- Columns: Nro | Cliente | Email | Estado (badge) | Fecha | Acciones
- Estado badges: `pendiente` (yellow), `firmado` (green), `expirado` (red)
- Action buttons per row:
  - Copy link (copies `/firmar/:token` to clipboard)
  - Reenviar email (POST to `/api/contratos/:id/reenviar`)
  - Descargar original (link to `/api/contratos/:id/descargar/original`)
  - Descargar firmado (link to `/api/contratos/:id/descargar/firmado`, only if estado == firmado)
- Update the form to submit via fetch (not form POST) and show result (link, copy button) after generation
- SweetAlert2 for success/error feedback

- [ ] **Step 2: Commit**

```bash
git add views/contratos.ejs
git commit -m "feat(contratos): add contracts table with status, copy-link, reenviar actions"
```

---

### Task 8: Push + add SMTP env vars reminder

- [ ] **Step 1: Push all commits**

```bash
git push
```

- [ ] **Step 2: Remind user about Gmail App Password**

The user needs to generate a Google App Password:
1. Go to https://myaccount.google.com/apppasswords
2. Select "Mail" and generate a password
3. Copy the 16-character password
4. Set `SMTP_PASS=xxxx-xxxx-xxxx-xxxx` in `.env`

Without this, email sending will be silently skipped (contracts still work, just no email).
