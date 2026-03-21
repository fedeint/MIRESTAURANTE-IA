/* ============================================================
   observabilidad.js  --  Frontend dashboard for Observabilidad
   Chart.js 4 + Bootstrap 5 + vanilla JS
   ============================================================ */

// --------------- Chart instance registry ---------------
const charts = {};

function getOrCreateChart(canvasId, config) {
  if (charts[canvasId]) charts[canvasId].destroy();
  const ctx = document.getElementById(canvasId);
  if (!ctx) return null;
  charts[canvasId] = new Chart(ctx, config);
  return charts[canvasId];
}

// --------------- Fetch helper ---------------
async function fetchAPI(path) {
  const res = await fetch(`/superadmin/observabilidad${path}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

// --------------- Shared chart defaults ---------------
const CHART_COLORS = {
  orange: '#f97316',
  green: '#22c55e',
  red: '#ef4444',
  blue: '#818cf8',
  yellow: '#fbbf24',
  cyan: '#06b6d4',
  pink: '#ec4899',
  slate: '#64748b'
};

const DARK_GRID = { color: 'rgba(255,255,255,0.06)' };
const DARK_TICKS = { color: '#64748b', font: { size: 11 } };

function darkScaleOpts() {
  return {
    x: { grid: DARK_GRID, ticks: DARK_TICKS },
    y: { grid: DARK_GRID, ticks: DARK_TICKS, beginAtZero: true }
  };
}

function darkLegend() {
  return { labels: { color: '#94a3b8', font: { size: 12 } } };
}

// --------------- KPI card rendering ---------------
function renderKPICards(containerId, cards) {
  const container = document.getElementById(containerId);
  if (!container) return;
  container.innerHTML = cards.map(c => {
    const changeHtml = c.cambio !== undefined
      ? `<span style="font-size:0.72rem;color:${c.cambio >= 0 ? '#22c55e' : '#ef4444'};">${c.cambio >= 0 ? '+' : ''}${c.cambio}%</span>`
      : '';
    return `
      <div class="col-6 col-lg-3">
        <div class="obs-card">
          <div class="d-flex justify-content-between align-items-start">
            <div>
              <div class="obs-kpi-value">${c.valor}</div>
              <div class="obs-kpi-label">${c.label} ${changeHtml}</div>
            </div>
            ${c.icon ? `<div class="obs-kpi-icon" style="background:rgba(249,115,22,0.1);color:#f97316;"><i class="bi bi-${c.icon}"></i></div>` : ''}
          </div>
        </div>
      </div>`;
  }).join('');
}

// --------------- Table rendering ---------------
function renderTable(containerId, headers, rows) {
  const container = document.getElementById(containerId);
  if (!container) return;
  const tbody = container.querySelector('tbody');
  if (tbody) {
    tbody.innerHTML = rows.map(r =>
      `<tr>${r.map(cell => `<td>${cell}</td>`).join('')}</tr>`
    ).join('');
    return;
  }
  // Fallback: render full table into a div
  container.innerHTML = `
    <div class="table-responsive">
      <table class="obs-table w-100">
        <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
        <tbody>${rows.map(r => `<tr>${r.map(cell => `<td>${cell}</td>`).join('')}</tr>`).join('')}</tbody>
      </table>
    </div>`;
}

// --------------- Error display ---------------
function showTabError(containerId, msg) {
  const el = document.getElementById(containerId);
  if (!el) return;
  const alert = el.closest('.tab-pane');
  if (alert) {
    let banner = alert.querySelector('.obs-error-banner');
    if (!banner) {
      banner = document.createElement('div');
      banner.className = 'obs-error-banner alert alert-danger py-2 px-3 mb-3';
      banner.style.cssText = 'background:rgba(239,68,68,0.12);border:1px solid rgba(239,68,68,0.3);color:#ef4444;border-radius:10px;font-size:0.82rem;';
      alert.prepend(banner);
    }
    banner.innerHTML = `<i class="bi bi-exclamation-triangle me-2"></i>${msg}`;
  }
}

function clearTabErrors(paneId) {
  const pane = document.getElementById(paneId);
  if (!pane) return;
  pane.querySelectorAll('.obs-error-banner').forEach(b => b.remove());
}

function showUnavailableBanner(paneId, msg) {
  const pane = document.getElementById(paneId);
  if (!pane) return;
  let banner = pane.querySelector('.obs-unavailable-banner');
  if (!banner) {
    banner = document.createElement('div');
    banner.className = 'obs-unavailable-banner alert py-2 px-3 mb-3';
    banner.style.cssText = 'background:rgba(251,191,36,0.12);border:1px solid rgba(251,191,36,0.3);color:#fbbf24;border-radius:10px;font-size:0.82rem;';
    pane.prepend(banner);
  }
  banner.innerHTML = `<i class="bi bi-exclamation-circle me-2"></i>${msg}`;
}

// --------------- Badge helper ---------------
function severityBadge(sev) {
  const s = (sev || '').toLowerCase();
  if (s === 'alta' || s === 'high' || s === 'critica' || s === 'critical') return `<span class="obs-badge-danger">${sev}</span>`;
  if (s === 'media' || s === 'medium' || s === 'warning') return `<span class="obs-badge-warn">${sev}</span>`;
  return `<span class="obs-badge-ok">${sev}</span>`;
}

// ======================================================
//  TAB LOADERS
// ======================================================

// --------------- NEGOCIO ---------------
async function loadNegocio() {
  clearTabErrors('pane-negocio');
  try {
    const data = await fetchAPI('/api/negocio');
    // KPIs -- update the pre-built cards
    if (data.kpis) {
      const k = data.kpis;
      const el = id => document.getElementById(id);
      if (el('kpi-mrr')) el('kpi-mrr').textContent = k.mrr ?? '--';
      if (el('kpi-tenants-activos')) el('kpi-tenants-activos').textContent = k.tenants_activos ?? '--';
      if (el('kpi-ventas-hoy')) el('kpi-ventas-hoy').textContent = k.ventas_hoy ?? '--';
      if (el('kpi-churn')) el('kpi-churn').textContent = k.churn != null ? k.churn + '%' : '--';
    }

    // Ingresos mensuales (line chart / MRR)
    if (data.mrr) {
      getOrCreateChart('chart-ingresos-mensuales', {
        type: 'line',
        data: {
          labels: data.mrr.labels || [],
          datasets: [{
            label: 'MRR',
            data: data.mrr.data || [],
            borderColor: CHART_COLORS.green,
            backgroundColor: 'rgba(34,197,94,0.08)',
            fill: true, tension: 0.3, pointRadius: 3
          }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: darkLegend() }, scales: darkScaleOpts() }
      });
    }

    // Ventas por tenant (bar / line chart)
    if (data.operaciones || data.top_tenants) {
      const src = data.operaciones || data.top_tenants;
      getOrCreateChart('chart-ventas-tenant', {
        type: 'bar',
        data: {
          labels: src.labels || [],
          datasets: [{
            label: 'Ventas',
            data: src.data || [],
            backgroundColor: CHART_COLORS.orange,
            borderRadius: 6
          }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: darkLegend() }, scales: darkScaleOpts() }
      });
    }

    // Actividad reciente table
    if (data.actividad) {
      renderTable('tabla-negocio', ['Tenant', 'Evento', 'Monto', 'Fecha'],
        data.actividad.map(r => [r.tenant, r.evento, r.monto, r.fecha])
      );
    }

    // Inactivos table (if container exists)
    if (data.inactivos && document.getElementById('tabla-inactivos')) {
      renderTable('tabla-inactivos', ['Tenant', 'Ultimo Acceso', 'Plan'],
        data.inactivos.map(r => [r.tenant, r.ultimo_acceso, r.plan])
      );
    }

    // Uso modulos bar chart
    if (data.uso_modulos && document.getElementById('chart-uso-modulos')) {
      getOrCreateChart('chart-uso-modulos', {
        type: 'bar',
        data: {
          labels: data.uso_modulos.labels || [],
          datasets: [{
            label: 'Uso',
            data: data.uso_modulos.data || [],
            backgroundColor: CHART_COLORS.blue,
            borderRadius: 6
          }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: darkLegend() }, scales: darkScaleOpts() }
      });
    }
  } catch (err) {
    console.error('loadNegocio error:', err);
    showTabError('negocio-kpis', 'No se pudo cargar datos de negocio. Intente actualizar.');
  }
}

// --------------- RENDIMIENTO ---------------
async function loadRendimiento() {
  clearTabErrors('pane-rendimiento');
  try {
    const data = await fetchAPI('/api/rendimiento');

    if (data.circuit_open) {
      showUnavailableBanner('pane-rendimiento', 'Servicio de metricas temporalmente no disponible (circuit breaker abierto).');
    }

    // KPIs
    if (data.kpis) {
      const k = data.kpis;
      const el = id => document.getElementById(id);
      if (el('kpi-p50')) el('kpi-p50').textContent = k.p50 != null ? k.p50 + 'ms' : '--';
      if (el('kpi-p99')) el('kpi-p99').textContent = k.p99 != null ? k.p99 + 'ms' : '--';
      if (el('kpi-rpm')) el('kpi-rpm').textContent = k.rpm ?? '--';
      if (el('kpi-error-rate')) el('kpi-error-rate').textContent = k.error_rate != null ? k.error_rate + '%' : '--';
    }

    // Latencia chart
    if (data.latencia) {
      getOrCreateChart('chart-latencia', {
        type: 'line',
        data: {
          labels: data.latencia.labels || [],
          datasets: [
            { label: 'P50', data: data.latencia.p50 || [], borderColor: CHART_COLORS.green, tension: 0.3, pointRadius: 2 },
            { label: 'P99', data: data.latencia.p99 || [], borderColor: CHART_COLORS.yellow, tension: 0.3, pointRadius: 2 }
          ]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: darkLegend() }, scales: darkScaleOpts() }
      });
    }

    // Throughput chart
    if (data.throughput || data.errores) {
      const src = data.throughput || data.errores;
      getOrCreateChart('chart-throughput', {
        type: 'line',
        data: {
          labels: src.labels || [],
          datasets: [{
            label: 'RPM',
            data: src.data || [],
            borderColor: CHART_COLORS.blue,
            backgroundColor: 'rgba(129,140,248,0.08)',
            fill: true, tension: 0.3, pointRadius: 2
          }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: darkLegend() }, scales: darkScaleOpts() }
      });
    }

    // Endpoints lentos table
    if (data.endpoints_lentos) {
      renderTable('tabla-endpoints-lentos',
        ['Endpoint', 'Metodo', 'P50 (ms)', 'P99 (ms)', 'RPM', 'Errores'],
        data.endpoints_lentos.map(r => [r.endpoint, r.metodo, r.p50, r.p99, r.rpm, r.errores])
      );
    }
  } catch (err) {
    console.error('loadRendimiento error:', err);
    showTabError('rendimiento-kpis', 'No se pudo cargar datos de rendimiento.');
  }
}

// --------------- SEGURIDAD ---------------
async function loadSeguridad() {
  clearTabErrors('pane-seguridad');
  try {
    const data = await fetchAPI('/api/seguridad');

    // KPIs
    if (data.kpis) {
      const k = data.kpis;
      const el = id => document.getElementById(id);
      if (el('kpi-login-fallidos')) el('kpi-login-fallidos').textContent = k.login_fallidos ?? '--';
      if (el('kpi-ips-bloqueadas')) el('kpi-ips-bloqueadas').textContent = k.ips_bloqueadas ?? '--';
      if (el('kpi-eventos-seg')) el('kpi-eventos-seg').textContent = k.eventos ?? '--';
      if (el('kpi-rate-limit')) el('kpi-rate-limit').textContent = k.rate_limit_hits ?? '--';
    }

    // Login fallidos chart
    if (data.login_fallidos_chart || data.eventos) {
      const src = data.login_fallidos_chart || data.eventos;
      getOrCreateChart('chart-login-fallidos', {
        type: 'bar',
        data: {
          labels: src.labels || [],
          datasets: [{
            label: 'Login Fallidos',
            data: src.data || [],
            backgroundColor: CHART_COLORS.red,
            borderRadius: 6
          }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: darkLegend() }, scales: darkScaleOpts() }
      });
    }

    // Eventos por tipo (cambios-por-tenant bar chart)
    if (data.eventos_tipo || data.cambios_por_tenant) {
      const src = data.eventos_tipo || data.cambios_por_tenant;
      getOrCreateChart('chart-eventos-seguridad', {
        type: 'bar',
        data: {
          labels: src.labels || [],
          datasets: [{
            label: 'Eventos',
            data: src.data || [],
            backgroundColor: CHART_COLORS.blue,
            borderRadius: 6
          }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: darkLegend() }, scales: darkScaleOpts() }
      });
    }

    // Seguridad table
    if (data.log || data.eventos_tabla) {
      const rows = (data.log || data.eventos_tabla).map(r => [
        r.fecha, r.tipo, r.ip, r.usuario, r.detalle, severityBadge(r.severidad)
      ]);
      renderTable('tabla-seguridad', ['Fecha', 'Tipo', 'IP', 'Usuario', 'Detalle', 'Severidad'], rows);
    }

    // IPs sospechosas table (if exists)
    if (data.ips_sospechosas && document.getElementById('tabla-ips-sospechosas')) {
      renderTable('tabla-ips-sospechosas', ['IP', 'Intentos', 'Ultimo Intento', 'Pais'],
        data.ips_sospechosas.map(r => [r.ip, r.intentos, r.ultimo_intento, r.pais])
      );
    }
  } catch (err) {
    console.error('loadSeguridad error:', err);
    showTabError('seguridad-kpis', 'No se pudo cargar datos de seguridad.');
  }
}

// --------------- INFRA ---------------
async function loadInfra() {
  clearTabErrors('pane-infra');
  try {
    const data = await fetchAPI('/api/infra');

    if (data.circuit_open) {
      showUnavailableBanner('pane-infra', 'Servicio de infraestructura temporalmente no disponible (circuit breaker abierto).');
    }

    // KPIs
    if (data.kpis) {
      const k = data.kpis;
      const el = id => document.getElementById(id);
      if (el('kpi-cpu')) el('kpi-cpu').textContent = k.cpu != null ? k.cpu + '%' : '--';
      if (el('kpi-memoria')) el('kpi-memoria').textContent = k.memoria ?? '--';
      if (el('kpi-disco')) el('kpi-disco').textContent = k.disco ?? '--';
      if (el('kpi-db-pool')) el('kpi-db-pool').textContent = k.db_pool ?? '--';
    }

    // CPU / Memoria area chart
    if (data.cpu_mem || data.db_pool_chart) {
      const src = data.cpu_mem || {};
      getOrCreateChart('chart-cpu-mem', {
        type: 'line',
        data: {
          labels: src.labels || [],
          datasets: [
            { label: 'CPU %', data: src.cpu || [], borderColor: CHART_COLORS.green, backgroundColor: 'rgba(34,197,94,0.08)', fill: true, tension: 0.3, pointRadius: 2 },
            { label: 'Memoria %', data: src.memoria || [], borderColor: CHART_COLORS.blue, backgroundColor: 'rgba(129,140,248,0.08)', fill: true, tension: 0.3, pointRadius: 2 }
          ]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: darkLegend() }, scales: darkScaleOpts() }
      });
    }

    // DB Pool chart (area chart)
    if (data.db_pool_chart) {
      getOrCreateChart('chart-db-pool', {
        type: 'line',
        data: {
          labels: data.db_pool_chart.labels || [],
          datasets: [{
            label: 'Conexiones Activas',
            data: data.db_pool_chart.data || [],
            borderColor: CHART_COLORS.orange,
            backgroundColor: 'rgba(249,115,22,0.1)',
            fill: true, tension: 0.3, pointRadius: 2
          }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: darkLegend() }, scales: darkScaleOpts() }
      });
    }

    // Rate limits bar chart (if canvas exists)
    if (data.rate_limits && document.getElementById('chart-rate-limits')) {
      getOrCreateChart('chart-rate-limits', {
        type: 'bar',
        data: {
          labels: data.rate_limits.labels || [],
          datasets: [{
            label: 'Rate Limit Hits',
            data: data.rate_limits.data || [],
            backgroundColor: CHART_COLORS.yellow,
            borderRadius: 6
          }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: darkLegend() }, scales: darkScaleOpts() }
      });
    }

    // Servicios table
    if (data.servicios) {
      renderTable('tabla-servicios',
        ['Servicio', 'Estado', 'Uptime', 'Latencia', 'Ultima Verificacion'],
        data.servicios.map(r => [
          r.servicio,
          r.estado === 'ok' ? '<span class="obs-badge-ok">OK</span>' : `<span class="obs-badge-danger">${r.estado}</span>`,
          r.uptime, r.latencia, r.ultima_verificacion
        ])
      );
    }
  } catch (err) {
    console.error('loadInfra error:', err);
    showTabError('infra-kpis', 'No se pudo cargar datos de infraestructura.');
  }
}

// --------------- ATAQUES ---------------
async function loadAtaques() {
  clearTabErrors('pane-ataques');
  try {
    const data = await fetchAPI('/api/ataques');

    // KPIs
    if (data.kpis) {
      const k = data.kpis;
      const el = id => document.getElementById(id);
      if (el('kpi-ataques-24h')) el('kpi-ataques-24h').textContent = k.ataques_24h ?? '--';
      if (el('kpi-blacklisted')) el('kpi-blacklisted').textContent = k.blacklisted ?? '--';
      if (el('kpi-whitelisted')) el('kpi-whitelisted').textContent = k.whitelisted ?? '--';
      if (el('kpi-bloqueados-hoy')) el('kpi-bloqueados-hoy').textContent = k.bloqueados_hoy ?? '--';
    }

    // Ataques por hora (stacked bar chart / timeline)
    if (data.timeline || data.ataques_hora) {
      const src = data.timeline || data.ataques_hora;
      const datasets = src.datasets
        ? src.datasets.map((ds, i) => ({
            label: ds.label,
            data: ds.data,
            backgroundColor: [CHART_COLORS.red, CHART_COLORS.yellow, CHART_COLORS.orange, CHART_COLORS.pink, CHART_COLORS.blue][i % 5],
            borderRadius: 4
          }))
        : [{
            label: 'Ataques',
            data: src.data || [],
            backgroundColor: CHART_COLORS.red,
            borderRadius: 4
          }];
      getOrCreateChart('chart-ataques-hora', {
        type: 'bar',
        data: { labels: src.labels || [], datasets },
        options: {
          responsive: true, maintainAspectRatio: false,
          plugins: { legend: darkLegend() },
          scales: { ...darkScaleOpts(), x: { ...darkScaleOpts().x, stacked: true }, y: { ...darkScaleOpts().y, stacked: true } }
        }
      });
    }

    // Tipos de ataque chart
    if (data.tipos) {
      getOrCreateChart('chart-tipos-ataque', {
        type: 'doughnut',
        data: {
          labels: data.tipos.labels || [],
          datasets: [{
            data: data.tipos.data || [],
            backgroundColor: [CHART_COLORS.red, CHART_COLORS.yellow, CHART_COLORS.orange, CHART_COLORS.pink, CHART_COLORS.blue, CHART_COLORS.cyan]
          }]
        },
        options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { ...darkLegend(), position: 'right' } } }
      });
    }

    // Blacklist table
    if (data.blacklist) {
      renderTable('tabla-blacklist',
        ['IP', 'Razon', 'Duracion', 'Fecha Bloqueo', 'Expira', 'Acciones'],
        data.blacklist.map(r => [
          r.ip, r.razon, r.duracion || 'Permanente', r.fecha_bloqueo, r.expira || 'Nunca',
          `<div class="d-flex gap-1">
            ${!r.permanente ? `<button class="btn btn-sm" style="background:rgba(249,115,22,0.15);color:#f97316;border-radius:6px;font-size:0.72rem;" onclick="hacerPermanente('${r.id}')"><i class="bi bi-lock"></i></button>` : ''}
            <button class="btn btn-sm" style="background:rgba(239,68,68,0.15);color:#ef4444;border-radius:6px;font-size:0.72rem;" onclick="eliminarBlacklist('${r.id}')"><i class="bi bi-trash"></i></button>
          </div>`
        ])
      );
    }

    // Whitelist table
    if (data.whitelist) {
      renderTable('tabla-whitelist',
        ['IP', 'Descripcion', 'Fecha Agregado', 'Acciones'],
        data.whitelist.map(r => [
          r.ip, r.descripcion, r.fecha_agregado,
          `<button class="btn btn-sm" style="background:rgba(239,68,68,0.15);color:#ef4444;border-radius:6px;font-size:0.72rem;" onclick="eliminarWhitelist('${r.id}')"><i class="bi bi-trash"></i></button>`
        ])
      );
    }

    // Attack log table
    if (data.log && document.getElementById('tabla-ataques-log')) {
      renderTable('tabla-ataques-log',
        ['Fecha', 'Tipo', 'IP', 'Pais', 'Detalle', 'Accion'],
        data.log.map(r => [r.fecha, r.tipo, r.ip, r.pais, r.detalle, r.accion])
      );
    }

    // Mini attack map
    if (typeof initMiniMapaAtaques === 'function') {
      initMiniMapaAtaques(data.geo || []);
    }
  } catch (err) {
    console.error('loadAtaques error:', err);
    showTabError('ataques-kpis', 'No se pudo cargar datos de ataques.');
  }
}

// ======================================================
//  CRUD Actions (global)
// ======================================================

async function agregarBlacklist() {
  const ip = document.getElementById('blacklist-ip').value.trim();
  const razon = document.getElementById('blacklist-razon').value.trim();
  const duracion = parseInt(document.getElementById('blacklist-duracion').value) || 0;
  if (!ip || !razon) return;
  try {
    const res = await fetch('/superadmin/observabilidad/api/ataques/blacklist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip, razon, duracion })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    // Close modal and reload
    const modal = bootstrap.Modal.getInstance(document.getElementById('modalBlacklist'));
    if (modal) modal.hide();
    document.getElementById('form-blacklist').reset();
    loadAtaques();
  } catch (err) {
    console.error('agregarBlacklist error:', err);
    alert('Error al agregar IP a blacklist: ' + err.message);
  }
}

async function eliminarBlacklist(id) {
  if (!confirm('Eliminar esta IP de la blacklist?')) return;
  try {
    const res = await fetch(`/superadmin/observabilidad/api/ataques/blacklist/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    loadAtaques();
  } catch (err) {
    console.error('eliminarBlacklist error:', err);
    alert('Error al eliminar: ' + err.message);
  }
}

async function hacerPermanente(id) {
  try {
    const res = await fetch(`/superadmin/observabilidad/api/ataques/blacklist/${id}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ permanente: true })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    loadAtaques();
  } catch (err) {
    console.error('hacerPermanente error:', err);
    alert('Error al hacer permanente: ' + err.message);
  }
}

async function agregarWhitelist() {
  const ip = document.getElementById('whitelist-ip').value.trim();
  const descripcion = document.getElementById('whitelist-descripcion').value.trim();
  if (!ip || !descripcion) return;
  try {
    const res = await fetch('/superadmin/observabilidad/api/ataques/whitelist', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ip, descripcion })
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const modal = bootstrap.Modal.getInstance(document.getElementById('modalWhitelist'));
    if (modal) modal.hide();
    document.getElementById('form-whitelist').reset();
    loadAtaques();
  } catch (err) {
    console.error('agregarWhitelist error:', err);
    alert('Error al agregar IP a whitelist: ' + err.message);
  }
}

async function eliminarWhitelist(id) {
  if (!confirm('Eliminar esta IP de la whitelist?')) return;
  try {
    const res = await fetch(`/superadmin/observabilidad/api/ataques/whitelist/${id}`, { method: 'DELETE' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    loadAtaques();
  } catch (err) {
    console.error('eliminarWhitelist error:', err);
    alert('Error al eliminar: ' + err.message);
  }
}

// ======================================================
//  Initialization
// ======================================================

document.addEventListener('DOMContentLoaded', () => {
  // Load first tab
  loadNegocio();

  // Tab switching
  document.querySelectorAll('#obsTabs .nav-link').forEach(tab => {
    tab.addEventListener('shown.bs.tab', (e) => {
      const target = e.target.getAttribute('data-bs-target') || e.target.getAttribute('href');
      if (target === '#pane-negocio') loadNegocio();
      if (target === '#pane-rendimiento') loadRendimiento();
      if (target === '#pane-seguridad') loadSeguridad();
      if (target === '#pane-infra') loadInfra();
      if (target === '#pane-mapa' && typeof initMapa === 'function') initMapa();
      if (target === '#pane-ataques') loadAtaques();
    });
  });

  // Refresh all button
  const btnRefresh = document.getElementById('btn-refresh-all');
  if (btnRefresh) {
    btnRefresh.addEventListener('click', () => {
      const activeTab = document.querySelector('#obsTabs .nav-link.active');
      if (!activeTab) return;
      const target = activeTab.getAttribute('data-bs-target') || activeTab.getAttribute('href');
      if (target === '#pane-negocio') loadNegocio();
      else if (target === '#pane-rendimiento') loadRendimiento();
      else if (target === '#pane-seguridad') loadSeguridad();
      else if (target === '#pane-infra') loadInfra();
      else if (target === '#pane-mapa' && typeof initMapa === 'function') initMapa();
      else if (target === '#pane-ataques') loadAtaques();
    });
  }

  // Form submissions for blacklist/whitelist
  const formBL = document.getElementById('form-blacklist');
  if (formBL) {
    formBL.addEventListener('submit', (e) => {
      e.preventDefault();
      agregarBlacklist();
    });
  }

  const formWL = document.getElementById('form-whitelist');
  if (formWL) {
    formWL.addEventListener('submit', (e) => {
      e.preventDefault();
      agregarWhitelist();
    });
  }

  // CSV export buttons
  const btnExportBL = document.getElementById('btn-export-blacklist');
  if (btnExportBL) {
    btnExportBL.addEventListener('click', (e) => {
      e.preventDefault();
      window.location.href = '/superadmin/observabilidad/api/ataques/blacklist/export';
    });
  }

  const btnExportWL = document.getElementById('btn-export-whitelist');
  if (btnExportWL) {
    btnExportWL.addEventListener('click', (e) => {
      e.preventDefault();
      window.location.href = '/superadmin/observabilidad/api/ataques/whitelist/export';
    });
  }
});
