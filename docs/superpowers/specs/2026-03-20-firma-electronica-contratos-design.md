# Firma Electr&oacute;nica de Contratos Enterprise - Spec

**Fecha:** 2026-03-20
**Estado:** Aprobado
**Autor:** Leonidas Yauricasa / Claude

---

## Resumen

Flujo completo de firma electr&oacute;nica integrado en MiRestconIA. El superadmin genera un contrato Enterprise, el sistema lo guarda en BD, genera un link &uacute;nico p&uacute;blico y lo env&iacute;a por email (Gmail SMTP) al cliente. El cliente abre el link sin necesidad de login, revisa el contrato PDF, firma con signature_pad en un canvas, y el sistema incrusta la firma en el PDF, guarda el audit trail y env&iacute;a el PDF firmado a ambas partes.

Legalmente v&aacute;lido en Per&uacute; bajo Firma Electr&oacute;nica Simple (Ley 27269).

---

## Decisiones de dise&ntilde;o

| Decisi&oacute;n | Elecci&oacute;n | Motivo |
|----------|-----------|--------|
| Almacenamiento | PostgreSQL (BYTEA) | Sin dependencia de filesystem, respaldable con BD |
| Email | Nodemailer + Gmail SMTP (Google Workspace) | leonidas.yauri@dignita.tech ya existe |
| Firma dignita.tech | Pre-cargada como PNG (`public/uploads/firma-dignita.png`) | Ya proporcionada por el usuario |
| Firma del cliente | Solo el cliente firma | Firma de dignita.tech ya incrustada |
| Link de firma | UUID v4 sin autenticaci&oacute;n | Ruta p&uacute;blica `/firmar/:token` |
| Validez legal | Firma Electr&oacute;nica Simple (FES) | Suficiente para contratos B2B privados en Per&uacute; |
| PDF manipulation | pdf-lib | Para incrustar firma PNG en PDF existente post-generaci&oacute;n |

---

## Tabla `contratos` (PostgreSQL)

```sql
CREATE TABLE contratos (
    id SERIAL PRIMARY KEY,
    token UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
    nro_contrato VARCHAR(30) NOT NULL,
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
    pdf_firmado BYTEA,
    firma_png BYTEA,
    estado VARCHAR(20) NOT NULL DEFAULT 'pendiente'
        CHECK (estado IN ('pendiente', 'firmado', 'expirado')),
    firmado_ip VARCHAR(45),
    firmado_user_agent TEXT,
    firmado_at TIMESTAMP WITH TIME ZONE,
    created_by INTEGER,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX idx_contratos_token ON contratos(token);
CREATE INDEX idx_contratos_estado ON contratos(estado);
```

---

## Flujo completo

### 1. Superadmin genera contrato

**Ruta:** POST `/api/contratos/generar`
**Auth:** requireAuth + requireRole('superadmin')

1. Recibe datos del formulario (nombre, DNI, RUC, email, etc.)
2. Genera PDF con PDFKit (contrato Enterprise completo + firma dignita.tech pre-cargada + secci&oacute;n de costos de terceros SUNAT/WhatsApp)
3. Captura el PDF como Buffer
4. Genera UUID token
5. Genera nro_contrato: `CTR-YYYYMMDD-XXXX`
6. Inserta registro en tabla `contratos` con pdf_original, estado='pendiente'
7. Si el cliente tiene email: env&iacute;a correo con link `/firmar/:token`
8. Responde con JSON: `{ token, link, nro_contrato, email_enviado: true/false }`

### 2. Superadmin copia link

**Vista:** `/contratos` actualizada con:
- Formulario de generaci&oacute;n (ya existe)
- Tabla de contratos enviados con columnas: Nro, Cliente, Estado, Fecha, Acciones
- Bot&oacute;n "Copiar link" para enviar por WhatsApp
- Bot&oacute;n "Reenviar email"
- Bot&oacute;n "Descargar PDF" (original o firmado)

### 3. Cliente abre link p&uacute;blico

**Ruta:** GET `/firmar/:token`
**Auth:** NINGUNA (ruta p&uacute;blica)

1. Busca contrato por token en BD
2. Si no existe o estado != 'pendiente': muestra p&aacute;gina de error/expirado
3. Si existe: renderiza `views/firmar.ejs`

### 4. Vista de firma (`views/firmar.ejs`)

P&aacute;gina p&uacute;blica sin sidebar, con branding dignita.tech:
- Header con logo y datos del contrato (Nro, cliente, fecha)
- PDF embebido en iframe (servido desde `/firmar/:token/pdf`)
- Canvas de signature_pad para dibujar firma
- Bot&oacute;n "Limpiar firma"
- Bot&oacute;n "Aceptar y Firmar Contrato"
- Texto legal: "Al firmar, declaro haber le&iacute;do y aceptado todos los t&eacute;rminos..."
- Responsive (funciona en m&oacute;vil)

### 5. Cliente firma

**Ruta:** POST `/firmar/:token/submit`
**Auth:** NINGUNA (ruta p&uacute;blica)

1. Recibe `{ signature: dataURL (base64 PNG) }`
2. Valida que contrato existe y estado == 'pendiente'
3. Carga pdf_original desde BD
4. Usa pdf-lib para:
   - Cargar el PDF
   - Incrustar firma PNG del cliente en la secci&oacute;n de firmas (lado derecho "POR EL CLIENTE")
   - A&ntilde;adir texto: "Firmado electr&oacute;nicamente el DD/MM/YYYY HH:MM - IP: X.X.X.X"
5. Guarda en BD:
   - pdf_firmado = PDF con firma incrustada
   - firma_png = imagen de la firma
   - estado = 'firmado'
   - firmado_ip = req.ip
   - firmado_user_agent = req.headers['user-agent']
   - firmado_at = NOW()
6. Env&iacute;a PDF firmado por email a:
   - Cliente (si tiene email)
   - leonidas.yauri@dignita.tech (copia para dignita.tech)
7. Renderiza p&aacute;gina de confirmaci&oacute;n

### 6. Ruta para servir PDF

**Ruta:** GET `/firmar/:token/pdf`
**Auth:** NINGUNA

Sirve el pdf_original como inline PDF para el iframe de la vista de firma.

---

## Rutas nuevas (resumen)

| M&eacute;todo | Ruta | Auth | Descripci&oacute;n |
|--------|------|------|-------------|
| POST | `/api/contratos/generar` | superadmin | Genera contrato, guarda en BD, env&iacute;a email |
| GET | `/api/contratos/lista` | superadmin | Lista contratos con estado |
| POST | `/api/contratos/:id/reenviar` | superadmin | Reenv&iacute;a email al cliente |
| GET | `/api/contratos/:id/descargar/:tipo` | superadmin | Descarga PDF original o firmado |
| GET | `/firmar/:token` | P&Uacute;BLICA | Vista de firma para el cliente |
| GET | `/firmar/:token/pdf` | P&Uacute;BLICA | Sirve PDF para iframe |
| POST | `/firmar/:token/submit` | P&Uacute;BLICA | Procesa firma del cliente |

---

## Dependencias nuevas (npm)

| Paquete | Versi&oacute;n | Uso |
|---------|---------|-----|
| `pdf-lib` | ^1.17.1 | Incrustar firma PNG en PDF existente |
| `nodemailer` | ^6.9.x | Enviar emails via Gmail SMTP |
| `uuid` | ^9.0.x | Generar tokens &uacute;nicos para links |

**Frontend (CDN):**
- `signature_pad` v4 via CDN en `firmar.ejs`

---

## Configuraci&oacute;n SMTP (.env)

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=leonidas.yauri@dignita.tech
SMTP_PASS=xxxx-xxxx-xxxx-xxxx  # Contrase&ntilde;a de aplicaci&oacute;n Google
SMTP_FROM="dignita.tech <leonidas.yauri@dignita.tech>"
```

---

## Audit trail (validez legal Per&uacute;)

Cada firma registra:
- **IP** del firmante
- **Timestamp** (servidor, UTC)
- **User-Agent** (navegador)
- **Token UUID** que fue enviado al email del cliente (prueba de identidad)
- **firma_png** (imagen de la firma)
- **Hash impl&iacute;cito**: el PDF firmado en BYTEA es la evidencia

Esto cumple con los requisitos de Firma Electr&oacute;nica Simple (FES) bajo la Ley 27269 del Per&uacute;, suficiente para contratos entre partes privadas.

---

## Archivos a crear/modificar

| Archivo | Acci&oacute;n |
|---------|--------|
| `migrations/011_contratos.js` | CREATE TABLE contratos |
| `routes/contratos.js` | Extender con rutas de firma, lista, reenv&iacute;o |
| `views/contratos.ejs` | Agregar tabla de contratos enviados |
| `views/firmar.ejs` | NUEVA - vista p&uacute;blica de firma |
| `server.js` | Agregar rutas p&uacute;blicas `/firmar` |
| `lib/mailer.js` | NUEVO - configuraci&oacute;n nodemailer |
| `public/uploads/firma-dignita.png` | Ya copiada |
| `.env` | Agregar variables SMTP |

---

## Fuera de alcance

- Firma criptogr&aacute;fica PKCS7 (no necesaria para FES)
- Expiraci&oacute;n autom&aacute;tica de contratos (se puede agregar despu&eacute;s)
- M&uacute;ltiples firmantes
- Historial de versiones del contrato
