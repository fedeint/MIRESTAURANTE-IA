# Firma Electronica de Contratos Enterprise - Spec

**Fecha:** 2026-03-20
**Estado:** Aprobado (rev. 2)
**Autor:** Leonidas Yauricasa / Claude

---

## Resumen

Flujo completo de firma electronica integrado en MiRestconIA. El superadmin genera un contrato Enterprise, el sistema lo guarda en BD, genera un link unico publico y lo envia por email (Gmail SMTP) al cliente. El cliente abre el link sin necesidad de login, revisa el contrato PDF, firma con signature_pad en un canvas, y el sistema incrusta la firma en el PDF, guarda el audit trail y envia el PDF firmado a ambas partes.

Legalmente valido en Peru bajo Firma Electronica Simple (Ley 27269).

---

## Decisiones de diseno

| Decision | Eleccion | Motivo |
|----------|-----------|--------|
| Almacenamiento | PostgreSQL (BYTEA) | Sin dependencia de filesystem, respaldable con BD |
| Email | Nodemailer + Gmail SMTP (Google Workspace) | leonidas.yauri@dignita.tech ya existe |
| Firma dignita.tech | Pre-cargada como PNG (`public/uploads/firma-dignita.png`) | Incrustada durante generacion PDFKit |
| Firma del cliente | Solo el cliente firma | Firma de dignita.tech ya incrustada en el PDF |
| Link de firma | UUID v4 (gen_random_uuid de PostgreSQL) | Ruta publica `/firmar/:token` |
| Validez legal | Firma Electronica Simple (FES) | Suficiente para contratos B2B privados en Peru |
| PDF manipulation | pdf-lib | Para incrustar firma PNG del cliente en PDF post-generacion |
| Rutas publicas | Archivo separado `routes/firmar.js` | Evita herencia de middleware superadmin |

---

## Tabla `contratos` (PostgreSQL)

```sql
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
);

CREATE INDEX idx_contratos_token ON contratos(token);
CREATE INDEX idx_contratos_estado ON contratos(estado);
CREATE INDEX idx_contratos_tenant ON contratos(tenant_id);

CREATE SEQUENCE contratos_nro_seq START 1;
```

Cambios vs. rev. 1:
- Agregado `tenant_id` (multi-tenant)
- Agregado `pdf_hash` VARCHAR(64) — SHA-256 del PDF original para integridad
- Agregado `token_expires_at` — expiracion a 30 dias
- Agregado `email_enviado_at` — tracking de envio
- `nro_contrato` ahora es UNIQUE + generado con sequence (sin colisiones)
- Token generado por PostgreSQL (gen_random_uuid), no npm uuid

---

## Arquitectura de rutas

**CRITICO:** Las rutas publicas de firma van en un archivo separado `routes/firmar.js`, montado SIN middleware de auth en `server.js`. Esto evita heredar `requireAuth + requireRole('superadmin')` del mount de contratos.

```
server.js:
  app.use('/firmar', firmaLimiter, firmarRoutes);           // PUBLICA
  app.use('/contratos', requireAuth, requireRole('superadmin'), contratosRoutes);  // PROTEGIDA
  app.use('/api/contratos', requireAuth, requireRole('superadmin'), contratosRoutes);
```

---

## Seguridad

### Rate limiting (rutas publicas)

```js
const firmaLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,   // 15 minutos
    max: 15,                     // 15 requests por IP
    message: { error: 'Demasiados intentos. Intenta en 15 minutos.' }
});
```

Adicionalmente, el POST `/firmar/:token/submit` tendra un limiter mas estricto (max: 5 por 15 min).

### Validacion de payload

El POST submit valida:
- signature base64 tiene prefijo `data:image/png;base64,`
- Tamano maximo de firma: 500KB
- Contrato existe, estado == 'pendiente', token_expires_at > NOW()

### Integridad del documento

- `pdf_hash` = SHA-256 del pdf_original, calculado al generar
- El hash se verifica antes de incrustar la firma del cliente
- El texto legal aceptado por el cliente se incrusta en el PDF firmado

---

## Flujo completo

### 1. Superadmin genera contrato

**Ruta:** POST `/api/contratos/generar` (routes/contratos.js)
**Auth:** requireAuth + requireRole('superadmin')

1. Recibe datos del formulario (nombre, DNI, RUC, email, etc.)
2. Genera PDF con PDFKit a un Buffer (NO pipe a res):
   - Contrato Enterprise completo
   - Firma dignita.tech pre-cargada (firma-dignita.png incrustada con PDFKit)
   - Seccion de costos de terceros SUNAT/WhatsApp
3. Calcula SHA-256 del buffer PDF
4. Genera nro_contrato con sequence: `CTR-YYYYMMDD-{nextval}`
5. INSERT en tabla `contratos` con RETURNING id, token, nro_contrato
6. Si el cliente tiene email: envia correo con link `/firmar/:token`
7. Responde con JSON: `{ id, token, link, nro_contrato, email_enviado: true/false }`

**Cambio vs. comportamiento actual:** La ruta actual retorna descarga de PDF. La nueva retorna JSON. Se mantiene una ruta GET `/api/contratos/:id/descargar/original` para descargar el PDF.

### 2. Superadmin copia link

**Vista:** `/contratos` actualizada con:
- Formulario de generacion (ya existe)
- Tabla de contratos enviados con columnas: Nro, Cliente, Estado, Fecha, Acciones
- Boton "Copiar link" para enviar por WhatsApp
- Boton "Reenviar email"
- Boton "Descargar PDF" (original o firmado)

### 3. Cliente abre link publico

**Ruta:** GET `/firmar/:token` (routes/firmar.js)
**Auth:** NINGUNA (ruta publica, rate limited)

1. Busca contrato por token en BD
2. Valida: existe, estado == 'pendiente', token_expires_at > NOW()
3. Si no valido: muestra pagina de error/expirado
4. Si valido: renderiza `views/firmar.ejs`

### 4. Vista de firma (`views/firmar.ejs`)

Pagina publica sin sidebar, con branding dignita.tech:
- Header con logo y datos del contrato (Nro, cliente, fecha)
- PDF embebido en iframe (servido desde `/firmar/:token/pdf`)
- Canvas de signature_pad para dibujar firma
- Boton "Limpiar firma"
- Boton "Aceptar y Firmar Contrato"
- Texto legal: "Al firmar, declaro haber leido y aceptado todos los terminos del presente Contrato de Licencia de Software y Servicios Tecnologicos..."
- Responsive (funciona en movil)

### 5. Cliente firma

**Ruta:** POST `/firmar/:token/submit` (routes/firmar.js)
**Auth:** NINGUNA (rate limited, max 5 por 15 min)

1. Recibe `{ signature: dataURL (base64 PNG) }`
2. Valida:
   - Prefijo `data:image/png;base64,`
   - Tamano < 500KB
   - Contrato existe, estado == 'pendiente', token_expires_at > NOW()
3. Verifica pdf_hash contra SHA-256 del pdf_original (integridad)
4. Usa pdf-lib para:
   - Cargar el PDF original
   - Incrustar firma PNG del cliente en la seccion de firmas (lado derecho "POR EL CLIENTE")
   - Anadir texto: "Firmado electronicamente el DD/MM/YYYY HH:MM - IP: X.X.X.X"
   - Incrustar texto legal aceptado
5. Guarda en BD:
   - pdf_firmado = PDF con firma incrustada
   - firma_png = imagen de la firma
   - estado = 'firmado'
   - firmado_ip = req.ip
   - firmado_user_agent = req.headers['user-agent']
   - firmado_at = NOW()
6. Envia PDF firmado por email a:
   - Cliente (si tiene email)
   - leonidas.yauri@dignita.tech (copia para dignita.tech)
7. Renderiza pagina de confirmacion

Email send puede fallar — el contrato se marca como firmado independientemente. Se registra email_enviado_at solo si el envio fue exitoso.

### 6. Ruta para servir PDF

**Ruta:** GET `/firmar/:token/pdf` (routes/firmar.js)
**Auth:** NINGUNA (rate limited)

Sirve el pdf_original como inline PDF para el iframe de la vista de firma.

---

## Rutas (resumen final)

### routes/contratos.js (PROTEGIDAS — superadmin)

| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| GET | `/contratos` | Vista con formulario + tabla de contratos |
| POST | `/api/contratos/generar` | Genera contrato, guarda en BD, envia email, retorna JSON |
| GET | `/api/contratos/lista` | Lista contratos con estado (para tabla) |
| POST | `/api/contratos/:id/reenviar` | Reenvia email al cliente |
| GET | `/api/contratos/:id/descargar/:tipo` | Descarga PDF original o firmado |

### routes/firmar.js (PUBLICAS — rate limited)

| Metodo | Ruta | Descripcion |
|--------|------|-------------|
| GET | `/firmar/:token` | Vista de firma para el cliente |
| GET | `/firmar/:token/pdf` | Sirve PDF para iframe |
| POST | `/firmar/:token/submit` | Procesa firma del cliente |

---

## Dependencias nuevas (npm)

| Paquete | Uso |
|---------|-----|
| `pdf-lib` | Incrustar firma PNG del cliente en PDF existente |
| `nodemailer` | Enviar emails via Gmail SMTP |

**Eliminado:** `uuid` — usamos gen_random_uuid() de PostgreSQL.

**Frontend (CDN):**
- `signature_pad` v4 via CDN en `firmar.ejs`

---

## Configuracion SMTP (.env)

```
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=leonidas.yauri@dignita.tech
SMTP_PASS=xxxx-xxxx-xxxx-xxxx
SMTP_FROM="dignita.tech <leonidas.yauri@dignita.tech>"
```

---

## Audit trail (validez legal Peru)

Cada firma registra:
- **IP** del firmante (req.ip)
- **Timestamp** (servidor, UTC, guardado en firmado_at)
- **User-Agent** (navegador del firmante)
- **Token UUID** enviado al email del cliente (prueba de identidad)
- **firma_png** (imagen de la firma)
- **pdf_hash** (SHA-256 del PDF original — prueba de integridad)
- **Texto legal** incrustado en el PDF firmado (lo que el cliente acepto)

Cumple requisitos de Firma Electronica Simple (FES) bajo Ley 27269.

---

## Archivos a crear/modificar

| Archivo | Accion |
|---------|--------|
| `migrations/011_contratos.js` | CREATE TABLE + sequence |
| `routes/contratos.js` | Refactorizar: PDF a buffer, guardar en BD, retornar JSON, lista, reenvio, descarga |
| `routes/firmar.js` | NUEVO — rutas publicas de firma |
| `views/contratos.ejs` | Actualizar: resultado JSON + tabla de contratos enviados |
| `views/firmar.ejs` | NUEVA — vista publica de firma |
| `server.js` | Montar `/firmar` como ruta publica con rate limiter |
| `lib/mailer.js` | NUEVO — configuracion nodemailer |
| `public/uploads/firma-dignita.png` | Ya copiada |
| `.env` | Agregar variables SMTP |

---

## Fuera de alcance

- Firma criptografica PKCS7 (no necesaria para FES)
- Multiples firmantes
- Historial de versiones del contrato
