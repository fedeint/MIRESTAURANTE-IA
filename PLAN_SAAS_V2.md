# PLAN SaaS V2 - dignita.tech
## Sistema de Gestion de Restaurantes - Evolucion a SaaS

**Autor**: Leonidas Yauri, CEO dignita.tech
**Fecha**: 16 de Marzo 2026
**Estado**: PLANIFICACION (no ejecutar aun)

---

## 1. VISION GENERAL

Transformar dignita.tech de una app local a un **SaaS multi-tenant** con:
- Caja registradora (apertura/cierre de caja)
- Almacen con 200+ ingredientes
- Recetas (productos = composicion de ingredientes)
- Descuento automatico de inventario al vender
- P&L y Cashflow integrado
- Reporte PDF diario (costos, ganancias, inventario faltante)
- Asistente IA con voz (speech-to-text + text-to-speech)

**Contexto del negocio**: ~250 clientes/dia, 40 mesas
**Subdominio**: nombre-restaurante.dignita.tech (ej: elmarineritopicante.dignita.tech)

---

## 1.1 ROLES DEL SISTEMA (4 roles desde el inicio)

| Rol | Acceso | Responsabilidad |
|-----|--------|-----------------|
| **Administrador** | TODO | Gestion total, P&L, config, usuarios, reportes, IA |
| **Cajero** | Caja, Facturacion, Clientes | Abrir/cerrar caja, facturar, cobrar, registrar pagos |
| **Mesero** | Mesas, Cocina (solo listos) | Tomar pedidos, enviar a cocina, entregar, facturar desde mesa |
| **Cocinero** | Cocina, Almacen (solo consulta) | Preparar pedidos, marcar estados, ver stock disponible |

**Cambio requerido en BD** (tabla usuarios):
```sql
ALTER TABLE usuarios MODIFY rol ENUM('administrador','cajero','mesero','cocinero') NOT NULL DEFAULT 'mesero';
```

**Permisos detallados**:
```
                        Admin  Cajero  Mesero  Cocinero
Dashboard               ✅      ❌      ❌      ❌
Facturacion              ✅      ✅      ❌      ❌
Mesas                    ✅      ❌      ✅      ❌
Cocina                   ✅      ❌      👁️      ✅
Caja (abrir/cerrar)      ✅      ✅      ❌      ❌
Almacen (CRUD)           ✅      ❌      ❌      ❌
Almacen (consulta stock) ✅      ❌      ❌      👁️
Productos                ✅      ❌      ❌      ❌
Clientes                 ✅      ✅      ❌      ❌
Ranking                  ✅      ❌      ❌      ❌
Administracion/P&L       ✅      ❌      ❌      ❌
Planilla                 ✅      ❌      ❌      ❌
Canales                  ✅      ✅      ✅      ✅
Asistente IA             ✅      ✅      ✅      ✅
Usuarios                 ✅      ❌      ❌      ❌
Configuracion            ✅      ❌      ❌      ❌

✅ = acceso completo  👁️ = solo lectura  ❌ = sin acceso
```

---

## 2. MODULOS NUEVOS

### 2.1 CAJA REGISTRADORA

**Concepto**: Apertura y cierre de caja diario. Controla el flujo de efectivo real.

**Tablas nuevas en BD**:
```sql
CREATE TABLE cajas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NOT NULL,
    fecha_apertura DATETIME NOT NULL,
    fecha_cierre DATETIME NULL,
    monto_apertura DECIMAL(10,2) NOT NULL DEFAULT 0,   -- Efectivo inicial
    monto_cierre_sistema DECIMAL(10,2) NULL,            -- Lo que el sistema calcula
    monto_cierre_real DECIMAL(10,2) NULL,               -- Lo que el cajero cuenta
    diferencia DECIMAL(10,2) NULL,                       -- Sobrante/faltante
    estado ENUM('abierta','cerrada') DEFAULT 'abierta',
    notas TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (usuario_id) REFERENCES usuarios(id)
);

CREATE TABLE caja_movimientos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    caja_id INT NOT NULL,
    tipo ENUM('ingreso','egreso') NOT NULL,
    concepto VARCHAR(200) NOT NULL,           -- 'venta_factura', 'retiro_efectivo', 'gasto_compra', etc.
    monto DECIMAL(10,2) NOT NULL,
    metodo_pago ENUM('efectivo','tarjeta','transferencia') DEFAULT 'efectivo',
    referencia_id INT NULL,                    -- factura_id si es venta
    usuario_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (caja_id) REFERENCES cajas(id)
);
```

**Flujo**:
1. Admin/Cajero abre caja con monto inicial (ej: S/200)
2. Cada factura generada crea un movimiento de ingreso automatico
3. Se pueden registrar retiros y gastos manuales
4. Al cerrar caja: el sistema muestra el total calculado vs el conteo real
5. Se genera un resumen con diferencia (sobrante/faltante)

**Relacion con modulos existentes**:
- `facturas` → al generar factura, se crea `caja_movimientos` con tipo='ingreso'
- `mesas` → al facturar desde mesa, mismo flujo
- Dashboard (`/`) → mostrar estado de caja (abierta/cerrada, monto actual)

**Referencia GitHub**:
- [cashreg](https://github.com/hackdaworld/cashreg) - Cash register POS con impresion
- [OpenPOS](https://github.com/kimdj/OpenPOS) - POS con cash drawer support
- [Restaurant POS MERN](https://github.com/amritmaurya1504/Restaurant_POS_System) - POS completo con inventario

**Vista**: `/caja` - Panel de caja con apertura, movimientos en tiempo real, cierre

---

### 2.2 ALMACEN / INVENTARIO

**Concepto**: Gestionar 200+ ingredientes (carnes, legumbres, vegetales, cremas, condimentos, etc.) con stock, costos y alertas de minimo.

**Tablas nuevas**:
```sql
CREATE TABLE almacen_categorias (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,              -- 'Carnes', 'Legumbres', 'Vegetales', 'Cremas', 'Condimentos', etc.
    orden INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE almacen_ingredientes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    categoria_id INT NULL,
    codigo VARCHAR(50) NULL,
    nombre VARCHAR(150) NOT NULL,              -- 'Pescado bonito', 'Cebolla roja', 'Limon', 'Sal', 'Aji limo'
    unidad_medida ENUM('kg','g','lt','ml','und') NOT NULL DEFAULT 'g',
    stock_actual DECIMAL(12,3) NOT NULL DEFAULT 0,
    stock_minimo DECIMAL(12,3) NOT NULL DEFAULT 0,  -- Alerta cuando baja de aqui
    costo_unitario DECIMAL(10,4) NOT NULL DEFAULT 0, -- Costo por unidad de medida (ej: S/25.00 por kg)
    proveedor VARCHAR(200) NULL,
    activo TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    FOREIGN KEY (categoria_id) REFERENCES almacen_categorias(id)
);

-- Movimientos de stock (entradas, salidas, ajustes)
CREATE TABLE almacen_movimientos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ingrediente_id INT NOT NULL,
    tipo ENUM('entrada','salida','ajuste','merma') NOT NULL,
    cantidad DECIMAL(12,3) NOT NULL,            -- Positiva=entrada, Negativa=salida
    costo_unitario DECIMAL(10,4) NULL,          -- Costo al momento del movimiento
    motivo VARCHAR(200) NULL,                    -- 'compra', 'venta_platillo', 'merma', 'ajuste_inventario'
    referencia_tipo VARCHAR(50) NULL,            -- 'factura', 'compra', 'manual'
    referencia_id INT NULL,                      -- factura_id, compra_id, etc.
    usuario_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (ingrediente_id) REFERENCES almacen_ingredientes(id)
);
```

**Categorias sugeridas (200+ ingredientes)**:
- Pescados y mariscos (bonito, toyo, cojinova, pulpo, conchas, langostinos...)
- Carnes (pollo, res, cerdo, chancho, cordero...)
- Vegetales (cebolla, tomate, lechuga, zanahoria, pimiento...)
- Legumbres (frijol, lenteja, garbanzo, pallares...)
- Frutas (limon, naranja, maracuya...)
- Condimentos (sal, pimienta, aji panca, aji amarillo, aji limo, comino, oregano...)
- Cremas y salsas (mayonesa, ketchup, mostaza, salsa de ostras, sillao...)
- Lacteos (leche, queso, mantequilla, crema de leche...)
- Granos y harinas (arroz, harina, pan rallado, fideos...)
- Aceites y grasas (aceite vegetal, aceite de oliva, manteca...)
- Bebidas base (gaseosas, jugos, cerveza, agua...)
- Descartables (platos, vasos, cubiertos, servilletas, bolsas...)

#### Partes del modulo Almacen (5 secciones):

```
/almacen
  │
  ├── /almacen/inventario        ← Vista principal: stock actual de todos los ingredientes
  │     - Tabla con: nombre, categoria, stock actual, unidad, minimo, costo, estado (OK/bajo/critico)
  │     - Filtros por categoria, estado, busqueda
  │     - Importar/exportar Excel
  │
  ├── /almacen/entradas          ← Registrar compras/ingresos de mercaderia
  │     - Seleccionar ingrediente → cantidad → costo unitario → proveedor
  │     - Compra multiple (varios ingredientes a la vez)
  │     - Fecha de compra, numero de comprobante
  │     - Actualiza stock_actual automaticamente
  │
  ├── /almacen/salidas           ← Salidas manuales (merma, consumo interno, perdida)
  │     - No incluye ventas (esas son automaticas por receta)
  │     - Motivo: merma, vencido, consumo interno, regalo, robo
  │     - Requiere justificacion/nota
  │
  ├── /almacen/movimientos       ← Historial completo de entradas y salidas
  │     - Filtros por fecha, ingrediente, tipo (entrada/salida/ajuste/venta)
  │     - Trazabilidad: quien, cuando, por que, referencia
  │     - Exportar a Excel
  │
  └── /almacen/alertas           ← Ingredientes bajo minimo + lista de compras sugerida
        - Lista roja: stock actual < stock minimo
        - Proyeccion: basado en consumo promedio diario, cuantos dias queda
        - Generar lista de compras (exportar/imprimir)
        - Envia alerta automatica al canal #inventario
```

**12 categorias de ingredientes**:
| # | Categoria | Ejemplos | Cant. aprox |
|---|-----------|----------|------------|
| 1 | Pescados y mariscos | Bonito, toyo, cojinova, pulpo, conchas, langostinos, camarones, choros | ~15 |
| 2 | Carnes | Pollo, res, cerdo, cordero, higado, mondongo, corazon | ~12 |
| 3 | Vegetales | Cebolla, tomate, lechuga, zanahoria, pimiento, apio, pepino, rocoto | ~25 |
| 4 | Legumbres | Frijol, lenteja, garbanzo, pallares, habas | ~8 |
| 5 | Frutas | Limon, naranja, maracuya, piña, platano, manzana | ~10 |
| 6 | Condimentos | Sal, pimienta, aji panca, aji amarillo, aji limo, comino, oregano, achiote, huacatay | ~20 |
| 7 | Cremas y salsas | Mayonesa, ketchup, mostaza, sillao, salsa de ostras, vinagre, salsa criolla | ~12 |
| 8 | Lacteos y huevos | Leche, queso, mantequilla, crema de leche, huevos | ~8 |
| 9 | Granos y harinas | Arroz, harina, pan rallado, fideos, avena, quinua, trigo | ~12 |
| 10 | Aceites y grasas | Aceite vegetal, aceite de oliva, manteca, margarina | ~6 |
| 11 | Bebidas | Gaseosas, jugos, cerveza, agua, vino, pisco, chicha | ~20 |
| 12 | Descartables y limpieza | Platos, vasos, cubiertos, servilletas, bolsas, detergente, lejia | ~25 |
| | **TOTAL** | | **~173+** |

**Referencia GitHub**:
- [FridgeMan](https://github.com/JackRKelly/FridgeMan) - Food inventory con React/Node/PostgreSQL
- [recipe-costing (Odoo)](https://github.com/JibenCL/odoo-recipe-costing) - Costeo de recetas

---

### 2.3 RECETAS (Producto = Composicion de Ingredientes)

**Concepto**: Cada producto/platillo del menu tiene una receta = lista de ingredientes con cantidades exactas. Permite calcular costo real del plato y descontar inventario al vender.

**Tabla nueva**:
```sql
CREATE TABLE recetas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    producto_id INT NOT NULL,                   -- FK a productos (el platillo)
    ingrediente_id INT NOT NULL,                -- FK a almacen_ingredientes
    cantidad DECIMAL(10,3) NOT NULL,            -- Cantidad del ingrediente por porcion
    unidad_medida ENUM('kg','g','lt','ml','und') NOT NULL DEFAULT 'g',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uq_receta (producto_id, ingrediente_id),
    FOREIGN KEY (producto_id) REFERENCES productos(id) ON DELETE CASCADE,
    FOREIGN KEY (ingrediente_id) REFERENCES almacen_ingredientes(id)
);
```

**Ejemplo - Ceviche Personal**:
| Ingrediente       | Cantidad | Unidad | Costo unit. | Costo total |
|-------------------|----------|--------|-------------|-------------|
| Pescado bonito    | 150      | g      | S/0.025/g   | S/3.75      |
| Cebolla roja      | 250      | g      | S/0.003/g   | S/0.75      |
| Limon             | 5        | und    | S/0.30/und  | S/1.50      |
| Sal               | 5        | g      | S/0.001/g   | S/0.005     |
| Pimienta          | 2        | g      | S/0.02/g    | S/0.04      |
| Aji limo          | 3        | und    | S/0.20/und  | S/0.60      |
| **COSTO TOTAL**   |          |        |             | **S/6.645** |

Si el ceviche se vende a S/35.00 → **Margen bruto: S/28.35 (81%)**

**Flujo de descuento automatico**:
1. Se genera una factura con 2 ceviches personales
2. El sistema busca la receta del "Ceviche Personal"
3. Multiplica cada ingrediente x 2 (cantidad vendida)
4. Descuenta del almacen: 300g pescado, 500g cebolla, 10 limones, etc.
5. Registra movimientos en `almacen_movimientos` con tipo='salida', motivo='venta_platillo'

**Vista**: En `/productos`, al crear/editar producto → tab "Receta" con ingredientes

---

### 2.4 ADMINISTRACION GENERAL (reemplaza Marketing)

**Concepto**: Gestionar TODO el flujo financiero del restaurante: P&L, Cashflow, planilla, servicios, gastos. Basado en tu Excel `_P&L - Cashflow.xlsx`.

#### Estructura completa basada en el Excel P&L:

**HOJA 1 - CASHFLOW (mensual)**:

ENTRADAS DE CAJA:
- Capital inicial
- Dinero en mano inicio de mes
- Ventas (automatico desde facturas)
- Ingresos financieros
- Otros ingresos

SALIDAS DE CAJA:
- **Compras existencias** (productos terminados, semiterminados, packaging) → enlaza con Almacen
- **Servicios** (ecommerce, correos, cloud)
- **Marketing** (Facebook Ads, Instagram Ads, Google Ads, YouTube Ads, email marketing)
- **Sueldos y salarios** (cada empleado con su jornal diario) → enlaza con Usuarios/Planilla
- **Inmovilizado** (alquiler local, seguro, alarma, fianzas, suministros: LUZ, AGUA, INTERNET, GAS)
- **Legal y financiero** (gestoria/contador, abogados, comisiones bancarias, otros gastos financieros)
- **Otros gastos** (transportes, viajes, otros)

RESULTADO: Flujo de caja mes = Total entradas - Total salidas → Balance final

**HOJA 2 - P&L (anual, 2018-2030)**:
- (+) Ventas
- (-) COGS (costo de lo vendido) → calculado automaticamente desde recetas
- (=) Margen Bruto
- (-) Gastos Administrativos
- (-) Sueldos y salarios
- (=) EBITDA
- (-) Amortizaciones
- (-) Provisiones
- (=) EBIT
- (+) Ingresos extraordinarios
- (-) Gastos extraordinarios
- (=) Resultado ordinario
- (+) Ingresos financieros
- (-) Gastos financieros
- (=) EBT (Beneficio antes de impuestos)
- (-) Impuesto de Sociedades (IR Peru)
- (=) **Beneficio neto**

**Ratios automaticos**: Crecimiento ventas, Margen/Ventas, ROS, ROE, ROA

#### Planilla de personal (sueldos diarios):

```sql
CREATE TABLE personal (
    id INT AUTO_INCREMENT PRIMARY KEY,
    usuario_id INT NULL,                        -- FK a usuarios (si tiene acceso al sistema)
    nombre VARCHAR(150) NOT NULL,
    cargo VARCHAR(100) NOT NULL,                -- 'Cocinero', 'Mesero', 'Cajero', 'Ayudante', 'Limpieza'
    tipo_pago ENUM('diario','semanal','quincenal','mensual') DEFAULT 'diario',
    monto_pago DECIMAL(10,2) NOT NULL,          -- Jornal diario o sueldo
    fecha_ingreso DATE NULL,
    activo TINYINT(1) DEFAULT 1,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE planilla_pagos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    personal_id INT NOT NULL,
    fecha DATE NOT NULL,
    monto DECIMAL(10,2) NOT NULL,
    horas_trabajadas DECIMAL(5,2) NULL,
    notas VARCHAR(200) NULL,
    pagado TINYINT(1) DEFAULT 0,
    caja_id INT NULL,                           -- Si se pago desde la caja
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (personal_id) REFERENCES personal(id)
);
```

#### Servicios fijos (luz, agua, internet, gas, alquiler):

```sql
CREATE TABLE gastos_categorias (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,
    tipo ENUM('fijo','variable') DEFAULT 'variable',
    grupo ENUM('compras','servicios','marketing','sueldos','inmovilizado','legal','otros') DEFAULT 'otros',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE gastos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    categoria_id INT NOT NULL,
    concepto VARCHAR(200) NOT NULL,
    monto DECIMAL(10,2) NOT NULL,
    fecha DATE NOT NULL,
    periodo_mes INT NULL,
    periodo_anio INT NULL,
    recurrente TINYINT(1) DEFAULT 0,
    frecuencia ENUM('diario','semanal','mensual','anual') NULL,
    comprobante VARCHAR(200) NULL,              -- Numero de recibo/factura del servicio
    notas TEXT NULL,
    usuario_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (categoria_id) REFERENCES gastos_categorias(id)
);
```

**Categorias pre-cargadas**:
| Grupo | Categoria | Tipo | Ejemplo |
|-------|-----------|------|---------|
| inmovilizado | Alquiler local | fijo | S/3,000/mes |
| inmovilizado | Luz | fijo | S/800/mes |
| inmovilizado | Agua | fijo | S/200/mes |
| inmovilizado | Internet | fijo | S/150/mes |
| inmovilizado | Gas | variable | S/600/mes |
| inmovilizado | Seguro | fijo | S/200/mes |
| inmovilizado | Alarma | fijo | S/80/mes |
| sueldos | Salario cocinero jefe | fijo | S/80/dia |
| sueldos | Salario mesero | fijo | S/45/dia |
| sueldos | Salario ayudante | fijo | S/35/dia |
| sueldos | Salario limpieza | fijo | S/35/dia |
| marketing | Facebook Ads | variable | S/300/mes |
| marketing | Instagram Ads | variable | S/200/mes |
| legal | Contador | fijo | S/300/mes |
| legal | Comisiones bancarias | variable | ~S/50/mes |
| compras | Compras existencias | variable | Diario |
| otros | Transporte | variable | Segun necesidad |

**Vistas**:
- `/administracion` → Dashboard financiero completo: P&L mensual, cashflow, graficos
- `/administracion/planilla` → Personal + pagos diarios
- `/administracion/servicios` → Gastos fijos (luz, agua, internet, alquiler)
- `/administracion/gastos` → Todos los gastos por categoria
- `/administracion/reportes` → Generar PDF diario/mensual

---

### 2.5 CANALES INTERNOS DE COMUNICACION

**Concepto**: Sistema de notificaciones/canales internos para que el equipo se comunique sin WhatsApp.

**Canales predefinidos**:
| Canal | Quien ve | Para que |
|-------|----------|---------|
| #inventario | Admin, Cocinero jefe | Alertas automaticas de stock bajo, lista de compras |
| #meseros | Admin, Meseros | Avisos del dia, cambios de menu, mesas reservadas |
| #cocina | Admin, Cocineros | Platos del dia, items sin stock, notas |
| #administracion | Solo Admin | Alertas financieras, cierre de caja, reportes |
| #soporte | Todos | Problemas tecnicos, sugerencias, avisos generales |

**Tabla**:
```sql
CREATE TABLE canales (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL,                -- '#inventario', '#meseros', etc.
    descripcion VARCHAR(200) NULL,
    roles_permitidos JSON NULL,                 -- ['administrador','cocinero'] o null=todos
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE canal_mensajes (
    id INT AUTO_INCREMENT PRIMARY KEY,
    canal_id INT NOT NULL,
    usuario_id INT NULL,                        -- NULL = sistema (automatico)
    tipo ENUM('texto','alerta','sistema') DEFAULT 'texto',
    mensaje TEXT NOT NULL,
    prioridad ENUM('normal','alta','urgente') DEFAULT 'normal',
    leido_por JSON NULL,                        -- [user_id, user_id, ...]
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (canal_id) REFERENCES canales(id)
);
```

**Mensajes automaticos del sistema**:
- `#inventario`: "⚠️ Pescado bonito bajo minimo: 2,100g (minimo: 10,000g). Comprar ~8kg"
- `#inventario`: "📋 Lista de compras para mañana generada: 12 items"
- `#administracion`: "💰 Caja cerrada: S/8,750 ingresos, diferencia S/0.00"
- `#administracion`: "📊 Reporte diario disponible para descargar"
- `#cocina`: "🚫 Aji limo agotado - no ofrecer platos con aji limo"
- `#meseros`: "📢 Hoy no hay Jalea Mixta (sin langostinos)"

**Vista**: `/canales` → Chat por canal, notificaciones en el sidebar (badge rojo con conteo)

---

### 2.6 REPORTE PDF DIARIO (Completo)

**Concepto**: Al final del dia, descargar un PDF con TODO el detalle financiero y operativo.

**Contenido del PDF**:

```
╔══════════════════════════════════════════════════╗
║         REPORTE DIARIO - 17/03/2026              ║
║         Restaurante dignita.tech                  ║
╠══════════════════════════════════════════════════╣
║                                                  ║
║  1. CAJA                                         ║
║  ────────────────────────────────                ║
║  Apertura:        S/200.00                       ║
║  Ingresos ventas: S/8,750.00                     ║
║  Retiros:         S/150.00                       ║
║  Cierre sistema:  S/8,800.00                     ║
║  Cierre real:     S/8,795.00                     ║
║  Diferencia:      -S/5.00 (faltante)             ║
║                                                  ║
║  2. VENTAS (250 clientes, 187 facturas)          ║
║  ────────────────────────────────                ║
║  Efectivo:        S/5,200.00  (59.4%)            ║
║  Tarjeta:         S/2,350.00  (26.9%)            ║
║  Transferencia:   S/1,200.00  (13.7%)            ║
║  TOTAL VENTAS:    S/8,750.00                     ║
║                                                  ║
║  3. COSTO POR PLATO (top 10)                     ║
║  ────────────────────────────────                ║
║  Plato          │ Qty │ Ingreso  │ Costo │Margen ║
║  Ceviche Pers.  │  45 │ 1,575.00│ 339.75│ 78.4% ║
║  Arroz c/Marisc │  38 │ 1,140.00│ 456.00│ 60.0% ║
║  Jalea Mixta    │  25 │ 1,000.00│ 325.00│ 67.5% ║
║  Chicharron Pes │  22 │   660.00│ 198.00│ 70.0% ║
║  ...                                             ║
║  TOTAL COGS:     S/2,890.00                      ║
║                                                  ║
║  4. INVENTARIO DESCONTADO                        ║
║  ────────────────────────────────                ║
║  Pescado bonito:     -6,750g                     ║
║  Cebolla roja:      -11,250g                     ║
║  Limon:               -225 und                   ║
║  Arroz:              -9,500g                     ║
║  Aceite:             -2,800ml                    ║
║  ... (todos los ingredientes usados)             ║
║                                                  ║
║  5. ⚠ FALTANTES (bajo minimo)                   ║
║  ────────────────────────────────                ║
║  Pescado bonito:  2,100g (min: 10,000g)          ║
║    → Comprar: ~8kg para mañana                   ║
║  Limon:  45 und (min: 200 und)                   ║
║    → Comprar: ~200 und                           ║
║  Aji limo: 5 und (min: 50 und)                   ║
║    → Comprar: ~50 und                            ║
║                                                  ║
║  6. PLANILLA DEL DIA                             ║
║  ────────────────────────────────                ║
║  Juan (Cocinero jefe):    S/80.00                ║
║  Maria (Cocinera):        S/60.00                ║
║  Pedro (Mesero):          S/45.00                ║
║  Ana (Mesera):            S/45.00                ║
║  Luis (Ayudante cocina):  S/35.00                ║
║  Rosa (Limpieza):         S/35.00                ║
║  Carlos (Cajero):         S/50.00                ║
║  TOTAL PLANILLA:          S/350.00               ║
║                                                  ║
║  7. GASTOS FIJOS (prorrateo diario)              ║
║  ────────────────────────────────                ║
║  Alquiler:    S/100.00  (S/3,000/30)             ║
║  Luz:          S/26.67  (S/800/30)               ║
║  Agua:          S/6.67  (S/200/30)               ║
║  Internet:      S/5.00  (S/150/30)               ║
║  Gas:          S/20.00  (S/600/30)               ║
║  Seguro:        S/6.67  (S/200/30)               ║
║  Contador:     S/10.00  (S/300/30)               ║
║  TOTAL FIJOS:  S/175.01                          ║
║                                                  ║
║  8. P&L DEL DIA                                  ║
║  ════════════════════════════════                ║
║  (+) Ventas:              S/8,750.00             ║
║  (-) COGS (ingredientes): S/2,890.00             ║
║  (=) Margen Bruto:        S/5,860.00  (67.0%)   ║
║  (-) Planilla:            S/350.00               ║
║  (-) Gastos fijos:        S/175.01               ║
║  (-) Otros gastos:        S/0.00                 ║
║  (=) GANANCIA NETA DIA:   S/5,334.99            ║
║                                                  ║
║  9. PROYECCION MAÑANA                            ║
║  ────────────────────────────────                ║
║  Clientes estimados: 250                         ║
║  Compras necesarias: S/~2,400 (12 items)         ║
║  Items criticos: 3 (ver lista faltantes)         ║
║                                                  ║
╚══════════════════════════════════════════════════╝
```

**Libreria**: `pdfkit` o `puppeteer` para generar PDF desde HTML

**Ruta**: `GET /api/reportes/diario?fecha=2026-03-17` → descarga PDF
**Ruta**: `GET /api/reportes/mensual?mes=3&anio=2026` → PDF mensual con P&L completo

---

### 2.6 ASISTENTE IA CON VOZ

**Concepto**: Agregar Speech-to-Text y Text-to-Speech al chat de DIGNITA AI.

**Tecnologia**:
- **Speech-to-Text**: Web Speech API (`SpeechRecognition`) - funciona en Chrome/Edge, gratis, sin API externa
- **Text-to-Speech**: Web Speech API (`SpeechSynthesis`) - voces nativas del sistema, gratis
- **Alternativa premium**: OpenAI Whisper API (STT) + OpenAI TTS (voz natural)

**Implementacion**:
1. Boton de microfono en el chat (al lado del boton enviar)
2. Al presionar: activa `SpeechRecognition` → escucha → convierte a texto → envia al chat
3. La respuesta de la IA se lee en voz alta con `SpeechSynthesis`
4. Toggle para activar/desactivar voz automatica

**Cambios en UI** (`views/chat.ejs`):
```html
<button class="chat-voice-btn" id="voiceBtn">
    <i class="bi bi-mic-fill"></i>
</button>
```

**Referencia**:
- [MDN Web Speech API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API)
- Compatibilidad: Chrome 33+, Edge 79+, Safari 14.1+ (solo SpeechSynthesis)

---

## 3. CAMBIOS EN MODULOS EXISTENTES

### 3.1 Sidebar reorganizado
```
Menu principal
  - Inicio (Dashboard)
  - Facturacion
  - Mesas
  - Cocina

Operaciones
  - Caja              ← NUEVO
  - Almacen            ← NUEVO

Gestion
  - Productos (+ Recetas)
  - Clientes
  - Ranking

Administracion         ← REEMPLAZA Marketing
  - P&L / Cashflow
  - Planilla (personal + pagos)
  - Servicios (luz, agua, internet, alquiler)
  - Gastos
  - Reportes (PDF diario/mensual)

Canales                ← NUEVO
  - #inventario        (alertas de stock)
  - #meseros           (avisos del dia)
  - #cocina            (notas, sin stock)
  - #administracion    (financiero, cierres)
  - #soporte           (problemas, sugerencias)

Inteligencia
  - Asistente IA (+ Voz)

Sistema
  - Usuarios
  - Configuracion
```

### 3.2 Productos (`/productos`)
- Agregar tab/seccion "Receta" al modal de crear/editar
- Listar ingredientes del almacen con buscador
- Asignar cantidad y unidad por ingrediente
- Mostrar costo total de la receta vs precio de venta
- Mostrar margen bruto en porcentaje

### 3.3 Facturacion
- Al generar factura → descontar ingredientes del almacen automaticamente
- Registrar movimiento en caja si esta abierta

### 3.4 Dashboard (`/`)
- Agregar: estado de caja (abierta/cerrada, monto actual)
- Agregar: alertas de stock bajo
- Agregar: boton "Descargar reporte del dia"

---

## 4. MODELO DE DATOS COMPLETO (relaciones)

```
productos ──── recetas ──── almacen_ingredientes ──── almacen_movimientos
    │                              │
    │                              └── almacen_categorias
    │
    └── detalle_facturas ──── facturas ──── caja_movimientos ──── cajas
                                  │
                                  └── clientes

gastos_categorias ──── gastos

usuarios ──── cajas (apertura/cierre)
```

---

## 5. ORDEN DE IMPLEMENTACION SUGERIDO

### Fase 1: Almacen + Recetas (1-2 semanas)
1. Crear tablas de almacen (categorias, ingredientes, movimientos)
2. CRUD de ingredientes (`/almacen`) con importacion masiva
3. Cargar 200+ ingredientes iniciales por categoria
4. Agregar recetas a productos (`/productos` → tab receta con hasta 30 ingredientes)
5. Calcular costo automatico por plato
6. Descuento automatico de inventario al facturar

### Fase 2: Caja Registradora (1 semana)
1. Crear tablas de caja + movimientos
2. Vista `/caja` con apertura (monto inicial) / cierre (conteo real)
3. Integrar con facturacion (movimiento ingreso automatico)
4. Registrar retiros, gastos manuales, pagos de planilla desde caja
5. Reporte de cierre con diferencia sobrante/faltante

### Fase 3: Administracion completa (1-2 semanas)
1. Crear tablas de personal, planilla_pagos, gastos_categorias, gastos
2. Pre-cargar categorias: compras, servicios, marketing, sueldos, inmovilizado, legal, otros
3. `/administracion/planilla` → Personal + pago diario (jornales)
4. `/administracion/servicios` → Gastos fijos: luz, agua, internet, gas, alquiler, seguro
5. `/administracion/gastos` → Todos los gastos por categoria y periodo
6. `/administracion` → Dashboard P&L: Ventas - COGS - Sueldos - Fijos = Ganancia neta
7. Cashflow mensual con estructura identica al Excel

### Fase 4: Canales internos (3-5 dias)
1. Crear tablas canales + mensajes
2. Pre-cargar canales: #inventario, #meseros, #cocina, #administracion, #soporte
3. Vista `/canales` con chat por canal, permisos por rol
4. Mensajes automaticos del sistema (alertas stock, cierre caja, reportes)
5. Badge de notificaciones en el sidebar

### Fase 5: Reporte PDF diario/mensual (3-5 dias)
1. Instalar pdfkit o puppeteer
2. PDF diario: caja + ventas + costo por plato + inventario descontado + faltantes + planilla + fijos + P&L del dia + proyeccion
3. PDF mensual: P&L completo con ratios (ROS, ROE, ROA)
4. Boton "Descargar reporte" en Dashboard y Administracion

### Fase 6: Voz en IA (2-3 dias)
1. Agregar Web Speech API al chat
2. Boton de microfono (speech-to-text)
3. Lectura de respuestas en voz alta (text-to-speech)
4. Toggle de voz

### Fase 7: SaaS Multi-tenant (2-3 semanas)
1. Tabla `tenants` (cada restaurante = 1 tenant)
2. `tenant_id` en TODAS las tablas existentes + nuevas
3. Middleware que inyecta tenant_id en cada request (basado en subdominio)
4. Subdominio = nombre del restaurante (elmarineritopicante.dignita.tech)
5. Aislamiento de datos: cada query lleva WHERE tenant_id = ?
6. Sistema de planes (Free/Pro/Enterprise) con limites por feature
7. Facturacion de suscripciones (Stripe / MercadoPago)
8. Panel super-admin para gestionar tenants

---

## 6. REFERENCIAS

### GitHub (POS / Caja):
- [cashreg](https://github.com/hackdaworld/cashreg) - Cash register POS
- [OpenPOS](https://github.com/kimdj/OpenPOS) - MEAN stack POS
- [Restaurant POS MERN](https://github.com/amritmaurya1504/Restaurant_POS_System) - POS completo
- [Hunts Point POS](https://github.com/jcsilva/pos) - Node.js POS con impresora

### GitHub (Inventario):
- [FridgeMan](https://github.com/JackRKelly/FridgeMan) - Food inventory React/Node
- [recipe-costing Odoo](https://github.com/JibenCL/odoo-recipe-costing) - Costeo de recetas

### APIs (Voz):
- [Web Speech API (MDN)](https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API)

### Software de referencia (comercial):
- [MarketMan](https://www.marketman.com/) - Inventory management para restaurantes
- [recipe-costing.com](https://www.recipe-costing.com/) - Recipe costing software
- [Reciprofity](https://reciprofity.com/) - Food costing y inventory

---

---

## 7. FLUJOGRAMA SaaS COMPLETO

### 7.1 Flujo de Onboarding (Nuevo Restaurante)

```
┌─────────────────────────────────────────────────────────────┐
│                    LANDING PAGE                              │
│                restaurante.dignita.tech                       │
│         "Gestiona tu restaurante con tecnologia"             │
│                                                              │
│    [Crear cuenta gratis]     [Iniciar sesion]                │
└──────────┬──────────────────────────┬────────────────────────┘
           │                          │
           ▼                          ▼
┌─────────────────────┐    ┌─────────────────────┐
│   REGISTRO TENANT   │    │      LOGIN           │
│                     │    │                       │
│ - Nombre restaurante│    │ - Usuario             │
│ - Email             │    │ - Contrasena          │
│ - Telefono          │    │ - Tenant (subdominio) │
│ - Plan (free/pro)   │    │                       │
│ - Crear admin       │    │                       │
└────────┬────────────┘    └──────────┬────────────┘
         │                            │
         ▼                            ▼
┌─────────────────────────────────────────────────────────────┐
│                     SETUP INICIAL                            │
│                                                              │
│  1. Datos del negocio (nombre, RUC, direccion, logo)         │
│  2. Crear mesas (cantidad, zonas)                            │
│  3. Importar productos/platillos                             │
│  4. Cargar ingredientes al almacen                           │
│  5. Crear usuarios (meseros, cocineros, cajeros)             │
│  6. Configurar impresion (termica, formato)                  │
└────────────────────────┬────────────────────────────────────┘
                         │
                         ▼
                   ┌───────────┐
                   │ DASHBOARD │
                   └─────┬─────┘
                         │
            ┌────────────┼────────────┐
            ▼            ▼            ▼
      ┌──────────┐ ┌──────────┐ ┌──────────┐
      │  ADMIN   │ │  MESERO  │ │ COCINERO │
      │(ve todo) │ │(mesas +  │ │(solo     │
      │          │ │ cocina)  │ │ cocina)  │
      └──────────┘ └──────────┘ └──────────┘
```

### 7.2 Flujo Operativo Diario (Ciclo Completo)

```
                    ┌──────────────────┐
                    │   INICIO DEL DIA │
                    └────────┬─────────┘
                             │
                             ▼
              ┌──────────────────────────────┐
              │      1. ABRIR CAJA           │
              │                              │
              │  Admin/Cajero ingresa:        │
              │  - Monto inicial (S/200)     │
              │  - Fecha/hora automatica      │
              │                              │
              │  Estado: CAJA ABIERTA        │
              └──────────────┬───────────────┘
                             │
                             ▼
              ┌──────────────────────────────┐
              │   2. VERIFICAR ALMACEN       │
              │                              │
              │  - Revisar stock de hoy      │
              │  - Alertas de ingredientes    │
              │    bajo minimo (rojo)         │
              │  - Registrar compras del dia  │
              │    (entrada de stock)         │
              └──────────────┬───────────────┘
                             │
         ┌───────────────────┼───────────────────┐
         │                   │                   │
         ▼                   ▼                   ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│  FLUJO MESAS    │ │FLUJO FACTURACION│ │  FLUJO COCINA   │
│  (Mesero)       │ │  (Cajero)       │ │  (Cocinero)     │
│                 │ │                 │ │                 │
│ Abrir mesa      │ │ Facturacion     │ │ Ver pedidos     │
│      │          │ │ rapida desde    │ │ enviados        │
│      ▼          │ │ mostrador       │ │      │          │
│ Agregar items   │ │      │          │ │      ▼          │
│      │          │ │      ▼          │ │ Preparando      │
│      ▼          │ │ Buscar cliente  │ │      │          │
│ Enviar a cocina─┼─┼──────┐         │ │      ▼          │
│      │          │ │      │         │ │ Marcar listo     │
│      ▼          │ │      ▼         │ │      │          │
│ Esperar listo   │ │ Agregar items  │ │      ▼          │
│      │          │ │      │         │ │ Entregado       │
│      ▼          │ │      ▼         │ │                 │
│ Facturar mesa ──┼─┤► GENERAR       │ │                 │
│                 │ │  FACTURA       │ │                 │
└─────────────────┘ │      │         │ └─────────────────┘
                    │      ▼         │
                    │ ┌────────────┐ │
                    │ │ AL FACTURAR│ │
                    │ │ SE DISPARA:│ │
                    │ └──┬───┬───┬─┘ │
                    └────┼───┼───┼───┘
                         │   │   │
            ┌────────────┘   │   └────────────┐
            ▼                ▼                ▼
┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
│ MOVIMIENTO CAJA │ │ DESCUENTO       │ │ DETALLE FACTURA │
│                 │ │ ALMACEN         │ │                 │
│ tipo: ingreso   │ │                 │ │ productos,      │
│ monto: total    │ │ Por cada item   │ │ cantidades,     │
│ metodo: efect/  │ │ vendido:        │ │ precios,        │
│ tarjeta/transf  │ │                 │ │ subtotales      │
│                 │ │ Buscar receta   │ │                 │
│ caja_movimientos│ │      │          │ │ detalle_facturas│
│                 │ │      ▼          │ │                 │
│                 │ │ Por ingrediente:│ │                 │
│                 │ │ stock -= cant   │ │                 │
│                 │ │ x qty vendida   │ │                 │
│                 │ │                 │ │                 │
│                 │ │ almacen_movim.  │ │                 │
│                 │ │ tipo: salida    │ │                 │
│                 │ │ motivo: venta   │ │                 │
└─────────────────┘ └─────────────────┘ └─────────────────┘
         │                   │
         │      ┌────────────┘
         │      │
         ▼      ▼
┌──────────────────────────────────────┐
│          FIN DEL DIA                 │
│                                      │
│       3. CERRAR CAJA                 │
│                                      │
│  Sistema calcula:                    │
│  - Total ingresos (facturas)         │
│  - Total egresos (retiros, gastos)   │
│  - Saldo esperado                    │
│                                      │
│  Cajero ingresa:                     │
│  - Conteo real de efectivo           │
│                                      │
│  Resultado:                          │
│  - Diferencia (sobrante/faltante)    │
│  - Estado: CAJA CERRADA             │
└──────────────────┬───────────────────┘
                   │
                   ▼
┌──────────────────────────────────────┐
│     4. GENERAR REPORTE PDF           │
│                                      │
│  ┌────────────────────────────────┐  │
│  │ REPORTE DIARIO - 16/03/2026   │  │
│  │                                │  │
│  │ CAJA                           │  │
│  │ Apertura: S/200.00             │  │
│  │ Ingresos: S/8,750.00          │  │
│  │ Egresos:  S/150.00            │  │
│  │ Cierre:   S/8,800.00          │  │
│  │ Diferencia: S/0.00            │  │
│  │                                │  │
│  │ VENTAS (250 clientes)          │  │
│  │ Facturas: 187                  │  │
│  │ Efectivo:      S/5,200.00     │  │
│  │ Tarjeta:       S/2,350.00     │  │
│  │ Transferencia: S/1,200.00     │  │
│  │                                │  │
│  │ COSTO POR PLATO               │  │
│  │ Ceviche Personal:             │  │
│  │   Vendidos: 45                 │  │
│  │   Ingreso:  S/1,575.00       │  │
│  │   Costo:    S/299.03          │  │
│  │   Margen:   81%               │  │
│  │                                │  │
│  │ Arroz con Mariscos:           │  │
│  │   Vendidos: 38                 │  │
│  │   Ingreso:  S/1,140.00       │  │
│  │   Costo:    S/380.00          │  │
│  │   Margen:   67%               │  │
│  │ ...                            │  │
│  │                                │  │
│  │ INVENTARIO DESCONTADO          │  │
│  │ Pescado:    -6,750g (45 cev)  │  │
│  │ Cebolla:    -11,250g          │  │
│  │ Limon:      -225 und          │  │
│  │ Arroz:      -9,500g           │  │
│  │ ...                            │  │
│  │                                │  │
│  │ ⚠ FALTANTES (stock < minimo)  │  │
│  │ Pescado bonito:  2,100g       │  │
│  │   (minimo: 10,000g)           │  │
│  │   Comprar: ~8kg para manana   │  │
│  │ Limon:  45 und                 │  │
│  │   (minimo: 200 und)           │  │
│  │   Comprar: ~200 und           │  │
│  │                                │  │
│  │ RESUMEN P&L DEL DIA           │  │
│  │ (+) Ingresos: S/8,750.00     │  │
│  │ (-) Costo ingredientes:       │  │
│  │     S/2,890.00                │  │
│  │ (-) Gastos fijos (prorrateo): │  │
│  │     S/433.33                  │  │
│  │ (=) GANANCIA NETA:            │  │
│  │     S/5,426.67                │  │
│  └────────────────────────────────┘  │
└──────────────────────────────────────┘
```

### 7.3 Flujo del Almacen

```
┌──────────────────────────────────────────────────────┐
│                    ALMACEN                            │
│              200+ ingredientes                        │
└───────────┬──────────┬──────────┬────────────────────┘
            │          │          │
            ▼          ▼          ▼
     ┌────────────┐ ┌──────┐ ┌──────────┐
     │  ENTRADAS  │ │SALIDA│ │  MERMA/  │
     │            │ │  S   │ │  AJUSTE  │
     │ - Compra   │ │      │ │          │
     │   proveedor│ │ Auto │ │ - Vencido│
     │ - Donacion │ │matic │ │ - Danado │
     │ - Devoluci.│ │ al   │ │ - Ajuste │
     │            │ │ fact.│ │   fisico │
     └──────┬─────┘ └──┬───┘ └────┬─────┘
            │          │          │
            ▼          ▼          ▼
     ┌─────────────────────────────────┐
     │     almacen_movimientos         │
     │                                 │
     │  tipo: entrada/salida/ajuste    │
     │  cantidad: +/-                  │
     │  motivo: compra/venta/merma     │
     │  costo_unitario al momento      │
     │  referencia: factura_id/etc     │
     └────────────────┬────────────────┘
                      │
                      ▼
     ┌─────────────────────────────────┐
     │     STOCK ACTUAL (real-time)    │
     │                                 │
     │  Pescado bonito:  8,500g  ✅    │
     │  Cebolla roja:   12,000g  ✅    │
     │  Limon:            180 und ⚠️   │
     │  Aji limo:          15 und 🔴   │
     │                                 │
     │  ✅ OK  ⚠️ Bajo  🔴 Critico    │
     └─────────────────────────────────┘
```

### 7.4 Flujo de Recetas (Producto → Ingredientes)

```
┌────────────────────────────────────────────────────┐
│              PRODUCTO: Ceviche Personal             │
│              Precio venta: S/35.00                  │
└─────────────────────────┬──────────────────────────┘
                          │
                          ▼
┌────────────────────────────────────────────────────┐
│                    RECETA                           │
│                                                    │
│  ┌─────────────────┬──────┬───────┬──────────┐    │
│  │ Ingrediente     │ Cant │ Uidad │ Costo    │    │
│  ├─────────────────┼──────┼───────┼──────────┤    │
│  │ Pescado bonito  │ 150  │ g     │ S/3.75   │    │
│  │ Cebolla roja    │ 250  │ g     │ S/0.75   │    │
│  │ Limon           │ 5    │ und   │ S/1.50   │    │
│  │ Sal             │ 5    │ g     │ S/0.005  │    │
│  │ Pimienta        │ 2    │ g     │ S/0.04   │    │
│  │ Aji limo        │ 3    │ und   │ S/0.60   │    │
│  │ Cilantro        │ 10   │ g     │ S/0.08   │    │
│  │ Ajo             │ 5    │ g     │ S/0.03   │    │
│  │ Camote          │ 100  │ g     │ S/0.30   │    │
│  │ Choclo          │ 80   │ g     │ S/0.40   │    │
│  │ Lechuga         │ 30   │ g     │ S/0.09   │    │
│  ├─────────────────┼──────┼───────┼──────────┤    │
│  │ COSTO TOTAL     │      │       │ S/7.55   │    │
│  │ PRECIO VENTA    │      │       │ S/35.00  │    │
│  │ MARGEN BRUTO    │      │       │ 78.4%    │    │
│  └─────────────────┴──────┴───────┴──────────┘    │
└────────────────────────────────────────────────────┘
         │
         │ Al vender 1 unidad:
         ▼
┌────────────────────────────────────────────────────┐
│         DESCUENTO AUTOMATICO DEL ALMACEN           │
│                                                    │
│  Pescado bonito:  stock -= 150g                    │
│  Cebolla roja:    stock -= 250g                    │
│  Limon:           stock -= 5 und                   │
│  Sal:             stock -= 5g                      │
│  ... (todos los ingredientes)                      │
│                                                    │
│  → almacen_movimientos (tipo: salida,              │
│    motivo: venta_platillo,                         │
│    referencia: factura #187)                        │
└────────────────────────────────────────────────────┘
```

### 7.5 Arquitectura SaaS Multi-Tenant

```
┌─────────────────────────────────────────────────────────────┐
│                     INTERNET                                 │
│                                                              │
│   elmarineritopicante.dignita.tech   pollerialnorte.dignita.tech  │
│   chifaeldragon.dignita.tech        cevicheriamolly.dignita.tech │
└──────────┬──────────────────────────────┬────────────────────┘
           │                              │
           ▼                              ▼
┌─────────────────────────────────────────────────────────────┐
│                   LOAD BALANCER / PROXY                      │
│                   (Nginx / Cloudflare)                       │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                  APLICACION NODE.JS                          │
│                  (dignita.tech core)                          │
│                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐         │
│  │ Middleware   │  │   Routes    │  │   Views     │         │
│  │ tenant_id   │  │  /api/*     │  │  EJS        │         │
│  │ auth        │  │  /mesas     │  │  templates  │         │
│  │ roles       │  │  /cocina    │  │             │         │
│  │             │  │  /caja      │  │             │         │
│  │ Cada request│  │  /almacen   │  │             │         │
│  │ lleva       │  │  /admin     │  │             │         │
│  │ tenant_id   │  │  /chat AI   │  │             │         │
│  └─────────────┘  └─────────────┘  └─────────────┘         │
└──────────────────────────┬──────────────────────────────────┘
                           │
                           ▼
┌─────────────────────────────────────────────────────────────┐
│                    BASE DE DATOS MySQL                        │
│                                                              │
│  Estrategia: SHARED DATABASE + tenant_id en cada tabla       │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ tenants                                              │   │
│  │ id │ nombre         │ subdominio  │ plan   │ activo  │   │
│  │ 1  │ El Marinerito Picante │ elmarineritopicante │ pro  │ 1  │   │
│  │ 2  │ Polleria El Norte     │ polleriaelnorte     │ free │ 1  │   │
│  │ 3  │ Chifa El Dragon       │ chifaeldragon       │ pro  │ 1  │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  Todas las tablas existentes agregan:                        │
│  tenant_id INT NOT NULL → FK a tenants(id)                  │
│                                                              │
│  productos(tenant_id, id, nombre, ...)                      │
│  mesas(tenant_id, id, numero, ...)                          │
│  facturas(tenant_id, id, total, ...)                        │
│  almacen_ingredientes(tenant_id, id, nombre, stock, ...)    │
│  cajas(tenant_id, id, monto_apertura, ...)                  │
│  usuarios(tenant_id, id, usuario, rol, ...)                 │
│                                                              │
│  Cada query: WHERE tenant_id = ? AND ...                    │
└─────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────┐
│                    PLANES SaaS                               │
│                                                              │
│  FREE (Gratis)                PRO (S/99/mes)                │
│  ─────────────                ──────────────                │
│  - 1 usuario                  - Usuarios ilimitados         │
│  - 10 mesas                   - Mesas ilimitadas            │
│  - 50 productos               - Productos ilimitados        │
│  - Sin almacen                - Almacen completo            │
│  - Sin recetas                - Recetas + costeo            │
│  - Sin caja                   - Caja registradora           │
│  - Sin P&L                    - P&L + Cashflow              │
│  - Sin reportes PDF           - Reportes PDF diarios        │
│  - Chat IA basico             - Chat IA con voz             │
│  - Sin redes sociales         - Redes + competencia         │
│  - Branding dignita.tech      - Logo propio                 │
│                                                              │
│  ENTERPRISE (Contactar)                                      │
│  ─────────────────────                                       │
│  - Todo de PRO                                               │
│  - Multi-sucursal                                            │
│  - API propia                                                │
│  - Soporte prioritario                                       │
│  - Integraciones personalizadas                              │
│  - Hosting dedicado                                          │
└─────────────────────────────────────────────────────────────┘
```

### 7.6 Flujo Completo de un Dia (Timeline)

```
06:00 ─── APERTURA ────────────────────────────────────
  │
  ├─► Admin abre caja (S/200 inicial)
  ├─► Revisa almacen: alertas de stock bajo
  ├─► Registra compras del dia (proveedor de pescado, verduras)
  │     → almacen_movimientos: entrada
  │
08:00 ─── SERVICIO INICIO ─────────────────────────────
  │
  ├─► Meseros abren mesas
  ├─► Clientes llegan → pedidos → envio a cocina
  ├─► Cocineros preparan → marcan listo
  ├─► Meseros entregan → facturan
  │     → Por cada factura:
  │       ├─► caja_movimientos: ingreso
  │       ├─► almacen: descuento ingredientes (receta x qty)
  │       └─► detalle_facturas: registro
  │
  │   (esto se repite ~250 veces al dia)
  │
16:00 ─── SERVICIO FIN ────────────────────────────────
  │
  ├─► Ultimas facturas
  ├─► Meseros liberan mesas
  │
17:00 ─── CIERRE ──────────────────────────────────────
  │
  ├─► Admin cierra caja
  │     ├─► Sistema calcula total esperado
  │     ├─► Cajero cuenta efectivo real
  │     └─► Diferencia registrada
  │
  ├─► Admin genera REPORTE PDF
  │     ├─► Resumen de caja
  │     ├─► Ventas por metodo
  │     ├─► Costo por plato (receta x vendidos)
  │     ├─► Margen bruto por plato
  │     ├─► Inventario descontado
  │     ├─► Lista de faltantes
  │     ├─► Proyeccion de compras para manana
  │     └─► P&L del dia (ingresos - costos - gastos fijos)
  │
  ├─► Admin consulta IA: "Como estuvo el dia?"
  │     → DIGNITA AI responde con resumen inteligente
  │
18:00 ─── FIN ─────────────────────────────────────────
```

---

**NOTA**: Este documento es solo planificacion. No se ejecutara hasta aprobacion.
Todos los cambios seran incrementales para no romper la funcionalidad existente.
