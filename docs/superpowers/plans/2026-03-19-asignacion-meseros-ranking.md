# Asignacion de Meseros a Mesas + Ranking Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Permitir asignar mesas a meseros al abrir caja, editar asignaciones durante el turno, limpiar al cerrar caja, y mostrar ranking de productividad (mesas atendidas + productos servidos).

**Architecture:** Modificar el flujo de apertura/cierre de caja para incluir asignaciones de mesa-mesero. Agregar seccion visual en caja abierta con cards de meseros y ranking. Usar tablas existentes (mesas.mesero_asignado_id, pedidos, pedido_items) sin tablas nuevas.

**Tech Stack:** Node.js/Express, MySQL, EJS templates, Bootstrap, SweetAlert2, vanilla JS con fetch API.

**Spec:** `docs/superpowers/specs/2026-03-19-asignacion-meseros-ranking-design.md`

---

## File Structure

| File | Action | Responsibility |
|------|--------|----------------|
| `migrations/add_mesero_asignado_to_mesas.sql` | Exists | Agregar columnas mesero_asignado_id/nombre a mesas |
| `routes/caja.js` | Modify | Endpoints: abrir (con asignaciones), cerrar (limpiar), reasignar, ranking |
| `views/caja.ejs` | Modify | UI: seccion asignacion en abrir, cards meseros, ranking, modal editar |
| `routes/mesas.js` | Verify | Verificar endpoint asignar-mesero funcione con columnas nuevas |
| `views/usuarios.ejs` | Modify | Mostrar mesas asignadas (solo lectura) en cards de meseros |
| `routes/usuarios.js` | Modify | Incluir mesas asignadas en query de usuarios |

---

## Task 1: Aplicar migracion de base de datos

**Files:**
- Execute: `migrations/add_mesero_asignado_to_mesas.sql`

- [ ] **Step 1: Verificar estado actual de la tabla mesas**

```bash
# Conectar a la DB y verificar si las columnas ya existen
mysql -u root -p -e "DESCRIBE mesas;" restaurant_db
```

Si `mesero_asignado_id` NO aparece, continuar al step 2. Si ya existe, saltar al Task 2.

- [ ] **Step 2: Ejecutar migracion**

```bash
mysql -u root -p restaurant_db < migrations/add_mesero_asignado_to_mesas.sql
```

El archivo contiene:
```sql
ALTER TABLE mesas ADD COLUMN IF NOT EXISTS mesero_asignado_id INTEGER REFERENCES usuarios(id);
ALTER TABLE mesas ADD COLUMN IF NOT EXISTS mesero_asignado_nombre VARCHAR(100);
```

- [ ] **Step 3: Verificar columnas creadas**

```bash
mysql -u root -p -e "DESCRIBE mesas;" restaurant_db
```

Expected: `mesero_asignado_id` (int, NULL) y `mesero_asignado_nombre` (varchar(100), NULL) aparecen.

- [ ] **Step 4: Commit**

```bash
git add -A && git commit -m "chore: verificar migracion mesero_asignado aplicada"
```

---

## Task 2: Endpoint POST /api/caja/abrir con asignaciones

**Files:**
- Modify: `routes/caja.js` (lineas ~50-79, endpoint POST /api/caja/abrir)

- [ ] **Step 1: Modificar endpoint abrir caja para recibir asignaciones**

En `routes/caja.js`, encontrar el endpoint `POST /api/caja/abrir` (aprox linea 50). Despues de la linea que crea el movimiento fondo_inicial y antes del `res.status(201).json(...)`, agregar:

```javascript
    // Asignar mesas a meseros
    const asignaciones = req.body.asignaciones; // [{ mesa_id, mesero_id }]
    if (asignaciones && Array.isArray(asignaciones) && asignaciones.length > 0) {
      // Limpiar asignaciones previas
      await db.query(`UPDATE mesas SET mesero_asignado_id = NULL, mesero_asignado_nombre = NULL WHERE tenant_id = ?`, [tid]);
      // Aplicar nuevas asignaciones
      for (const a of asignaciones) {
        if (!a.mesa_id || !a.mesero_id) continue;
        const [[mesero]] = await db.query(`SELECT id, nombre FROM usuarios WHERE id = ? AND activo = 1`, [a.mesero_id]);
        if (mesero) {
          await db.query(`UPDATE mesas SET mesero_asignado_id = ?, mesero_asignado_nombre = ? WHERE id = ? AND tenant_id = ?`,
            [mesero.id, mesero.nombre, a.mesa_id, tid]);
        }
      }
    }
```

- [ ] **Step 2: Verificar que el servidor inicia sin errores**

```bash
npm start
```

Probar manualmente: abrir caja sin asignaciones debe funcionar igual que antes.

- [ ] **Step 3: Commit**

```bash
git add routes/caja.js && git commit -m "feat: endpoint abrir caja acepta asignaciones de mesa-mesero"
```

---

## Task 3: Endpoint POST /api/caja/reasignar-mesas

**Files:**
- Modify: `routes/caja.js`

- [ ] **Step 1: Agregar endpoint de reasignacion**

Agregar ANTES del `module.exports` en `routes/caja.js`:

```javascript
// Reasignar mesas a meseros (caja abierta)
router.post('/api/caja/reasignar-mesas', async (req, res) => {
  try {
    const tid = req.session?.tenant_id || 1;
    // Verificar caja abierta
    const [[caja]] = await db.query(`SELECT id FROM cajas WHERE estado = 'abierta' AND tenant_id = ? LIMIT 1`, [tid]);
    if (!caja) return res.status(400).json({ error: 'No hay caja abierta' });

    const asignaciones = req.body.asignaciones; // [{ mesa_id, mesero_id }]
    if (!asignaciones || !Array.isArray(asignaciones)) {
      return res.status(400).json({ error: 'Formato invalido' });
    }

    // Limpiar todas las asignaciones
    await db.query(`UPDATE mesas SET mesero_asignado_id = NULL, mesero_asignado_nombre = NULL WHERE tenant_id = ?`, [tid]);

    // Aplicar nuevas
    for (const a of asignaciones) {
      if (!a.mesa_id || !a.mesero_id) continue;
      const [[mesero]] = await db.query(`SELECT id, nombre FROM usuarios WHERE id = ? AND activo = 1`, [a.mesero_id]);
      if (mesero) {
        await db.query(`UPDATE mesas SET mesero_asignado_id = ?, mesero_asignado_nombre = ? WHERE id = ? AND tenant_id = ?`,
          [mesero.id, mesero.nombre, a.mesa_id, tid]);
      }
    }

    res.json({ message: 'Asignaciones actualizadas' });
  } catch (err) {
    console.error('Error reasignar mesas:', err);
    res.status(500).json({ error: 'Error al reasignar mesas' });
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add routes/caja.js && git commit -m "feat: endpoint reasignar mesas a meseros durante turno"
```

---

## Task 4: Limpiar asignaciones al cerrar caja

**Files:**
- Modify: `routes/caja.js` (endpoint POST /api/caja/cerrar, aprox linea 81)

- [ ] **Step 1: Agregar limpieza de asignaciones en cerrar caja**

En el endpoint `POST /api/caja/cerrar`, justo ANTES del `res.json(...)` final, agregar:

```javascript
    // Limpiar asignaciones de meseros al cerrar caja
    await db.query(`UPDATE mesas SET mesero_asignado_id = NULL, mesero_asignado_nombre = NULL WHERE tenant_id = ?`, [tid]);
```

- [ ] **Step 2: Commit**

```bash
git add routes/caja.js && git commit -m "feat: limpiar asignaciones mesero al cerrar caja"
```

---

## Task 5: Endpoint GET /api/caja/ranking-meseros

**Files:**
- Modify: `routes/caja.js`

- [ ] **Step 1: Agregar endpoint de ranking**

Agregar en `routes/caja.js`:

```javascript
// Ranking de meseros por productividad
router.get('/api/caja/ranking-meseros', async (req, res) => {
  try {
    const tid = req.session?.tenant_id || 1;
    const periodo = req.query.periodo || 'hoy'; // hoy, semana, mes, todo

    let dateFilter = '';
    if (periodo === 'hoy') {
      dateFilter = `AND DATE(p.created_at) = CURDATE()`;
    } else if (periodo === 'semana') {
      dateFilter = `AND p.created_at >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)`;
    } else if (periodo === 'mes') {
      dateFilter = `AND p.created_at >= DATE_SUB(CURDATE(), INTERVAL 30 DAY)`;
    }
    // 'todo' = sin filtro de fecha

    const [ranking] = await db.query(`
      SELECT
        m.mesero_asignado_id as mesero_id,
        COALESCE(m.mesero_asignado_nombre, u.nombre) as nombre,
        COUNT(DISTINCT p.mesa_id) as mesas_atendidas,
        COALESCE(SUM(pi.cantidad), 0) as productos_servidos
      FROM pedidos p
      JOIN mesas m ON m.id = p.mesa_id
      JOIN pedido_items pi ON pi.pedido_id = p.id
      LEFT JOIN usuarios u ON u.id = m.mesero_asignado_id
      WHERE m.mesero_asignado_id IS NOT NULL
        AND m.tenant_id = ?
        AND pi.estado NOT IN ('cancelado', 'rechazado')
        ${dateFilter}
      GROUP BY m.mesero_asignado_id, nombre
      ORDER BY productos_servidos DESC
    `, [tid]);

    // Calcular promedio
    const rankingConPromedio = ranking.map(r => ({
      ...r,
      productos_servidos: Number(r.productos_servidos),
      promedio_por_mesa: r.mesas_atendidas > 0
        ? Math.round((Number(r.productos_servidos) / r.mesas_atendidas) * 10) / 10
        : 0
    }));

    res.json({ ranking: rankingConPromedio, periodo });
  } catch (err) {
    console.error('Error ranking meseros:', err);
    res.status(500).json({ error: 'Error al obtener ranking' });
  }
});
```

- [ ] **Step 2: Commit**

```bash
git add routes/caja.js && git commit -m "feat: endpoint ranking meseros con filtro por periodo"
```

---

## Task 6: Pasar datos de meseros y mesas al view de caja

**Files:**
- Modify: `routes/caja.js` (GET /caja, aprox linea 11)

- [ ] **Step 1: Agregar queries de meseros y mesas al render**

En el endpoint `GET /caja` (o `GET /`), agregar queries ANTES del `res.render(...)`:

```javascript
    // Meseros activos
    const [meseros] = await db.query(`SELECT id, nombre, usuario FROM usuarios WHERE rol = 'mesero' AND activo = 1 AND tenant_id = ? ORDER BY nombre`, [tid]);

    // Todas las mesas con asignacion
    const [mesasAll] = await db.query(`SELECT id, numero, descripcion, mesero_asignado_id, mesero_asignado_nombre FROM mesas WHERE tenant_id = ? ORDER BY numero`, [tid]);

    // Productos servidos hoy por mesero (para cards)
    const [productosPorMesero] = await db.query(`
      SELECT m.mesero_asignado_id as mesero_id, COALESCE(SUM(pi.cantidad), 0) as productos
      FROM pedidos p
      JOIN mesas m ON m.id = p.mesa_id
      JOIN pedido_items pi ON pi.pedido_id = p.id
      WHERE m.mesero_asignado_id IS NOT NULL
        AND m.tenant_id = ?
        AND DATE(p.created_at) = CURDATE()
        AND pi.estado NOT IN ('cancelado', 'rechazado')
      GROUP BY m.mesero_asignado_id
    `, [tid]);
```

Agregar al objeto `res.render('caja', { ... })`:

```javascript
    meseros,
    mesasAll,
    productosPorMesero,
```

- [ ] **Step 2: Commit**

```bash
git add routes/caja.js && git commit -m "feat: pasar datos meseros/mesas/productos al view caja"
```

---

## Task 7: UI - Seccion asignacion en formulario Abrir Caja

**Files:**
- Modify: `views/caja.ejs` (lineas ~19-51, formulario abrir caja)

- [ ] **Step 1: Agregar seccion de asignacion de mesas al formulario de apertura**

En `views/caja.ejs`, dentro del formulario `#formAbrirCaja`, DESPUES del select de turno y ANTES del boton submit, agregar:

```html
                        <!-- Asignar mesas a meseros -->
                        <% if (meseros && meseros.length > 0 && mesasAll && mesasAll.length > 0) { %>
                        <hr>
                        <h6 class="mb-3"><i class="bi bi-people me-2"></i>Asignar mesas a meseros</h6>
                        <div class="asignacion-mesas-container">
                          <% meseros.forEach(function(mesero) { %>
                          <div class="mb-3 p-2 rounded" style="background: rgba(0,0,0,0.02); border: 1px solid #eee;">
                            <div class="fw-bold small mb-2"><i class="bi bi-person me-1"></i><%= mesero.nombre || mesero.usuario %></div>
                            <div class="d-flex flex-wrap gap-1">
                              <% mesasAll.forEach(function(mesa) { %>
                              <label class="btn btn-sm btn-outline-secondary mesa-check-label" style="font-size: 0.75rem; padding: 2px 8px;">
                                <input type="checkbox" class="mesa-asign-check d-none"
                                  data-mesa-id="<%= mesa.id %>"
                                  data-mesero-id="<%= mesero.id %>"
                                  data-mesa-numero="<%= mesa.numero %>">
                                <%= mesa.numero %>
                              </label>
                              <% }); %>
                            </div>
                          </div>
                          <% }); %>
                        </div>
                        <% } %>
```

- [ ] **Step 2: Agregar JS para exclusividad (una mesa = un mesero) y envio**

Despues del bloque de asignacion, agregar script:

```html
<script>
document.addEventListener('DOMContentLoaded', function() {
  // Exclusividad: una mesa solo puede estar asignada a un mesero
  document.querySelectorAll('.mesa-asign-check').forEach(function(cb) {
    cb.addEventListener('change', function() {
      if (this.checked) {
        var mesaId = this.dataset.mesaId;
        document.querySelectorAll('.mesa-asign-check[data-mesa-id="' + mesaId + '"]').forEach(function(other) {
          if (other !== cb) {
            other.checked = false;
            other.closest('.mesa-check-label').classList.remove('btn-primary');
            other.closest('.mesa-check-label').classList.add('btn-outline-secondary');
          }
        });
        this.closest('.mesa-check-label').classList.remove('btn-outline-secondary');
        this.closest('.mesa-check-label').classList.add('btn-primary');
      } else {
        this.closest('.mesa-check-label').classList.remove('btn-primary');
        this.closest('.mesa-check-label').classList.add('btn-outline-secondary');
      }
    });
  });
});
</script>
```

- [ ] **Step 3: Modificar el submit del formulario abrir caja**

Encontrar el fetch a `/api/caja/abrir` en el JS existente. Modificar el body para incluir asignaciones:

```javascript
// Recopilar asignaciones
var asignaciones = [];
document.querySelectorAll('.mesa-asign-check:checked').forEach(function(cb) {
  asignaciones.push({ mesa_id: parseInt(cb.dataset.mesaId), mesero_id: parseInt(cb.dataset.meseroId) });
});

// Agregar al body del fetch
body: JSON.stringify({
  monto_apertura: ...,
  turno_id: ...,
  asignaciones: asignaciones
})
```

- [ ] **Step 4: Commit**

```bash
git add views/caja.ejs && git commit -m "feat: UI asignacion de mesas a meseros en formulario abrir caja"
```

---

## Task 8: UI - Seccion "Meseros en turno" en Caja Abierta

**Files:**
- Modify: `views/caja.ejs` (seccion caja abierta, despues de botones de accion ~linea 112)

- [ ] **Step 1: Agregar seccion meseros con cards y ranking**

Despues de los 3 botones de accion (Registrar ingreso/egreso/Cerrar caja) y ANTES de la seccion Movimientos, agregar:

```html
        <!-- Meseros en turno -->
        <%
          var meserosConMesas = [];
          if (meseros && mesasAll) {
            meseros.forEach(function(m) {
              var misMesas = mesasAll.filter(function(mesa) { return mesa.mesero_asignado_id === m.id; });
              if (misMesas.length > 0) {
                var prodData = productosPorMesero ? productosPorMesero.find(function(p) { return p.mesero_id === m.id; }) : null;
                meserosConMesas.push({
                  id: m.id,
                  nombre: m.nombre || m.usuario,
                  mesas: misMesas,
                  productos: prodData ? Number(prodData.productos) : 0
                });
              }
            });
            meserosConMesas.sort(function(a, b) { return b.productos - a.productos; });
          }
        %>
        <% if (meserosConMesas.length > 0) { %>
        <div class="card shadow-sm mb-4">
          <div class="card-body">
            <div class="d-flex justify-content-between align-items-center mb-3">
              <h5 class="mb-0"><i class="bi bi-people me-2"></i>Meseros en turno</h5>
              <button class="btn btn-sm btn-outline-primary" id="btnEditarAsignaciones">
                <i class="bi bi-pencil me-1"></i>Editar
              </button>
            </div>

            <!-- Cards de meseros -->
            <div class="row g-2 mb-3">
              <% meserosConMesas.forEach(function(mc) { %>
              <div class="col-md-4 col-sm-6">
                <div class="p-3 rounded" style="background: #f8f9fa; border: 1px solid #e9ecef;">
                  <div class="fw-bold"><i class="bi bi-person-badge me-1"></i><%= mc.nombre %></div>
                  <div class="text-muted small mt-1">
                    <% mc.mesas.forEach(function(mesa, i) { %>
                      <span class="badge bg-light text-dark border me-1">Mesa <%= mesa.numero %></span>
                    <% }); %>
                  </div>
                  <div class="mt-2">
                    <span class="badge bg-primary"><%= mc.productos %> productos</span>
                  </div>
                </div>
              </div>
              <% }); %>
            </div>

            <!-- Ranking del dia -->
            <h6 class="mt-3"><i class="bi bi-trophy me-2"></i>Ranking del dia</h6>
            <div class="table-responsive">
              <table class="table table-sm table-hover mb-0">
                <thead><tr>
                  <th>#</th><th>Mesero</th><th>Mesas</th><th>Productos</th>
                </tr></thead>
                <tbody>
                  <% meserosConMesas.forEach(function(mc, idx) { %>
                  <tr>
                    <td><%= idx + 1 %></td>
                    <td><%= mc.nombre %></td>
                    <td><%= mc.mesas.length %></td>
                    <td><strong><%= mc.productos %></strong></td>
                  </tr>
                  <% }); %>
                </tbody>
              </table>
            </div>

            <div class="text-end mt-2">
              <button class="btn btn-sm btn-link text-decoration-none" id="btnVerHistorialRanking">
                <i class="bi bi-clock-history me-1"></i>Ver historial completo
              </button>
            </div>
          </div>
        </div>
        <% } %>
```

- [ ] **Step 2: Commit**

```bash
git add views/caja.ejs && git commit -m "feat: seccion meseros en turno con cards y ranking del dia"
```

---

## Task 9: Modal Editar Asignaciones + Modal Historial

**Files:**
- Modify: `views/caja.ejs`

- [ ] **Step 1: Agregar modal de edicion de asignaciones**

Agregar al final de la seccion de caja abierta (antes del cierre `<% } %>` de `cajaAbierta`):

```html
        <!-- Modal Editar Asignaciones -->
        <div class="modal fade" id="modalEditarAsignaciones" tabindex="-1">
          <div class="modal-dialog modal-lg">
            <div class="modal-content">
              <div class="modal-header">
                <h5 class="modal-title"><i class="bi bi-pencil me-2"></i>Editar asignaciones de mesas</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
              </div>
              <div class="modal-body">
                <div id="editAsignacionesBody">
                  <% meseros.forEach(function(mesero) { %>
                  <div class="mb-3 p-2 rounded" style="background: rgba(0,0,0,0.02); border: 1px solid #eee;">
                    <div class="fw-bold small mb-2"><i class="bi bi-person me-1"></i><%= mesero.nombre || mesero.usuario %></div>
                    <div class="d-flex flex-wrap gap-1">
                      <% mesasAll.forEach(function(mesa) { %>
                      <label class="btn btn-sm <%= mesa.mesero_asignado_id === mesero.id ? 'btn-primary' : 'btn-outline-secondary' %> edit-mesa-check-label" style="font-size: 0.75rem; padding: 2px 8px;">
                        <input type="checkbox" class="edit-mesa-check d-none"
                          data-mesa-id="<%= mesa.id %>"
                          data-mesero-id="<%= mesero.id %>"
                          <%= mesa.mesero_asignado_id === mesero.id ? 'checked' : '' %>>
                        <%= mesa.numero %>
                      </label>
                      <% }); %>
                    </div>
                  </div>
                  <% }); %>
                </div>
              </div>
              <div class="modal-footer">
                <button type="button" class="btn btn-secondary" data-bs-dismiss="modal">Cancelar</button>
                <button type="button" class="btn btn-primary" id="btnGuardarAsignaciones">
                  <i class="bi bi-check-lg me-1"></i>Guardar
                </button>
              </div>
            </div>
          </div>
        </div>

        <!-- Modal Historial Ranking -->
        <div class="modal fade" id="modalHistorialRanking" tabindex="-1">
          <div class="modal-dialog modal-lg">
            <div class="modal-content">
              <div class="modal-header">
                <h5 class="modal-title"><i class="bi bi-trophy me-2"></i>Historial de Meseros</h5>
                <button type="button" class="btn-close" data-bs-dismiss="modal"></button>
              </div>
              <div class="modal-body">
                <div class="btn-group mb-3" role="group">
                  <button class="btn btn-sm btn-primary ranking-periodo" data-periodo="hoy">Hoy</button>
                  <button class="btn btn-sm btn-outline-secondary ranking-periodo" data-periodo="semana">Semana</button>
                  <button class="btn btn-sm btn-outline-secondary ranking-periodo" data-periodo="mes">Mes</button>
                  <button class="btn btn-sm btn-outline-secondary ranking-periodo" data-periodo="todo">Todo</button>
                </div>
                <div class="table-responsive">
                  <table class="table table-sm table-hover">
                    <thead><tr>
                      <th>#</th><th>Mesero</th><th>Mesas</th><th>Productos</th><th>Prom/mesa</th>
                    </tr></thead>
                    <tbody id="historialRankingBody">
                      <tr><td colspan="5" class="text-center text-muted">Cargando...</td></tr>
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </div>
        </div>
```

- [ ] **Step 2: Agregar JS para los modals**

Agregar al final del bloque `<script>` de caja abierta:

```javascript
// Editar asignaciones
document.getElementById('btnEditarAsignaciones')?.addEventListener('click', function() {
  new bootstrap.Modal(document.getElementById('modalEditarAsignaciones')).show();
});

// Exclusividad en modal editar (misma logica que abrir)
document.querySelectorAll('.edit-mesa-check').forEach(function(cb) {
  cb.addEventListener('change', function() {
    if (this.checked) {
      var mesaId = this.dataset.mesaId;
      document.querySelectorAll('.edit-mesa-check[data-mesa-id="' + mesaId + '"]').forEach(function(other) {
        if (other !== cb) {
          other.checked = false;
          other.closest('.edit-mesa-check-label').classList.remove('btn-primary');
          other.closest('.edit-mesa-check-label').classList.add('btn-outline-secondary');
        }
      });
      this.closest('.edit-mesa-check-label').classList.remove('btn-outline-secondary');
      this.closest('.edit-mesa-check-label').classList.add('btn-primary');
    } else {
      this.closest('.edit-mesa-check-label').classList.remove('btn-primary');
      this.closest('.edit-mesa-check-label').classList.add('btn-outline-secondary');
    }
  });
});

// Guardar asignaciones
document.getElementById('btnGuardarAsignaciones')?.addEventListener('click', async function() {
  var asignaciones = [];
  document.querySelectorAll('.edit-mesa-check:checked').forEach(function(cb) {
    asignaciones.push({ mesa_id: parseInt(cb.dataset.mesaId), mesero_id: parseInt(cb.dataset.meseroId) });
  });
  try {
    var resp = await fetch('/api/caja/reasignar-mesas', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ asignaciones: asignaciones })
    });
    var data = await resp.json();
    if (resp.ok) {
      Swal.fire({ icon: 'success', title: 'Asignaciones actualizadas', timer: 1500, showConfirmButton: false });
      setTimeout(function() { location.reload(); }, 1500);
    } else {
      Swal.fire({ icon: 'error', title: 'Error', text: data.error });
    }
  } catch (err) {
    Swal.fire({ icon: 'error', title: 'Error', text: 'No se pudo guardar' });
  }
});

// Historial ranking
document.getElementById('btnVerHistorialRanking')?.addEventListener('click', function() {
  new bootstrap.Modal(document.getElementById('modalHistorialRanking')).show();
  cargarRanking('hoy');
});

document.querySelectorAll('.ranking-periodo').forEach(function(btn) {
  btn.addEventListener('click', function() {
    document.querySelectorAll('.ranking-periodo').forEach(function(b) {
      b.classList.remove('btn-primary');
      b.classList.add('btn-outline-secondary');
    });
    this.classList.remove('btn-outline-secondary');
    this.classList.add('btn-primary');
    cargarRanking(this.dataset.periodo);
  });
});

async function cargarRanking(periodo) {
  var tbody = document.getElementById('historialRankingBody');
  tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Cargando...</td></tr>';
  try {
    var resp = await fetch('/api/caja/ranking-meseros?periodo=' + periodo);
    var data = await resp.json();
    if (data.ranking && data.ranking.length > 0) {
      tbody.innerHTML = data.ranking.map(function(r, i) {
        return '<tr><td>' + (i + 1) + '</td><td>' + r.nombre + '</td><td>' + r.mesas_atendidas + '</td><td><strong>' + r.productos_servidos + '</strong></td><td>' + r.promedio_por_mesa + '</td></tr>';
      }).join('');
    } else {
      tbody.innerHTML = '<tr><td colspan="5" class="text-center text-muted">Sin datos para este periodo</td></tr>';
    }
  } catch (err) {
    tbody.innerHTML = '<tr><td colspan="5" class="text-center text-danger">Error al cargar</td></tr>';
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add views/caja.ejs && git commit -m "feat: modales editar asignaciones y historial ranking meseros"
```

---

## Task 10: Verificar boton Asignar Mesero en Mesas

**Files:**
- Verify: `routes/mesas.js` (endpoint POST /mesas/:id/asignar-mesero)
- Verify: `public/js/mesas.js` (handler btnAsignarMesero)

- [ ] **Step 1: Verificar que el endpoint funciona**

Revisar que `POST /api/mesas/:id/asignar-mesero` en `routes/mesas.js` use las columnas correctas (`mesero_asignado_id`, `mesero_asignado_nombre`). Segun la exploracion, ya esta correcto (lineas 172-203).

- [ ] **Step 2: Verificar que el handler JS funciona**

Revisar `public/js/mesas.js` lineas 1960-2079. El handler ya hace POST a `/api/mesas/{mesaId}/asignar-mesero` con `mesero_id`. Verificar que el endpoint URL coincide (puede ser `/api/mesas/` o `/mesas/`).

Si hay discrepancia en la URL del fetch vs la ruta del router, corregir.

- [ ] **Step 3: Test manual**

1. Ir a /mesas
2. Click en una mesa
3. Click "Asignar mesero"
4. Seleccionar un mesero del dropdown
5. Verificar que se actualiza el badge

- [ ] **Step 4: Commit si hubo cambios**

```bash
git add routes/mesas.js public/js/mesas.js && git commit -m "fix: verificar y corregir endpoint asignar mesero en mesas"
```

---

## Task 11: Mostrar mesas asignadas en Usuarios (solo lectura)

**Files:**
- Modify: `routes/usuarios.js` (GET /usuarios)
- Modify: `views/usuarios.ejs`

- [ ] **Step 1: Agregar mesas asignadas al query de usuarios**

En `routes/usuarios.js`, en el endpoint `GET /usuarios` (linea ~93), despues de obtener `usuariosConPermisos`, agregar:

```javascript
    // Agregar mesas asignadas a cada mesero
    for (const u of usuariosConPermisos) {
      if (u.rol === 'mesero') {
        const [mesas] = await db.query(
          `SELECT numero FROM mesas WHERE mesero_asignado_id = ? ORDER BY numero`, [u.id]
        );
        u.mesasAsignadas = mesas;
      } else {
        u.mesasAsignadas = [];
      }
    }
```

- [ ] **Step 2: Mostrar mesas en la card del usuario**

En `views/usuarios.ejs`, dentro de la card de cada usuario (buscar `.usr-card-body` o similar), agregar despues del badge de rol:

```html
<% if (u.rol === 'mesero' && u.mesasAsignadas && u.mesasAsignadas.length > 0) { %>
  <div class="mt-2">
    <small class="text-muted d-block mb-1">Mesas asignadas:</small>
    <% u.mesasAsignadas.forEach(function(m) { %>
      <span class="badge bg-light text-dark border" style="font-size:0.7rem;"><%= m.numero %></span>
    <% }); %>
  </div>
<% } else if (u.rol === 'mesero') { %>
  <div class="mt-2"><small class="text-muted">Sin mesas asignadas</small></div>
<% } %>
```

- [ ] **Step 3: Commit**

```bash
git add routes/usuarios.js views/usuarios.ejs && git commit -m "feat: mostrar mesas asignadas en vista usuarios (solo lectura)"
```

---

## Task 12: Testing integral y push

- [ ] **Step 1: Test completo del flujo**

1. Ir a /caja → Abrir caja con asignaciones de mesas
2. Verificar cards de meseros aparecen
3. Verificar ranking del dia
4. Click Editar → reasignar → Guardar
5. Verificar historial ranking (Hoy/Semana/Mes/Todo)
6. Ir a /mesas → Asignar mesero desde boton individual
7. Ir a /usuarios → Ver mesas asignadas en cards de meseros
8. Cerrar caja → Verificar que asignaciones se borran

- [ ] **Step 2: Push final**

```bash
git push
```
