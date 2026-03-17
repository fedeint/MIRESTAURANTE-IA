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

**Vista**: `/almacen` - CRUD de ingredientes con stock, alertas de minimo, movimientos

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

**Concepto**: P&L, Cashflow, gastos fijos, reportes financieros. Basado en tu Excel `_P&L - Cashflow.xlsx`.

**Estructura del Excel actual (2 hojas)**:
- **Cashflows**: Entradas (capital, ventas, otros ingresos) vs Salidas (compras, servicios, marketing, sueldos, inmovilizado, legal, otros) por mes
- **PyG**: P&L anual (Ventas - COGS = Margen Bruto - Gastos Admin - Sueldos = EBITDA - Amort - Provisiones = EBIT...)

**Tablas nuevas**:
```sql
CREATE TABLE gastos_categorias (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(100) NOT NULL,    -- 'Compras existencias', 'Sueldos', 'Alquiler', 'Marketing', etc.
    tipo ENUM('fijo','variable') DEFAULT 'variable',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE gastos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    categoria_id INT NOT NULL,
    concepto VARCHAR(200) NOT NULL,
    monto DECIMAL(10,2) NOT NULL,
    fecha DATE NOT NULL,
    periodo_mes INT NULL,            -- 1-12
    periodo_anio INT NULL,           -- 2026
    recurrente TINYINT(1) DEFAULT 0,
    notas TEXT NULL,
    usuario_id INT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (categoria_id) REFERENCES gastos_categorias(id)
);
```

**Vistas**:
- `/administracion` → Dashboard financiero: ingresos vs egresos, P&L mensual, cashflow
- `/administracion/gastos` → CRUD de gastos fijos/variables
- `/administracion/reportes` → Generar PDF con reporte diario/mensual

---

### 2.5 REPORTE PDF DIARIO

**Concepto**: Al final del dia, generar un PDF descargable con:

1. **Resumen de caja**: Apertura, cierre, diferencia
2. **Ventas del dia**: Total facturas, por metodo de pago
3. **Costo de ingredientes usados**: Basado en recetas x cantidades vendidas
4. **Margen bruto por plato**: Precio venta - costo ingredientes
5. **Descuento de inventario**: Que se gasto del almacen
6. **Lista de faltantes**: Ingredientes que bajaron del stock minimo
7. **Proyeccion de compras**: Basado en flujo de 250 clientes/dia, cuanto necesitas comprar manana

**Libreria**: `pdfkit` o `puppeteer` para generar PDF desde HTML

**Ruta**: `GET /api/reportes/diario?fecha=2026-03-16` → descarga PDF

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
  - Caja          ← NUEVO
  - Almacen       ← NUEVO

Gestion
  - Productos (+ Recetas)
  - Clientes
  - Ranking

Administracion    ← REEMPLAZA Marketing
  - P&L / Cashflow
  - Gastos
  - Reportes (PDF)

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
2. CRUD de ingredientes (`/almacen`)
3. Importar 200+ ingredientes iniciales
4. Agregar recetas a productos (`/productos` → tab receta)
5. Descuento automatico al facturar

### Fase 2: Caja Registradora (1 semana)
1. Crear tablas de caja
2. Vista `/caja` con apertura/cierre
3. Integrar con facturacion (movimientos automaticos)
4. Reporte de cierre de caja

### Fase 3: Administracion / P&L (1 semana)
1. Crear tablas de gastos
2. Vista `/administracion` con P&L
3. CRUD de gastos fijos/variables
4. Cashflow mensual basado en Excel

### Fase 4: Reporte PDF diario (3-5 dias)
1. Instalar pdfkit o puppeteer
2. Endpoint de generacion de PDF
3. Integrar todos los datos (caja + almacen + ventas + costos)
4. Lista de faltantes con proyeccion

### Fase 5: Voz en IA (2-3 dias)
1. Agregar Web Speech API al chat
2. Boton de microfono
3. Lectura de respuestas en voz alta
4. Toggle de voz

### Fase 6: SaaS Multi-tenant (futuro)
1. Tabla `tenants` (cada restaurante es un tenant)
2. Subdominio por restaurante (restaurante1.dignita.tech)
3. Aislamiento de datos por tenant_id
4. Sistema de planes y facturacion

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

**NOTA**: Este documento es solo planificacion. No se ejecutara hasta aprobacion.
Todos los cambios seran incrementales para no romper la funcionalidad existente.
