# Cotizador Superadmin — Spec de Diseño

**Fecha:** 2026-03-27
**Autor:** Superadmin
**Estado:** Aprobado

## Resumen

Generador de cotizaciones personalizable en el panel superadmin. Permite armar paquetes a medida (plan base + módulos + usuarios + almacenamiento), generar un PDF profesional, y enviarlo por WhatsApp Web al cliente. La tabla de cotizaciones queda como base para el futuro CRM.

## Alcance

- Solo superadmin (no público)
- Cotización personalizable con precios predefinidos + override
- PDF generado con PDFKit
- Envío vía WhatsApp Web (wa.me con mensaje prellenado + descarga PDF manual)
- Tabla de cotizaciones con estados para futura integración con CRM

## Base de datos

### Tabla `cotizaciones`

```sql
CREATE TABLE cotizaciones (
  id SERIAL PRIMARY KEY,
  nro_cotizacion VARCHAR(30) UNIQUE NOT NULL,        -- COT-YYYYMMDD-####
  nombre_cliente VARCHAR(200) NOT NULL,
  ruc_dni VARCHAR(20),
  telefono VARCHAR(20),                               -- Número WhatsApp
  email VARCHAR(150),
  nombre_restaurante VARCHAR(200),
  plan_base VARCHAR(30) NOT NULL,                     -- gratis/mensual/anual/2anos/vida
  plan_precio DECIMAL(10,2) NOT NULL DEFAULT 0,       -- Precio base (editable)
  modulos JSON NOT NULL DEFAULT '[]',                 -- [{key, label, precio, incluido}]
  usuarios_qty INT NOT NULL DEFAULT 1,
  usuario_precio_unit DECIMAL(10,2) NOT NULL DEFAULT 0,
  almacenamiento_gb INT NOT NULL DEFAULT 10,
  almacenamiento_precio_gb DECIMAL(10,2) NOT NULL DEFAULT 0,
  descuento DECIMAL(10,2) NOT NULL DEFAULT 0,
  nota TEXT,
  subtotal DECIMAL(10,2) NOT NULL DEFAULT 0,
  total DECIMAL(10,2) NOT NULL DEFAULT 0,
  moneda VARCHAR(5) NOT NULL DEFAULT 'PEN',
  estado VARCHAR(20) NOT NULL DEFAULT 'pendiente',    -- pendiente, enviada, aceptada, rechazada, expirada
  valida_hasta DATE,                                  -- Default: created_at + 15 días
  pdf BYTEA,
  created_by INT REFERENCES usuarios(id),
  created_at TIMESTAMP DEFAULT NOW()
);
```

## Planes base

| Plan | ID | Precio (PEN) |
|------|----|-------------|
| Prueba Gratis | gratis | 0 |
| Mensual | mensual | 150 |
| Anual | anual | 1,500 |
| 2 Años | 2anos | 2,500 |
| De Por Vida | vida | 3,200 |

Precios editables al momento de cotizar.

## Módulos cotizables

Cada módulo tiene un precio sugerido que el superadmin puede modificar por cotización.

| # | Módulo | Key | Precio sugerido |
|---|--------|-----|----------------|
| 1 | Mesas y Pedidos | mesas | S/ 0 (incluido) |
| 2 | Cocina | cocina | S/ 0 (incluido) |
| 3 | Almacén / Inventario | almacen | S/ 30 |
| 4 | SUNAT / Facturación electrónica | sunat | S/ 50 |
| 5 | Delivery | delivery | S/ 30 |
| 6 | Reservas | reservas | S/ 20 |
| 7 | Facturación rápida | facturacion | S/ 0 (incluido) |
| 8 | Caja y Turnos | caja | S/ 0 (incluido) |
| 9 | Reportes y Analítica | reportes | S/ 20 |
| 10 | Chat IA (DalIA) | chat_ia | S/ 40 |
| 11 | Recetas | recetas | S/ 25 |
| 12 | Promociones | promociones | S/ 20 |

## Extras

- **Usuarios**: cantidad × precio unitario (sugerido S/ 10/usuario extra)
- **Almacenamiento**: GB × precio por GB (sugerido S/ 5/GB extra)

Ambos editables por cotización.

## Interfaz

### Ruta

- Vista: `GET /superadmin/cotizador`
- API: `POST /api/superadmin/cotizaciones` (crear)
- API: `GET /api/superadmin/cotizaciones` (listar)
- API: `GET /api/superadmin/cotizaciones/:id/pdf` (descargar PDF)
- API: `PUT /api/superadmin/cotizaciones/:id/estado` (cambiar estado)

### Layout (2 columnas, estética dark superadmin)

**Columna izquierda — Formulario:**

1. **Datos del cliente**
   - Nombre o razón social (required)
   - RUC / DNI
   - Teléfono WhatsApp (required para envío)
   - Email
   - Nombre del restaurante

2. **Plan base**
   - Select con los 5 planes
   - Al seleccionar, precarga el precio sugerido en un input editable

3. **Módulos**
   - Tabla con toggle (checkbox) + input de precio editable por módulo
   - Los 12 módulos listados arriba
   - Al activar un módulo, se usa el precio sugerido (editable)

4. **Extras**
   - Usuarios: input numérico (qty) + input precio unitario
   - Almacenamiento: input GB + input precio por GB

5. **Descuento**: input en soles

6. **Nota**: textarea libre

7. **Vigencia**: input días (default 15)

**Columna derecha — Preview en vivo:**

Resumen tipo factura que se actualiza en tiempo real con JavaScript:
- Plan base → precio
- Lista de módulos activos → precio c/u
- Usuarios: qty × precio unit
- Almacenamiento: GB × precio/GB
- Subtotal
- Descuento
- **TOTAL**
- Vigencia: válida hasta [fecha]

**Botones (columna derecha, al final del preview):**
- **Guardar cotización** → POST a API, guarda en BD
- **Generar PDF** → descarga el PDF
- **Enviar por WhatsApp** → descarga PDF + abre wa.me con mensaje prellenado

### Tabla de cotizaciones (debajo del formulario)

Columnas: Nro | Cliente | Restaurante | Plan | Total | Estado | Fecha | Acciones

**Acciones por fila:**
- Descargar PDF
- Reenviar WhatsApp
- Cambiar estado (dropdown: pendiente → enviada → aceptada/rechazada/expirada)

## PDF de cotización

Generado con PDFKit (misma dependencia que contratos).

**Estructura del PDF:**
1. **Encabezado**: Logo mirestconia.com + título "COTIZACIÓN" + Nro COT-YYYYMMDD-####
2. **Datos del cliente**: Nombre, RUC/DNI, restaurante, teléfono, email
3. **Fecha de emisión** y **válida hasta**
4. **Tabla de desglose**:
   - Plan base con precio
   - Módulos incluidos con precio individual (solo los activos)
   - Usuarios (qty × precio unitario)
   - Almacenamiento (GB × precio por GB)
   - Línea separadora
   - Subtotal
   - Descuento (si aplica)
   - **TOTAL en negrita**
5. **Nota** (si existe)
6. **Pie de página**: Datos de contacto mirestconia.com, condiciones, forma de pago

## WhatsApp Web

**Flujo:**
1. Click en "Enviar por WhatsApp"
2. Se descarga el PDF automáticamente
3. Se abre nueva pestaña con `https://wa.me/51{telefono}?text={mensaje_codificado}`

**Mensaje prellenado:**
```
Hola {nombre_cliente}, le envío la cotización {nro_cotizacion} para {nombre_restaurante}.

Plan: {plan_base}
Módulos: {lista_modulos}
Total: S/ {total}

Vigencia: hasta {valida_hasta}

Le adjunto el PDF con el detalle completo.

mirestconia.com
```

## Navegación

Agregar enlace en el sidebar del superadmin:
- Icono: `bi-calculator`
- Label: "Cotizador"
- Posición: después de "Contratos"

## Archivos a crear/modificar

| Archivo | Acción |
|---------|--------|
| `migrations/0XX_cotizaciones.js` | Crear tabla cotizaciones |
| `routes/superadmin.js` | Agregar rutas del cotizador |
| `views/superadmin/cotizador.ejs` | Vista completa |
| `views/partials/sidebar.ejs` | Agregar enlace Cotizador |
| `server.js` | Montar ruta si es necesario (ya está bajo /superadmin) |

## Estados y transiciones (para futuro CRM)

```
pendiente → enviada → aceptada
                    → rechazada
                    → expirada (automático por fecha)
```

## Fuera de alcance (CRM futuro)

- Seguimiento de leads
- Pipeline de ventas
- Recordatorios automáticos
- Conversión cotización → contrato automática
- Envío automático por Twilio API
- Dashboard de métricas de conversión
