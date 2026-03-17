# REVIEW ARQUITECTONICO - PLAN SaaS V2 dignita.tech

## Sistema de Gestion de Restaurantes - Revision de Arquitectura Senior

**Revisor**: Arquitecto SaaS Senior (30+ anios de experiencia en sistemas de restaurantes)
**Fecha de revision**: 17 de Marzo 2026
**Documento revisado**: PLAN_SAAS_V2.md (16 de Marzo 2026)
**Codigo base revisado**: server.js, database.sql, db.js, middleware/auth.js, package.json, routes/, views/

---

## RESUMEN EJECUTIVO

El plan demuestra un entendimiento solido del dominio de restaurantes y una vision clara de los modulos necesarios. El diseno del almacen es particularmente detallado y bien pensado. Sin embargo, existen **brechas criticas** en seguridad financiera, cumplimiento regulatorio peruano, arquitectura multi-tenant, y modulos que todo competidor serio ofrece. A continuacion, el analisis completo.

---

## 1. MODULOS AUSENTES QUE UN SaaS DE RESTAURANTES DEBE TENER

### 1.1 [CRITICO] Modulo de Reservas

No existe ningun modulo de reservas. Para un restaurante con 40 mesas y 250 clientes/dia, las reservas son operacion diaria.

**Lo que falta:**
- Tabla `reservas` (fecha, hora, cantidad_personas, mesa_id, cliente_id, estado, notas, canal_origen)
- Integracion con el modulo de mesas (una mesa reservada no debe mostrarse como "libre")
- Confirmacion automatica por SMS/WhatsApp (integracion con API de mensajeria)
- Vista de calendario diario/semanal
- Widget embebible para la pagina web del restaurante
- Gestion de lista de espera (waitlist)

**Competidores que lo tienen:** Toast, Square, Resy, OpenTable. Todos ofrecen reservas como funcionalidad base.

### 1.2 [CRITICO] Modulo de Delivery / Para Llevar

El plan asume que todo es servicio en mesa. No hay flujo para:
- Pedidos para llevar (takeaway)
- Delivery propio del restaurante
- Integracion con PedidosYa, Rappi, UberEats (los tres dominan Peru)
- Tracking de pedidos delivery
- Gestion de zonas y tarifas de envio
- Tabla `pedidos_delivery` con direccion, repartidor, estado_entrega, tiempo_estimado

En Peru, el delivery representa entre 15-35% de las ventas de un restaurante urbano. Ignorar esto es perder una porcion significativa del mercado.

### 1.3 [CRITICO] Facturacion Electronica SUNAT

Este es el vacio mas grave para operar legalmente en Peru. Detallado en la seccion 6 de este documento.

### 1.4 [IMPORTANTE] Modulo de Promociones y Descuentos

No hay mecanismo para:
- Descuentos por porcentaje o monto fijo
- Cupones con codigos
- Happy hour (precios automaticos por horario)
- Menu del dia con precio especial
- Promociones 2x1
- Descuentos por canal (delivery vs presencial)
- Tabla `promociones` y `descuentos_aplicados` vinculada a facturas

**Competidores que lo tienen:** Toast, Square, MarketMan (indirectamente via integraciones).

### 1.5 [IMPORTANTE] Modulo de Propinas

En Peru la propina sugerida es del 10%. El sistema deberia:
- Registrar propina por factura (separada del total)
- Repartir propinas entre personal de servicio
- Reportar propinas para efectos tributarios
- Campo `propina` en tabla `facturas` o tabla separada `propinas`

### 1.6 [IMPORTANTE] Modulo de Fidelizacion / Programa de Lealtad

No hay mecanismo para retener clientes:
- Puntos por compra
- Tarjeta de fidelidad digital
- Descuentos para clientes frecuentes
- Historial de visitas por cliente
- Tabla `fidelidad_puntos`, `fidelidad_canjes`

**Competidores:** Toast tiene "Toast Loyalty", Square tiene "Square Loyalty".

### 1.7 [IMPORTANTE] Gestion de Turnos y Horarios del Personal

La tabla `personal` es basica. Falta:
- Turnos con hora_inicio y hora_fin
- Control de asistencia (check-in / check-out)
- Calculo automatico de horas extras
- Vacaciones y permisos
- Tabla `turnos`, `asistencia`, `permisos`

### 1.8 [SUGERENCIA] Modulo de Menu Digital / QR

La pandemia acelero esto. Todo restaurante moderno necesita:
- Menu digital accesible por QR en cada mesa
- Precios actualizados en tiempo real
- Fotos de platos
- Indicadores de alergenos y preferencias dieteticas (vegetariano, sin gluten, etc.)
- Opcion de pedido desde el celular del cliente

### 1.9 [SUGERENCIA] Modulo de Evaluacion de Satisfaccion

- Encuesta post-servicio (1-5 estrellas + comentario)
- NPS (Net Promoter Score)
- Integracion con Google Reviews
- Dashboard de satisfaccion

### 1.10 [SUGERENCIA] Modulo de Kitchen Display System (KDS) mejorado

El modulo de cocina existe pero es basico. Los KDS modernos incluyen:
- Tiempos de preparacion por plato (benchmarks)
- Alertas de tiempo excedido
- Priorizacion inteligente de pedidos
- Estadisticas de rendimiento de cocina
- Pantalla de expedicion (platos listos esperando entrega)

---

## 2. PROBLEMAS DE DISENO DE BASE DE DATOS

### 2.1 [CRITICO] Ausencia total de tenant_id en las tablas propuestas

El plan menciona "agregar tenant_id a TODAS las tablas" en la Fase 7, pero **ninguna de las tablas SQL del plan incluye tenant_id**. Esto significa que:

- Todo el SQL propuesto tendra que reescribirse
- Todas las foreign keys necesitan incluir tenant_id en la clave compuesta
- Los UNIQUE constraints deben ser por tenant (ej: `UNIQUE(tenant_id, codigo)` en ingredientes)

**Recomendacion:** Definir todas las tablas con tenant_id desde el inicio. Retrofitear multi-tenancy es una de las migraciones mas costosas que existen.

### 2.2 [CRITICO] Falta de indices en tablas de alto volumen

Ninguna tabla del plan define indices. Con 250 clientes/dia, las tablas `almacen_movimientos`, `caja_movimientos` y `detalle_factura` crecen rapidamente.

**Indices minimos necesarios:**
```sql
-- almacen_movimientos: consultas por ingrediente, fecha, tipo
CREATE INDEX idx_mov_ingrediente ON almacen_movimientos(ingrediente_id, created_at);
CREATE INDEX idx_mov_tipo ON almacen_movimientos(tipo, motivo, created_at);
CREATE INDEX idx_mov_referencia ON almacen_movimientos(referencia_tipo, referencia_id);

-- caja_movimientos: consultas por caja, fecha
CREATE INDEX idx_cajamov_caja ON caja_movimientos(caja_id, created_at);
CREATE INDEX idx_cajamov_tipo ON caja_movimientos(tipo, metodo_pago);

-- facturas: consultas por fecha (reportes diarios)
CREATE INDEX idx_facturas_fecha ON facturas(fecha);
CREATE INDEX idx_facturas_cliente ON facturas(cliente_id);

-- almacen_historial_diario: ya tiene UNIQUE pero necesita indice por fecha
CREATE INDEX idx_historial_fecha ON almacen_historial_diario(fecha);

-- recetas: consultas por producto
CREATE INDEX idx_recetas_producto ON recetas(producto_id);

-- Cuando se agregue tenant_id, TODOS los indices deben liderarse con tenant_id:
-- CREATE INDEX idx_mov_tenant ON almacen_movimientos(tenant_id, ingrediente_id, created_at);
```

### 2.3 [CRITICO] Tabla `personal` desconectada de `usuarios`

La tabla `personal` tiene `usuario_id INT NULL` pero no tiene FOREIGN KEY definida. Ademas, hay campos duplicados entre `personal` y `usuarios` (nombre, rol/cargo). Esto genera:

- Datos inconsistentes (un cocinero puede tener un nombre en `usuarios` y otro en `personal`)
- No hay forma de saber que empleados NO tienen acceso al sistema
- Los pagos de planilla no se vinculan al usuario que opero el sistema

**Recomendacion:** Agregar `FOREIGN KEY (usuario_id) REFERENCES usuarios(id)` y definir claramente que `personal` extiende a `usuarios` (no lo reemplaza).

### 2.4 [CRITICO] Sin tabla de auditoria

Un sistema que maneja dinero real necesita audit trail. Falta:
```sql
CREATE TABLE audit_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    usuario_id INT NOT NULL,
    accion VARCHAR(50) NOT NULL,        -- 'INSERT', 'UPDATE', 'DELETE'
    tabla_afectada VARCHAR(100) NOT NULL,
    registro_id INT NOT NULL,
    datos_anteriores JSON NULL,
    datos_nuevos JSON NULL,
    ip_address VARCHAR(45) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_audit_tenant (tenant_id, created_at),
    INDEX idx_audit_tabla (tabla_afectada, registro_id)
);
```

### 2.5 [IMPORTANTE] Tabla `cajas` sin restriccion de caja unica abierta

No hay constraint que evite que un cajero abra multiples cajas al mismo tiempo, o que dos cajeros tengan cajas abiertas simultaneamente (si el negocio opera con una sola caja fisica). Debe existir una regla de negocio validada a nivel de BD o, al menos, a nivel de aplicacion con verificacion atomica.

### 2.6 [IMPORTANTE] Tabla `recetas` sin versionado

Cuando cambia el precio de un ingrediente o se modifica una receta, el costo historico de las facturas pasadas queda corrompido. Necesitas:
- `receta_versiones` con snapshot de la receta al momento de emitir la factura
- O almacenar el costo calculado en `detalle_factura` al momento de la venta (campo `costo_receta`)

### 2.7 [IMPORTANTE] Tipo de dato ENUM para roles en MySQL

El plan usa `ENUM('administrador','cajero','mesero','cocinero')`. Los ENUMs de MySQL son problematicos para SaaS porque:
- Agregar un nuevo rol requiere ALTER TABLE (downtime o migracion)
- No se pueden tener roles personalizados por tenant

**Recomendacion:** Usar una tabla `roles` con permisos granulares:
```sql
CREATE TABLE roles (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    nombre VARCHAR(50) NOT NULL,
    permisos JSON NOT NULL,  -- {"caja": true, "almacen": "lectura", "admin": false}
    es_sistema TINYINT(1) DEFAULT 0,  -- roles base no editables
    UNIQUE(tenant_id, nombre)
);
```

### 2.8 [IMPORTANTE] Sin soft delete consistente

Algunas tablas tienen `activo TINYINT(1)` y otras no. Las tablas `facturas`, `cajas`, `almacen_movimientos`, `gastos` no tienen mecanismo de desactivacion. En un sistema financiero, nunca se debe hacer DELETE fisico de registros contables.

**Recomendacion:** Agregar columna `deleted_at TIMESTAMP NULL` a todas las tablas. Los registros "eliminados" solo se marcan, nunca se borran.

### 2.9 [IMPORTANTE] Tabla `clientes` demasiado simple

Para Peru, un cliente necesita:
- `tipo_documento` ENUM('DNI','RUC','CE','PASAPORTE')
- `numero_documento` VARCHAR(20) -- obligatorio para facturas SUNAT
- `email` VARCHAR(150) -- para envio de comprobantes electronicos
- `razon_social` VARCHAR(200) -- para facturas a empresas

La tabla actual solo tiene nombre, direccion y telefono.

### 2.10 [SUGERENCIA] Tabla `productos` sin categoria

La tabla `productos` actual no tiene campo `categoria_id`. Sin categorias, no se puede:
- Filtrar el menu por seccion (Entradas, Sopas, Ceviches, Carnes, Bebidas, Postres)
- Agrupar reportes por categoria
- Organizar el menu digital

### 2.11 [SUGERENCIA] Falta tabla de metodos de pago

El plan usa ENUM para metodos de pago. En Peru se necesita soportar: Yape, Plin, POS Visa/MC, transferencia BCP/Interbank/BBVA, efectivo, credito de casa. Un ENUM no escala.

```sql
CREATE TABLE metodos_pago (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    nombre VARCHAR(50) NOT NULL,  -- 'Yape', 'Plin', 'Efectivo', 'Visa POS'
    tipo VARCHAR(30) NOT NULL,    -- 'digital', 'efectivo', 'tarjeta', 'transferencia'
    activo TINYINT(1) DEFAULT 1,
    comision_porcentaje DECIMAL(5,2) DEFAULT 0,  -- POS cobra ~3.5%
    UNIQUE(tenant_id, nombre)
);
```

---

## 3. RELACIONES ENTRE MODULOS: BRECHAS Y FLUJOS ROTOS

### 3.1 [CRITICO] Facturacion --> Almacen: Sin control de stock insuficiente

El plan dice que al facturar se descuenta inventario automaticamente, pero no define que pasa cuando:
- Un ingrediente tiene stock 0 o negativo
- La receta de un producto no esta configurada
- Un ingrediente esta desactivado

**Escenario real:** Se venden 3 ceviches, pero solo hay 200g de pescado (se necesitan 450g). El sistema debe:
1. Alertar ANTES de confirmar la factura? O despues?
2. Permitir stock negativo? (algunos restaurantes lo prefieren para registrar ventas y ajustar despues)
3. Bloquear la venta?

**Recomendacion:** Definir una configuracion por tenant: `permitir_stock_negativo` (boolean). Si es false, validar stock antes de facturar. Si es true, generar alerta automatica en canal #inventario.

### 3.2 [CRITICO] Mesas --> Caja: Sin validacion de caja abierta

El flujo dice que al facturar desde mesa se crea un movimiento en caja. Pero no hay validacion de que exista una caja abierta. Si el cajero no abrio caja, que pasa con las facturas? Se pierden los movimientos de caja?

**Recomendacion:** No permitir generar facturas si no hay caja abierta (o crear movimientos "pendientes" que se asocian cuando se abra la caja).

### 3.3 [IMPORTANTE] Almacen --> P&L: COGS calculado vs registrado

El P&L calcula COGS como `receta x cantidad vendida`. Pero el costo real puede diferir por:
- Merma no registrada
- Variacion de precios de ingredientes durante el dia
- Porciones reales vs receta (el cocinero puede usar mas o menos)

**Recomendacion:** Calcular DOS valores de COGS:
1. **COGS teorico** (receta x ventas) -- para analisis de eficiencia
2. **COGS real** (compras - inventario final + inventario inicial) -- para P&L contable

La diferencia entre ambos es la "varianza operativa", un KPI clave que MarketMan reporta.

### 3.4 [IMPORTANTE] Canales --> Modulos: Sin integracion real definida

Los canales internos mencionan mensajes automaticos, pero no se define:
- Que API/evento dispara el mensaje automatico
- Si se usan WebSockets, polling, o SSE para notificaciones en tiempo real
- Como se integran con el flujo de trabajo (ej: un mensaje de stock bajo genera una orden de compra sugerida?)

### 3.5 [IMPORTANTE] Gastos --> Caja: Flujo incompleto

Los gastos fijos (luz, agua, alquiler) se registran en la tabla `gastos` pero no se vinculan a `caja_movimientos`. Cuando el administrador paga el recibo de luz en efectivo desde la caja, deberia:
1. Crear un registro en `gastos`
2. Crear un movimiento en `caja_movimientos` tipo='egreso'
3. Ambos deben estar vinculados

El plan no define esta doble entrada.

### 3.6 [SUGERENCIA] Productos --> Recetas: Sin recetas multiples

Un mismo plato puede tener variantes (ceviche personal vs ceviche para 2 vs ceviche familiar). El modelo actual asume un producto = una receta. Deberia soportar:
- Recetas por tamano/variante
- Sub-recetas reutilizables (ej: "leche de tigre" se usa en ceviche, tiradito, y leche de tigre sola)

---

## 4. MULTI-TENANCY: PROBLEMAS CRITICOS

### 4.1 [CRITICO] Shared Database sin Row-Level Security

El plan usa el patron "shared database, shared schema" con `tenant_id` y `WHERE tenant_id = ?`. Este es el patron mas riesgoso porque:

- Un solo bug en un query sin WHERE tenant_id expone datos de TODOS los tenants
- No hay mecanismo de defensa en profundidad
- MySQL no tiene Row-Level Security nativo (a diferencia de PostgreSQL)

**Recomendaciones:**
1. **Inmediata:** Crear un wrapper de base de datos que inyecte `tenant_id` automaticamente en TODOS los queries:
```javascript
// En vez de db.query("SELECT * FROM productos WHERE id = ?", [id])
// Usar: tenantDb.query("SELECT * FROM productos WHERE id = ?", [id])
// Que internamente agrega: "SELECT * FROM productos WHERE tenant_id = ? AND id = ?"
```
2. **Medio plazo:** Migrar a PostgreSQL con Row-Level Security (RLS) policies
3. **Alternativa:** Usar schema-per-tenant (cada tenant tiene su propio schema MySQL) -- mayor aislamiento pero mas complejo de mantener

### 4.2 [CRITICO] Sin plan de migracion de datos

El plan dice "agregar tenant_id a tablas existentes" pero no define:
- Como migrar datos existentes del sistema actual (que no tiene tenant_id)
- Script de migracion para clientes existentes
- Estrategia de rollback si algo falla
- Como mantener el sistema funcionando durante la migracion

### 4.3 [CRITICO] Session store en memoria

El `server.js` actual usa session store en memoria (`express-session` sin store externo). Para SaaS multi-tenant esto significa:
- Al reiniciar el servidor, TODOS los usuarios de TODOS los tenants pierden sesion
- No escala horizontalmente (si agregas un segundo servidor, las sesiones no se comparten)
- Leak de memoria con muchos usuarios concurrentes

**Recomendacion:** Usar Redis como session store:
```javascript
const RedisStore = require('connect-redis').default;
const redis = require('redis');
const redisClient = redis.createClient();
app.use(session({
    store: new RedisStore({ client: redisClient }),
    // ...
}));
```

### 4.4 [IMPORTANTE] Sin limites de rate limiting por tenant

No hay mecanismo para prevenir que un tenant abuse del sistema:
- Un tenant con muchas operaciones puede degradar el rendimiento de todos
- No hay throttling por API
- No hay queue management para operaciones pesadas (reportes PDF, exportaciones Excel)

### 4.5 [IMPORTANTE] Sin plan de backup por tenant

No se define:
- Backup y restore individual por tenant
- Exportacion de datos del tenant (requerido por ley de proteccion de datos)
- Procedimiento de eliminacion de datos al cancelar suscripcion

### 4.6 [IMPORTANTE] Sin panel de super-admin

El plan menciona "Panel super-admin para gestionar tenants" pero no lo detalla. Necesita:
- Dashboard de todos los tenants (activos, inactivos, prueba)
- Metricas por tenant (uso, almacenamiento, facturas emitidas)
- Capacidad de suspender/reactivar tenant
- Impersonar (login como) un tenant para soporte
- Gestion de planes y facturacion de suscripciones

### 4.7 [SUGERENCIA] Considerar multi-sucursal desde el diseno

El plan Enterprise menciona "Multi-sucursal" pero no hay diseno para ello. Un tenant puede tener multiples locales. Esto requiere:
- Tabla `sucursales` (tenant_id, nombre, direccion, ...)
- `sucursal_id` en tablas operativas (cajas, mesas, almacen, facturas)
- Reportes consolidados y por sucursal
- Transferencias de inventario entre sucursales

Disenar esto despues es extremadamente costoso. Al menos definir la tabla `sucursales` y el campo `sucursal_id` desde el inicio.

---

## 5. SEGURIDAD: PROBLEMAS PARA UN SISTEMA FINANCIERO

### 5.1 [CRITICO] Credenciales de BD en codigo fuente

El archivo `db.js` tiene:
```javascript
host: 'localhost',
user: 'root',
password: '111',
database: 'reconocimiento',
```

Credenciales hardcodeadas, usuario root, y contrasena trivial. Para un SaaS que maneja dinero:
- Usar variables de entorno exclusivamente
- Nunca usar root; crear usuario con privilegios minimos
- Rotacion periodica de credenciales
- Usar connection strings con SSL/TLS habilitado

### 5.2 [CRITICO] CORS abierto a todo el mundo

En `server.js`:
```javascript
res.setHeader('Access-Control-Allow-Origin', '*');
```

Esto permite que cualquier sitio web en internet haga requests a tu API. Para un sistema financiero, esto es inaceptable. Debe ser restrictivo al dominio del tenant.

### 5.3 [CRITICO] Session secret debil y hardcodeado

```javascript
secret: process.env.SESSION_SECRET || 'cambia_este_secret_en_.env',
```

Si `SESSION_SECRET` no esta en `.env`, se usa un string legible que cualquiera puede adivinar. Esto permite forjar sesiones y acceder a cualquier cuenta.

### 5.4 [CRITICO] Sin HTTPS obligatorio

No hay redireccion de HTTP a HTTPS. Para un sistema que maneja datos financieros y de tarjetas, HTTPS es obligatorio (PCI-DSS compliance).

### 5.5 [CRITICO] Sin proteccion CSRF

No hay middleware CSRF. Un atacante podria crear una pagina que al visitarla un cajero logueado, genere facturas falsas, cierre la caja, o modifique precios.

**Recomendacion:** Implementar `csurf` o tokens CSRF en todos los formularios.

### 5.6 [CRITICO] Contrasena de admin por defecto

En `database.sql`:
```sql
INSERT INTO usuarios ... VALUES ('admin', 'Administrador', '$2b$10$...', 'administrador', 1)
```

La contrasena por defecto `admin123` es conocida. El sistema deberia:
- Forzar cambio de contrasena en primer login
- Validar complejidad de contrasena (minimo 8 caracteres, mayuscula, numero)
- Bloqueo de cuenta despues de N intentos fallidos

### 5.7 [IMPORTANTE] Sin encriptacion de datos sensibles

Datos como RUC, numeros de tarjeta (si se almacenan), y datos personales deben estar encriptados en la base de datos (encryption at rest).

### 5.8 [IMPORTANTE] Sin registro de intentos de login fallidos

No hay tabla ni logica para registrar:
- Intentos de login fallidos
- IP de origen
- Bloqueo temporal de cuenta
- Alertas de acceso sospechoso

### 5.9 [IMPORTANTE] Sin firma digital de facturas

Para cumplimiento con SUNAT, las facturas electronicas deben estar firmadas digitalmente. Ver seccion 6.

### 5.10 [SUGERENCIA] Considerar 2FA

Para el rol administrador que accede a P&L y datos financieros, ofrecer autenticacion de dos factores (TOTP via Google Authenticator o SMS).

---

## 6. REQUERIMIENTOS ESPECIFICOS DE PERU

### 6.1 [CRITICO] Facturacion Electronica SUNAT - AUSENTE COMPLETAMENTE

Desde 2018, los restaurantes en Peru con ingresos anuales superiores a 150 UIT estan obligados a emitir comprobantes electronicos. Desde 2024, la obligacion se extendio a mas contribuyentes. El sistema NECESITA:

**Tipos de comprobante:**
- Factura electronica (para clientes con RUC)
- Boleta de venta electronica (para consumidores finales con DNI o sin documento)
- Nota de credito electronica (para anulaciones y devoluciones)
- Nota de debito electronica (para recargos)

**Integracion tecnica requerida:**
- Comunicacion con SUNAT via API REST (SEE o OSE)
- Firma digital con certificado digital (SUNAT exige XML firmado con certificado X.509)
- Generacion de XML en formato UBL 2.1
- Codigo QR en comprobante impreso (obligatorio desde 2023)
- Envio automatico del comprobante al correo del cliente
- Codigo hash SHA-256 del comprobante
- Serie y correlativo por tipo de comprobante

**Proveedores de facturacion electronica en Peru (OSE):**
- Nubefact (API REST, popular entre startups)
- SUNAT directamente (API gratuita pero mas compleja)
- Bizlinks
- Efact

**Tablas necesarias:**
```sql
CREATE TABLE comprobantes_electronicos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    factura_id INT NOT NULL,
    tipo_comprobante ENUM('factura','boleta','nota_credito','nota_debito') NOT NULL,
    serie VARCHAR(10) NOT NULL,        -- 'F001', 'B001', etc.
    correlativo INT NOT NULL,
    fecha_emision DATETIME NOT NULL,
    cliente_tipo_doc VARCHAR(5) NOT NULL,  -- '6'=RUC, '1'=DNI, '0'=sin doc
    cliente_num_doc VARCHAR(20) NOT NULL,
    cliente_razon_social VARCHAR(200) NOT NULL,
    subtotal DECIMAL(12,2) NOT NULL,
    igv DECIMAL(12,2) NOT NULL,
    total DECIMAL(12,2) NOT NULL,
    xml_firmado LONGTEXT NULL,
    hash_cpe VARCHAR(100) NULL,
    codigo_sunat VARCHAR(10) NULL,     -- Respuesta SUNAT
    mensaje_sunat TEXT NULL,
    pdf_url VARCHAR(300) NULL,
    estado ENUM('pendiente','aceptado','rechazado','anulado') DEFAULT 'pendiente',
    enviado_sunat_at TIMESTAMP NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE(tenant_id, tipo_comprobante, serie, correlativo),
    FOREIGN KEY (factura_id) REFERENCES facturas(id)
);
```

### 6.2 [CRITICO] Calculo de IGV (Impuesto General a las Ventas)

El IGV en Peru es 18%. El plan NO maneja impuestos en la facturacion. Las facturas deben mostrar:
- Valor de venta (subtotal sin IGV)
- IGV (18%)
- Precio de venta (total con IGV)

Actualmente la tabla `facturas` solo tiene `total`. Necesita:
```sql
ALTER TABLE facturas ADD COLUMN subtotal_sin_igv DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE facturas ADD COLUMN igv DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE facturas ADD COLUMN total_con_igv DECIMAL(12,2) NOT NULL DEFAULT 0;
```

Los precios en Peru generalmente ya incluyen IGV (regimen de precio con IGV incluido para restaurantes). El sistema debe descomponer:
- Precio venta = S/35.00 (incluye IGV)
- Valor venta = S/35.00 / 1.18 = S/29.66
- IGV = S/35.00 - S/29.66 = S/5.34

### 6.3 [CRITICO] Validacion de RUC y DNI

El sistema debe validar:
- RUC: 11 digitos, algoritmo de validacion de SUNAT (modulo 11)
- DNI: 8 digitos, validacion contra API de RENIEC (existen APIs como apiperu.dev, consultaruc.com)
- Auto-completar razon social al ingresar RUC (API de SUNAT)

### 6.4 [IMPORTANTE] Ley laboral peruana - Planilla

La tabla `personal` y `planilla_pagos` no contemplan:
- CTS (Compensacion por Tiempo de Servicios) -- deposito semestral obligatorio
- Gratificaciones (julio y diciembre, equivalente a un sueldo)
- EsSalud (9% del sueldo, a cargo del empleador)
- ONP (13%) o AFP (variable ~12.5%) -- aportes de pension
- Renta de quinta categoria (impuesto a la renta del trabajador)
- SCTR (Seguro Complementario de Trabajo de Riesgo) -- obligatorio en restaurantes
- Asignacion familiar (10% de la RMV si tiene hijos)
- Registro en T-Registro (SUNAT)
- Boletas de pago electronicas

**Recomendacion:** Para MVP, al menos registrar los conceptos y calcular las deducciones basicas. O integrarse con un sistema de planilla existente.

### 6.5 [IMPORTANTE] Moneda y formato peruano

- Simbolo de moneda: S/ (no $)
- Formato numerico: S/ 8,750.00 (coma para miles, punto para decimales)
- Fecha: DD/MM/YYYY (no MM/DD/YYYY)
- Zona horaria: America/Lima (UTC-5, sin horario de verano)

### 6.6 [SUGERENCIA] DIGESA / Licencia de funcionamiento

Los restaurantes en Peru necesitan:
- Licencia de funcionamiento municipal
- Carnet de sanidad del personal (vigencia anual)
- Certificado de fumigacion
- El sistema podria alertar sobre vencimientos de estos documentos

---

## 7. ESCALABILIDAD: ANALISIS PARA 250 CLIENTES/DIA, 40 MESAS

### 7.1 [CRITICO] MySQL con una sola conexion pool

El `db.js` actual tiene `connectionLimit: 10`. Para SaaS con multiples tenants, esto es insuficiente.

**Calculo:**
- 250 clientes/dia = ~30 clientes/hora pico
- Cada factura dispara: 1 INSERT factura + N INSERT detalle + N UPDATE almacen + 1 INSERT caja_movimiento
- Con 10 tenants activos: 300 clientes/hora = ~5 queries/segundo minimo
- Con 50 tenants: ~25 queries/segundo

Con `connectionLimit: 10`, el pool se saturara rapidamente.

**Recomendacion:**
- Aumentar a 50-100 conexiones
- Implementar connection pooling externo (ProxySQL)
- Considerar read replicas para reportes pesados

### 7.2 [CRITICO] Sin cache layer

No hay Redis ni cache en memoria. Consultas repetitivas como:
- Lista de productos (se consulta en cada venta)
- Recetas (se consultan con cada factura)
- Stock actual (se consulta en dashboard, almacen, reportes)
- Configuracion del tenant

Se ejecutan contra la BD cada vez. Con 50 tenants, esto no escala.

**Recomendacion:** Implementar Redis para:
- Cache de productos y recetas (invalidar al modificar)
- Cache de configuracion del tenant
- Session store
- Queue de jobs (reportes PDF, envio de emails)

### 7.3 [IMPORTANTE] Generacion de reportes PDF bloqueante

El plan usa `pdfkit` o `puppeteer` para generar PDFs. Puppeteer es extremadamente pesado (levanta un Chrome completo) y bloqueante.

Con multiples tenants generando reportes simultaneamente, el servidor se caera.

**Recomendacion:**
- Usar un job queue (Bull con Redis) para generar reportes en background
- Notificar al usuario cuando el reporte este listo
- Cachear reportes del dia (si ya se genero, servir el mismo)
- Preferir `pdfkit` o `@react-pdf/renderer` sobre Puppeteer

### 7.4 [IMPORTANTE] Tabla `almacen_movimientos` crecera sin control

Con 200 ingredientes y 250 ventas/dia (cada venta descuenta ~8-12 ingredientes), se generan ~2,500 movimientos/dia por tenant. Con 50 tenants: 125,000 registros/dia, 3.75 millones/mes.

**Recomendacion:**
- Particionado por fecha (MySQL 8 soporta table partitioning)
- Archivado mensual de movimientos antiguos a tabla `almacen_movimientos_archive`
- Indices optimizados (ver seccion 2.2)

### 7.5 [IMPORTANTE] Sin WebSockets eficientes

El modulo de cocina necesita tiempo real (pedidos entrando). El modulo de canales necesita chat en tiempo real. Sin embargo, no se menciona la estrategia de WebSockets.

**Recomendacion:**
- Usar Socket.IO con adapter de Redis (para escalar horizontalmente)
- Implementar namespaces por tenant: `/tenant-123/cocina`, `/tenant-123/canales`
- Rate limiting en mensajes WebSocket

### 7.6 [SUGERENCIA] Sin CDN para assets estaticos

Bootstrap, jQuery, imagenes y logos se sirven desde el mismo servidor Node.js. Para SaaS, los assets estaticos deben servirse via CDN (Cloudflare, CloudFront).

### 7.7 [SUGERENCIA] Sin health checks ni monitoring

No hay endpoints de health check (`/health`, `/readiness`). Para SaaS es indispensable:
- Health check de la BD
- Health check de Redis
- Metricas de uso por tenant
- Alertas de errores (Sentry, Datadog)

---

## 8. FUNCIONALIDADES DE LA COMPETENCIA QUE FALTAN

### 8.1 MarketMan (Inventario especializado)

Lo que MarketMan tiene y dignita.tech no planea:
- **Conteo de inventario por zona** (camara fria, almacen seco, barra) -- parcialmente cubierto por `ubicacion` en ingredientes
- **Integracion con POS externos** (API bidireccional)
- **Auto-ordering** (genera orden de compra automatica cuando stock < minimo)
- **Waste tracking con fotos** (el cocinero fotografa la merma) -- el plan lo menciona como opcional pero deberia ser obligatorio
- **Variance reports** (COGS teorico vs real, diferencia por ingrediente)
- **Price tracking historico** (grafico de evolucion de precio de cada ingrediente con proveedores)

### 8.2 Toast (POS + gestion integral)

Lo que Toast tiene y dignita.tech no planea:
- **Online ordering** (pedidos desde la web del restaurante)
- **Toast Go** (POS portatil para meseros -- similar a un celular)
- **Employee scheduling** (horarios de trabajo con drag-and-drop)
- **Payroll integration** (conexion con sistemas de nomina)
- **Guest feedback** (encuestas post-comida)
- **Marketing por email/SMS** (campanas automaticas a clientes)
- **Analytics avanzados** (labor cost %, food cost %, RevPASH)

### 8.3 Square for Restaurants

Lo que Square tiene y dignita.tech no planea:
- **Modifier groups** (opciones para cada plato: sin cebolla, extra picante, termino de coccion)
- **Course management** (entrada, fondo, postre -- enviar a cocina por tiempos)
- **Floor plan visual** (mapa grafico del restaurante con mesas arrastrables)
- **Auto-gratuity** (propina automatica para grupos grandes)
- **Void/comp tracking** (registro de anulaciones y cortesias con razon)
- **Menu engineering** (analisis de rentabilidad por plato: estrellas, vacas, perros, puzzles)

### 8.4 Funcionalidades competitivas prioritarias para dignita.tech

Basado en el mercado peruano, estas son las 5 funcionalidades que mas impacto tendrian:

| # | Funcionalidad | Impacto | Esfuerzo | Prioridad |
|---|---------------|---------|----------|-----------|
| 1 | Facturacion electronica SUNAT | Legal obligatorio | Alto | HACER YA |
| 2 | Modificadores de plato (sin cebolla, extra aji) | Operacion diaria | Medio | Fase 1 |
| 3 | Delivery + integracion Rappi/PedidosYa | 15-35% de ventas | Alto | Fase 2 |
| 4 | Menu digital QR | Tendencia post-pandemia | Bajo | Fase 2 |
| 5 | Menu engineering (estrellas/perros) | Rentabilidad | Medio | Fase 3 |

---

## 9. PROBLEMAS DE ARQUITECTURA DEL CODIGO ACTUAL

### 9.1 [CRITICO] Nombre del proyecto inconsistente

- `package.json` dice `"name": "ecl-fruver"` y `"description": "Sistema de Facturación para ECL FRUVER"`
- La base de datos se llama `reconocimiento`
- El plan dice `dignita.tech`

Tres nombres diferentes para el mismo proyecto. Esto indica que el codigo fue reutilizado de otro proyecto sin refactorizacion completa.

### 9.2 [CRITICO] Sin sistema de migraciones

La base de datos se crea con un archivo `database.sql` monolitico y migraciones ad-hoc en `db.js` (`ensureSchema()`). Para SaaS necesitas:
- Sistema de migraciones versionadas (Knex.js migrations, node-db-migrate, Flyway)
- Cada cambio de esquema es una migracion numerada
- Se puede subir y bajar (up/down) de version
- Imprescindible cuando tienes multiples tenants que pueden estar en versiones diferentes

### 9.3 [IMPORTANTE] Monolito sin separacion de capas

El codigo actual mezcla logica de negocio en las rutas (controllers hacen queries directos a la BD). Para SaaS necesitas:
```
routes/     --> Solo manejo HTTP (request/response)
services/   --> Logica de negocio (calculos, validaciones, reglas)
models/     --> Acceso a datos (queries, ORM)
middleware/ --> Auth, tenant, logging, rate limiting
```

Sin esta separacion, agregar multi-tenancy requiere modificar CADA ruta individualmente.

### 9.4 [IMPORTANTE] Sin testing

No hay tests unitarios, de integracion, ni end-to-end. Para SaaS donde un bug afecta a todos los tenants, esto es riesgoso.

Minimo necesario:
- Tests para calculo de COGS (logica financiera)
- Tests para descuento de inventario (logica critica)
- Tests para aislamiento de tenant (que un tenant no vea datos de otro)
- Tests para facturacion electronica (formato XML, firma digital)

### 9.5 [SUGERENCIA] EJS como template engine

EJS funciona pero no escala bien para una aplicacion SaaS moderna. Considerar:
- Separar frontend y backend (API REST + SPA con React/Vue/Svelte)
- PWA (Progressive Web App) para uso en celulares de meseros
- Renderizado del lado del cliente para mejor UX

Sin embargo, para el MVP actual, EJS es aceptable si el equipo es productivo con el.

---

## 10. RECOMENDACIONES ESTRATEGICAS (ROADMAP CORREGIDO)

### Fase 0: Fundamentos (ANTES de cualquier modulo nuevo) -- 2-3 semanas

1. Migrar credenciales a variables de entorno (.env)
2. Implementar sistema de migraciones (Knex.js)
3. Agregar tenant_id a TODAS las tablas existentes
4. Crear middleware de tenant que inyecte tenant_id automaticamente
5. Crear wrapper de BD con tenant_id obligatorio
6. Implementar CSRF protection
7. Restringir CORS al dominio del tenant
8. Implementar Redis (sessions + cache)
9. Agregar tabla audit_log
10. Renombrar proyecto consistentemente

### Fase 1: Compliance Legal Peru -- 2-3 semanas

1. Integracion con Nubefact u OSE para facturacion electronica
2. Calculo de IGV en facturas
3. Validacion de RUC/DNI
4. Tipos de comprobante (boleta, factura, nota de credito)
5. Formato peruano (S/, fechas DD/MM/YYYY, timezone Lima)

### Fase 2: Almacen + Recetas + Caja (como en el plan) -- 3-4 semanas

Seguir el plan propuesto, pero con:
- Indices en todas las tablas
- Validacion de stock al facturar
- Recetas versionadas
- Vinculacion caja-gastos

### Fase 3: Administracion + Reportes -- 2-3 semanas

Seguir el plan, pero agregar:
- COGS teorico vs real
- Variance report
- Conceptos laborales peruanos basicos en planilla

### Fase 4: Multi-tenancy real + SaaS launch -- 3-4 semanas

1. Panel de super-admin
2. Onboarding automatizado
3. Sistema de planes con limites
4. Integracion de pagos (MercadoPago o Stripe)
5. Subdominio automatico

### Fase 5: Features competitivos -- ongoing

1. Reservas
2. Delivery
3. Menu digital QR
4. Modificadores de platos
5. Menu engineering
6. Programa de fidelizacion

---

## 11. RESUMEN DE HALLAZGOS

| Categoria | CRITICO | IMPORTANTE | SUGERENCIA | Total |
|-----------|---------|------------|------------|-------|
| Modulos ausentes | 3 | 4 | 3 | 10 |
| Base de datos | 4 | 5 | 2 | 11 |
| Relaciones entre modulos | 2 | 3 | 1 | 6 |
| Multi-tenancy | 3 | 3 | 1 | 7 |
| Seguridad | 6 | 2 | 1 | 9 |
| Peru-especifico | 3 | 2 | 1 | 6 |
| Escalabilidad | 2 | 3 | 2 | 7 |
| Competencia | - | - | - | 4 areas |
| Arquitectura codigo | 2 | 2 | 1 | 5 |
| **TOTAL** | **25** | **24** | **12** | **61 hallazgos** |

---

## 12. CONCLUSION

El plan PLAN_SAAS_V2.md tiene una **vision de producto solida** y un **diseno de almacen sobresaliente** para ser un documento de planificacion. El flujo operativo diario esta bien pensado y refleja conocimiento real del negocio de restaurantes peruanos.

Sin embargo, tiene brechas criticas en tres areas:

1. **Compliance legal (SUNAT):** Sin facturacion electronica, el sistema no puede operar legalmente en Peru. Esta debe ser la prioridad absoluta.

2. **Seguridad financiera:** Las credenciales expuestas, CORS abierto, falta de CSRF, y ausencia de audit trail hacen que el sistema sea vulnerable. Un sistema que maneja caja y P&L con dinero real no puede tener estos vacios.

3. **Multi-tenancy prematura:** El plan deja multi-tenancy para la Fase 7 (la ultima), pero es una decision arquitectonica que debe tomarse desde el dia 0. Retrofitear tenant_id en un sistema existente es una de las migraciones mas dolorosas y riesgosas. Recomiendo fuertemente mover esto a Fase 0.

El camino a un SaaS viable para restaurantes peruanos es realista, pero requiere priorizar fundamentos de seguridad y compliance antes de agregar features.

---

**Fin del review.**
**Revision completada el 17 de Marzo 2026.**
