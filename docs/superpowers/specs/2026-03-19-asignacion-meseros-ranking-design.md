# Asignación de Meseros a Mesas + Ranking de Productividad

**Fecha:** 2026-03-19
**Estado:** Aprobado

## Resumen

Sistema para asignar mesas a meseros al abrir caja (inicio de turno), editable durante el turno, con ranking de productividad (mesas atendidas y productos servidos). Las asignaciones se limpian automáticamente al cerrar caja.

## Reglas de negocio

- Un mesero puede tener múltiples mesas asignadas
- Una mesa solo puede tener un mesero asignado a la vez
- El mesero puede servir cualquier producto disponible en la carta (sin restricción)
- La asignación se hace al abrir caja y es editable mientras la caja esté abierta
- Al cerrar caja, todas las asignaciones se borran automáticamente
- La asignación es opcional: se puede abrir caja sin asignar mesas
- El ranking cuenta productos pedidos en las mesas del mesero (no qué productos sirvió personalmente)

## Modelo de datos

### Tablas existentes (sin cambios)

- `usuarios` — campo `rol` incluye 'mesero'
- `pedidos` — referencia `mesa_id`
- `pedido_items` — items de cada pedido (cantidad de productos)
- `cajas` — sesiones de caja con `created_at` para filtrar por fecha

### Migración pendiente (ya existe)

Archivo: `migrations/add_mesero_asignado_to_mesas.sql`

Agrega a tabla `mesas`:
- `mesero_asignado_id` (INTEGER, FK a usuarios.id, nullable)
- `mesero_asignado_nombre` (VARCHAR 100, nullable)

No se necesitan tablas nuevas.

## Cambios por módulo

### 1. Abrir Caja (views/caja.ejs, routes/caja.js)

**Formulario de apertura — nueva sección "Asignar mesas a meseros":**

- Se muestra debajo del campo "Turno", antes del botón "Abrir Caja"
- Lista todos los usuarios con rol='mesero' y activo=1
- Por cada mesero: su nombre y checkboxes con todas las mesas
- Una mesa solo puede estar checked en un mesero (radio-group por mesa)
- Si el usuario no asigna ninguna mesa, la caja se abre normalmente
- Al submit, se ejecuta la asignación en batch: `UPDATE mesas SET mesero_asignado_id=?, mesero_asignado_nombre=? WHERE id=?` por cada mesa seleccionada

**Endpoint modificado:** `POST /api/caja/abrir`
- Recibe campo adicional `asignaciones`: array de `{ mesa_id, mesero_id }`
- Después de crear la caja, aplica las asignaciones
- Limpia asignaciones previas antes de aplicar nuevas

### 2. Caja Abierta — nueva sección "Meseros en turno" (views/caja.ejs, routes/caja.js)

**Ubicación:** entre los botones de acción (Registrar ingreso/egreso/Cerrar caja) y la tabla de Movimientos.

**Cards de meseros:**
- Una card por mesero que tenga al menos una mesa asignada
- Muestra: nombre, lista de mesas asignadas (números), cantidad de productos servidos hoy
- Productos servidos = `SUM(pedido_items.cantidad)` de pedidos de sus mesas asignadas donde `pedidos.created_at` es del día actual y la caja está abierta

**Botón "Editar" (esquina superior derecha de la sección):**
- Abre modal con los mismos checkboxes que el formulario de apertura
- Precargado con las asignaciones actuales
- Al guardar, actualiza asignaciones en batch

**Endpoint nuevo:** `POST /api/caja/reasignar-mesas`
- Recibe `asignaciones`: array de `{ mesa_id, mesero_id }`
- Limpia todas las asignaciones actuales, aplica las nuevas
- Requiere caja abierta

**Ranking del día:**
- Tabla debajo de las cards
- Columnas: #, Mesero, Mesas, Productos
- Ordenado por productos servidos desc
- Datos del día actual (filtro por fecha de pedidos)

**Enlace "Ver historial completo":**
- Abre modal con filtros de periodo: Hoy, Esta semana, Este mes, Todo
- Misma tabla pero con datos agregados del periodo seleccionado
- Columna adicional: Promedio productos/mesa
- Datos calculados con query:
  ```sql
  SELECT u.nombre,
         COUNT(DISTINCT p.mesa_id) as mesas_atendidas,
         SUM(pi.cantidad) as productos_servidos
  FROM pedidos p
  JOIN pedido_items pi ON pi.pedido_id = p.id
  JOIN usuarios u ON u.id = p.mesero_id_snapshot
  WHERE p.created_at BETWEEN ? AND ?
  GROUP BY u.id
  ORDER BY productos_servidos DESC
  ```

**Nota sobre historial:** Para que el historial funcione después de cerrar caja (cuando se borran asignaciones), se necesita guardar una snapshot del mesero en el pedido. Opciones:
- Usar campo existente si existe en `pedidos`
- O agregar `mesero_id_snapshot` a `pedidos` que se llena al momento de crear el pedido basándose en `mesas.mesero_asignado_id`

### 3. Cerrar Caja (routes/caja.js)

**Endpoint modificado:** `POST /api/caja/cerrar`
- Después del cierre exitoso, ejecutar:
  ```sql
  UPDATE mesas SET mesero_asignado_id = NULL, mesero_asignado_nombre = NULL
  ```
- Esto ya se ejecuta al final, no requiere confirmación adicional

### 4. Vista Mesas (views/mesas.ejs, public/js/mesas.js)

**Arreglar botón "Asignar mesero":**
- Ya está programado en frontend (SweetAlert + dropdown + POST)
- Verificar que la migración esté aplicada para que el endpoint funcione
- El botón permite reasignación individual rápida sin ir a Caja
- Accesible solo para rol administrador y cajero

### 5. Vista Usuarios (views/usuarios.ejs)

**Solo lectura — mostrar mesas asignadas:**
- En la card/fila de cada usuario con rol='mesero'
- Si hay caja abierta: mostrar badges con los números de mesa asignadas
- Si no hay caja abierta: mostrar "Sin turno activo"
- No se edita desde aquí (se edita desde Caja o Mesas)
- Query: `SELECT numero FROM mesas WHERE mesero_asignado_id = ?`

### 6. Endpoint de datos para ranking (routes/caja.js)

**Nuevo:** `GET /api/caja/ranking-meseros?periodo=hoy|semana|mes|todo`

Response:
```json
{
  "ranking": [
    {
      "mesero_id": 1,
      "nombre": "Juan Pérez",
      "mesas_atendidas": 5,
      "productos_servidos": 23,
      "promedio_por_mesa": 4.6
    }
  ],
  "periodo": "hoy"
}
```

## Permisos

- **Administrador y Cajero:** pueden asignar/reasignar mesas a meseros, ver ranking
- **Mesero:** puede ver sus propias mesas asignadas (ya existe filtro "Mis mesas")
- **Cocinero:** no tiene acceso a esta funcionalidad

## Flujo de usuario completo

1. Cajero/Admin abre caja → ve sección de asignación → checkea mesas por mesero → Abrir Caja
2. Durante el turno: ve cards de meseros con sus mesas y productos en la vista Caja
3. Si necesita reasignar: click "Editar" → modal → cambia checkboxes → Guardar
4. También puede reasignar mesa individual desde vista Mesas → botón "Asignar mesero"
5. Ve ranking del día en tiempo real en Caja
6. Puede ver historial completo con filtros de periodo
7. Al cerrar caja: asignaciones se borran, datos de ranking quedan en historial

## Archivos a modificar

- `routes/caja.js` — nuevos endpoints y lógica de asignación
- `views/caja.ejs` — sección meseros, ranking, modal editar, formulario apertura
- `routes/mesas.js` — verificar endpoint asignar-mesero funcione
- `public/js/mesas.js` — verificar handler botón asignar
- `views/usuarios.ejs` — mostrar mesas asignadas (solo lectura)
- `routes/usuarios.js` — incluir mesas asignadas en query
- `database.sql` — aplicar migración mesero_asignado
