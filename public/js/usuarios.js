// Panel de Usuarios (solo administrador)
// Relacionado con:
// - views/usuarios.ejs (tabla, cards, organigrama y modales)
// - routes/usuarios.js (API /api/usuarios/* y /usuarios/api/usuarios/*)

document.addEventListener('DOMContentLoaded', function () {
  // ---- Bootstrap Modal instances ----
  const usuarioModalEl = document.getElementById('usuarioModal');
  const usuarioModal = usuarioModalEl ? new bootstrap.Modal(usuarioModalEl) : null;
  const passwordModalEl = document.getElementById('passwordModal');
  const passwordModal = passwordModalEl ? new bootstrap.Modal(passwordModalEl) : null;

  // ---- Server-injected data ----
  const ALL_MODULES = window.DG_ALL_MODULES || [];
  const DEFAULT_PERMISOS = window.DG_DEFAULT_PERMISOS || {};

  // ---- In-memory state ----
  let usuariosData = window.DG_USUARIOS || [];

  // ======================================================
  // UTILS
  // ======================================================
  function qs(id) { return document.getElementById(id); }

  function showError(id, msg) {
    const el = qs(id);
    if (!el) return;
    el.textContent = String(msg || '');
    el.classList.toggle('d-none', !msg);
  }

  function escapeHtml(s) {
    return String(s ?? '')
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function getInitials(nombre, usuario) {
    const src = (nombre || usuario || '?').trim();
    const parts = src.split(/\s+/);
    if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
    return src.substring(0, 2).toUpperCase();
  }

  function getRoleGradClass(rol) {
    if (rol === 'administrador') return 'admin-grad';
    if (rol === 'mesero') return 'mesero-grad';
    return 'cocinero-grad';
  }

  function getRoleBadgeClass(rol) {
    if (rol === 'administrador') return 'role-admin';
    if (rol === 'mesero') return 'role-mesero';
    return 'role-cocinero';
  }

  function getAvatarClass(rol) {
    if (rol === 'administrador') return 'admin-av';
    if (rol === 'mesero') return 'mesero-av';
    return 'cocinero-av';
  }

  function renderPermBadges(permisosArr, small) {
    return (permisosArr || []).map(key => {
      const mod = ALL_MODULES.find(m => m.key === key);
      if (!mod) return '';
      const sz = small ? '0.65rem' : '0.75rem';
      return `<span class="perm-badge" style="background:${mod.color}20;color:${mod.color};font-size:${sz};">` +
        `<i class="bi ${mod.icon}" style="font-size:0.6rem;"></i>${escapeHtml(mod.label)}</span>`;
    }).join('');
  }

  async function fetchJson(url, options) {
    const resp = await fetch(url, options);
    const data = await resp.json().catch(() => ({}));
    if (!resp.ok) throw new Error(data.error || 'Error');
    return data;
  }

  // ======================================================
  // VIEW SWITCHING
  // ======================================================
  const VIEW_KEY = 'dg-usuarios-view';
  let currentView = localStorage.getItem(VIEW_KEY) || 'tabla';

  function switchView(view) {
    currentView = view;
    localStorage.setItem(VIEW_KEY, view);

    // Update tab buttons
    document.querySelectorAll('.usr-view-tab').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.view === view);
    });

    // Show/hide view containers
    document.querySelectorAll('.usr-view').forEach(el => {
      el.style.display = 'none';
    });
    const target = qs('view' + view.charAt(0).toUpperCase() + view.slice(1));
    if (target) target.style.display = '';

    // Render the active view
    if (view === 'cards') renderCards();
    if (view === 'organigrama') renderOrgChart();
  }

  document.getElementById('viewTabs')?.addEventListener('click', function (e) {
    const btn = e.target.closest('.usr-view-tab');
    if (!btn) return;
    switchView(btn.dataset.view);
  });

  // Apply remembered view on load
  switchView(currentView);

  // ======================================================
  // RELOAD DATA FROM SERVER
  // ======================================================
  async function recargarDatos() {
    try {
      const list = await fetchJson('/api/usuarios/listar');
      usuariosData = list;
      // Update counter
      const counter = qs('totalMiembros');
      if (counter) counter.textContent = list.length;
      // Re-render active view
      if (currentView === 'tabla') renderTable();
      if (currentView === 'cards') renderCards();
      if (currentView === 'organigrama') renderOrgChart();
    } catch (e) {
      console.error('Error recargando datos:', e);
    }
  }

  // ======================================================
  // VIEW 1: TABLE
  // ======================================================
  function renderTable() {
    const tbody = qs('tbodyUsuarios');
    if (!tbody) return;
    tbody.innerHTML = '';
    usuariosData.forEach(u => {
      const tr = document.createElement('tr');
      tr.setAttribute('data-id', u.id);
      tr.setAttribute('data-permisos', JSON.stringify(u.permisosArr || []));

      const rolStyle = u.rol === 'administrador'
        ? 'background:rgba(255,107,53,0.12);color:#E55A2B;'
        : u.rol === 'mesero'
          ? 'background:rgba(59,130,246,0.12);color:#2563EB;'
          : 'background:rgba(34,197,94,0.12);color:#16A34A;';

      const statusStyle = Number(u.activo) === 1
        ? 'background:rgba(34,197,94,0.1);color:#16A34A;'
        : 'background:rgba(107,114,128,0.1);color:#6B7280;';
      const statusText = Number(u.activo) === 1 ? 'Activo' : 'Inactivo';

      const lastLogin = u.last_login ? new Date(u.last_login).toLocaleString() : '-';

      tr.innerHTML = `
        <td class="mono fw-semibold">${escapeHtml(u.usuario)}</td>
        <td>${escapeHtml(u.nombre || '')}</td>
        <td><span class="perm-badge" style="${rolStyle}">${escapeHtml(u.rol)}</span></td>
        <td><span class="perm-badge" style="${statusStyle}">${statusText}</span></td>
        <td><div class="perm-badges-wrap">${renderPermBadges(u.permisosArr, true)}</div></td>
        <td class="small text-muted">${escapeHtml(lastLogin)}</td>
        <td class="text-end">
          <div class="btn-group">
            <button class="btn btn-sm btn-outline-primary" data-action="editar" title="Editar"><i class="bi bi-pencil"></i></button>
            <button class="btn btn-sm btn-outline-warning" data-action="password" title="Cambiar contrasena"><i class="bi bi-key"></i></button>
            <button class="btn btn-sm btn-outline-danger" data-action="eliminar" title="Eliminar"><i class="bi bi-trash"></i></button>
          </div>
        </td>`;
      tbody.appendChild(tr);
    });
  }

  // Table action delegation
  qs('tbodyUsuarios')?.addEventListener('click', function (e) {
    const btn = e.target.closest('button[data-action]');
    if (!btn) return;
    const tr = e.target.closest('tr[data-id]');
    if (!tr) return;
    const action = btn.getAttribute('data-action');
    const id = Number(tr.getAttribute('data-id'));
    const u = usuariosData.find(x => x.id === id);
    if (!u) return;
    if (action === 'editar') abrirEditar(u);
    if (action === 'password') abrirPassword(u);
    if (action === 'eliminar') eliminarUsuario(u);
  });

  // ======================================================
  // VIEW 2: CARDS
  // ======================================================
  function renderCards() {
    const grid = qs('cardsGrid');
    if (!grid) return;
    grid.innerHTML = '';

    usuariosData.forEach(u => {
      const initials = getInitials(u.nombre, u.usuario);
      const gradClass = getRoleGradClass(u.rol);
      const roleBadge = getRoleBadgeClass(u.rol);
      const isInactive = Number(u.activo) !== 1;
      const statusClass = isInactive ? 'status-inactivo' : 'status-activo';
      const statusText = isInactive ? 'Inactivo' : 'Activo';

      const card = document.createElement('div');
      card.className = 'usr-card' + (isInactive ? ' inactive' : '');
      card.setAttribute('data-id', u.id);

      const permBadgesHtml = (u.permisosArr || []).map(key => {
        const mod = ALL_MODULES.find(m => m.key === key);
        if (!mod) return '';
        return `<span class="perm-badge" style="background:${mod.color}20;color:${mod.color};font-size:0.7rem;">` +
          `<i class="bi ${mod.icon}" style="font-size:0.6rem;"></i>${escapeHtml(mod.label)}</span>`;
      }).join('');

      card.innerHTML = `
        <div class="usr-card-top ${gradClass}">
          <div class="usr-card-avatar">${escapeHtml(initials)}</div>
        </div>
        <div class="usr-card-body">
          <div class="usr-card-name" data-card-toggle="${u.id}">
            ${escapeHtml(u.nombre || u.usuario)}
            <i class="bi bi-chevron-down usr-card-chevron" id="chevron-${u.id}"></i>
          </div>
          <div class="usr-card-username">@${escapeHtml(u.usuario)}</div>
          <span class="usr-card-role-badge ${roleBadge}">${escapeHtml(u.rol)}</span><br>
          <span class="usr-status-badge ${statusClass}">${statusText}</span>
          ${u.mesasAsignadas && u.mesasAsignadas.length > 0
            ? '<div class="mt-2">' + u.mesasAsignadas.map(n => `<span class="badge bg-light text-dark border" style="font-size:0.65rem;">Mesa ${n}</span>`).join(' ') + '</div>'
            : (u.rol === 'mesero' ? '<div class="mt-2"><span style="color:#9CA3AF;font-size:0.7rem;">Sin mesas asignadas</span></div>' : '')}
        </div>
        <div class="card-permisos" id="permisos-${u.id}">
          <div class="card-permisos-inner">
            <div class="card-permisos-label">Accesos</div>
            ${permBadgesHtml || '<span style="color:#9CA3AF;font-size:0.75rem;">Sin permisos</span>'}
          </div>
        </div>
        <div class="usr-card-actions">
          <button class="btn btn-sm btn-outline-primary" data-card-action="editar" data-id="${u.id}" title="Editar">
            <i class="bi bi-pencil"></i>
          </button>
          <button class="btn btn-sm btn-outline-warning" data-card-action="password" data-id="${u.id}" title="Cambiar contrasena">
            <i class="bi bi-key"></i>
          </button>
          <button class="btn btn-sm btn-outline-danger" data-card-action="eliminar" data-id="${u.id}" title="Eliminar">
            <i class="bi bi-trash"></i>
          </button>
        </div>`;
      grid.appendChild(card);
    });

    // Add-user card
    const addCard = document.createElement('div');
    addCard.className = 'usr-card-add';
    addCard.innerHTML = `<div class="add-icon"><i class="bi bi-plus-lg"></i></div><span>Agregar usuario</span>`;
    addCard.addEventListener('click', abrirNuevo);
    grid.appendChild(addCard);

    // Attach card toggle events
    grid.querySelectorAll('[data-card-toggle]').forEach(el => {
      el.addEventListener('click', function () {
        const id = this.dataset.cardToggle;
        toggleCardPermisos(id);
      });
    });

    // Attach card action buttons
    grid.addEventListener('click', function (e) {
      const btn = e.target.closest('[data-card-action]');
      if (!btn) return;
      const action = btn.getAttribute('data-card-action');
      const id = Number(btn.getAttribute('data-id'));
      const u = usuariosData.find(x => x.id === id);
      if (!u) return;
      if (action === 'editar') abrirEditar(u);
      if (action === 'password') abrirPassword(u);
      if (action === 'eliminar') eliminarUsuario(u);
    });
  }

  function toggleCardPermisos(id) {
    const permsEl = qs('permisos-' + id);
    const chevron = qs('chevron-' + id);
    if (!permsEl) return;
    const isOpen = permsEl.classList.contains('open');
    permsEl.classList.toggle('open', !isOpen);
    if (chevron) chevron.classList.toggle('open', !isOpen);
  }

  // ======================================================
  // VIEW 3: ORGANIGRAMA
  // ======================================================
  function renderOrgChart() {
    const container = qs('orgChart');
    if (!container) return;
    container.innerHTML = '';

    const admins = usuariosData.filter(u => u.rol === 'administrador');
    const meseros = usuariosData.filter(u => u.rol === 'mesero');
    const cocineros = usuariosData.filter(u => u.rol === 'cocinero');

    const topPerson = admins[0] || null;

    // ---- Level 1: Dueno / Administrador principal ----
    const lvl1Wrap = document.createElement('div');
    lvl1Wrap.className = 'org-level mb-0';
    lvl1Wrap.innerHTML = buildOrgNode(topPerson, 'Dueno / Administrador', 'admin-av', 'dept-admin');
    container.appendChild(lvl1Wrap);

    // Vertical connector
    container.appendChild(makeVConn());

    // ---- Level 2: Department labels ----
    const depts = [
      { label: 'Caja', icon: 'bi-wallet2', color: '#F59E0B', deptClass: 'dept-caja', users: [], role: null },
      { label: 'Cocina', icon: 'bi-fire', color: '#EF4444', deptClass: 'dept-cocinero', users: cocineros, role: 'cocinero' },
      { label: 'Salon', icon: 'bi-grid-3x3-gap-fill', color: '#3B82F6', deptClass: 'dept-mesero', users: meseros, role: 'mesero' }
    ];

    // Horizontal connector spanning 3 departments
    const hConnWrap = document.createElement('div');
    hConnWrap.className = 'org-connector-h-wrap';
    const hConn = document.createElement('div');
    hConn.className = 'org-connector-h';
    depts.forEach(() => {
      const branch = document.createElement('div');
      branch.className = 'org-child-branch';
      const vConn = document.createElement('div');
      vConn.className = 'org-connector-v';
      branch.appendChild(vConn);
      hConn.appendChild(branch);
    });
    hConnWrap.appendChild(hConn);
    container.appendChild(hConnWrap);

    // ---- Department nodes row ----
    const deptRow = document.createElement('div');
    deptRow.className = 'org-level gap-4 mb-0';
    depts.forEach(dept => {
      const nodeEl = document.createElement('div');
      nodeEl.style.cssText = 'display:flex;flex-direction:column;align-items:center;flex:1;min-width:160px;max-width:220px;';
      // Department header node
      const deptNode = document.createElement('div');
      deptNode.className = 'org-node mb-2';
      deptNode.style.cssText = `border-top:3px solid ${dept.color};`;
      deptNode.innerHTML = `
        <div class="org-node-avatar" style="background:${dept.color}20;width:38px;height:38px;margin-bottom:6px;">
          <i class="bi ${dept.icon}" style="color:${dept.color};font-size:1rem;"></i>
        </div>
        <div class="org-node-name">${escapeHtml(dept.label)}</div>
        <div class="org-node-dept ${dept.deptClass}">Departamento</div>`;
      nodeEl.appendChild(deptNode);

      // Staff under department
      if (dept.users && dept.users.length > 0) {
        dept.users.forEach(u => {
          const vSmall = document.createElement('div');
          vSmall.style.cssText = 'width:2px;height:16px;background:#E5E7EB;margin:0 auto;';
          nodeEl.appendChild(vSmall);
          const staffNode = document.createElement('div');
          staffNode.className = 'org-node mb-1';
          staffNode.style.cssText = 'min-width:140px;max-width:185px;cursor:pointer;';
          staffNode.title = 'Editar';
          const initials = getInitials(u.nombre, u.usuario);
          const avatarClass = getAvatarClass(u.rol);
          const isInactive = Number(u.activo) !== 1;
          const mesasHtml = u.mesasAsignadas && u.mesasAsignadas.length > 0
            ? '<div style="margin-top:4px;">' + u.mesasAsignadas.map(n => `<span class="badge bg-light text-dark border" style="font-size:0.6rem;">M${n}</span>`).join(' ') + '</div>'
            : '';
          staffNode.innerHTML = `
            <div class="org-status-dot ${isInactive ? 'dot-inactivo' : 'dot-activo'}"></div>
            <div class="org-node-avatar ${avatarClass}">${escapeHtml(initials)}</div>
            <div class="org-node-name">${escapeHtml(u.nombre || u.usuario)}</div>
            <div class="org-node-role">@${escapeHtml(u.usuario)}</div>${mesasHtml}`;
          staffNode.addEventListener('click', () => {
            const found = usuariosData.find(x => x.id === u.id);
            if (found) abrirEditar(found);
          });
          nodeEl.appendChild(staffNode);
        });
      } else if (dept.role) {
        // Vacant placeholder
        const vSmall = document.createElement('div');
        vSmall.style.cssText = 'width:2px;height:16px;background:#E5E7EB;margin:0 auto;';
        nodeEl.appendChild(vSmall);
        const vacant = document.createElement('div');
        vacant.className = 'org-node vacant';
        vacant.innerHTML = `
          <div class="org-node-avatar vacant-av"><i class="bi bi-person-dash"></i></div>
          <div class="org-node-name" style="color:#9CA3AF;">Vacante</div>
          <div class="org-node-role">Sin ${escapeHtml(dept.role)}</div>`;
        nodeEl.appendChild(vacant);
      }

      deptRow.appendChild(nodeEl);
    });
    container.appendChild(deptRow);

    // ---- Extra admins (if more than 1) ----
    if (admins.length > 1) {
      const extraWrap = document.createElement('div');
      extraWrap.style.cssText = 'margin-top:2rem;border-top:1px dashed #E5E7EB;padding-top:1.25rem;';
      const label = document.createElement('div');
      label.className = 'usr-section-label text-center mb-3';
      label.textContent = 'Otros Administradores';
      extraWrap.appendChild(label);
      const extraRow = document.createElement('div');
      extraRow.className = 'org-level gap-3 flex-wrap';
      admins.slice(1).forEach(u => {
        const node = document.createElement('div');
        node.className = 'org-node';
        node.style.cssText = 'cursor:pointer;';
        const initials = getInitials(u.nombre, u.usuario);
        const isInactive = Number(u.activo) !== 1;
        node.innerHTML = `
          <div class="org-status-dot ${isInactive ? 'dot-inactivo' : 'dot-activo'}"></div>
          <div class="org-node-avatar admin-av">${escapeHtml(initials)}</div>
          <div class="org-node-name">${escapeHtml(u.nombre || u.usuario)}</div>
          <div class="org-node-role">@${escapeHtml(u.usuario)}</div>
          <div class="org-node-dept dept-admin">Administrador</div>`;
        node.addEventListener('click', () => {
          const found = usuariosData.find(x => x.id === u.id);
          if (found) abrirEditar(found);
        });
        extraRow.appendChild(node);
      });
      extraWrap.appendChild(extraRow);
      container.appendChild(extraWrap);
    }
  }

  function buildOrgNode(u, deptLabel, avatarClass, deptClass) {
    if (!u) {
      return `<div class="org-node vacant" style="min-width:170px;">
        <div class="org-node-avatar vacant-av"><i class="bi bi-person-dash"></i></div>
        <div class="org-node-name" style="color:#9CA3AF;">Vacante</div>
        <div class="org-node-role">Sin administrador</div>
        <div class="org-node-dept dept-admin">${escapeHtml(deptLabel)}</div>
      </div>`;
    }
    const initials = getInitials(u.nombre, u.usuario);
    const isInactive = Number(u.activo) !== 1;
    return `<div class="org-node" style="min-width:170px;cursor:pointer;" data-org-edit="${u.id}">
      <div class="org-status-dot ${isInactive ? 'dot-inactivo' : 'dot-activo'}"></div>
      <div class="org-node-avatar ${avatarClass}">${escapeHtml(initials)}</div>
      <div class="org-node-name">${escapeHtml(u.nombre || u.usuario)}</div>
      <div class="org-node-role">@${escapeHtml(u.usuario)}</div>
      <div class="org-node-dept ${deptClass}">${escapeHtml(deptLabel)}</div>
    </div>`;
  }

  function makeVConn() {
    const el = document.createElement('div');
    el.className = 'org-connector-v';
    return el;
  }

  // Delegate click on org chart node edit buttons
  qs('orgChart')?.addEventListener('click', function (e) {
    const node = e.target.closest('[data-org-edit]');
    if (!node) return;
    const id = Number(node.getAttribute('data-org-edit'));
    const u = usuariosData.find(x => x.id === id);
    if (u) abrirEditar(u);
  });

  // ======================================================
  // PERMISSIONS CHECKBOXES UI
  // ======================================================
  function getCheckedPermisos() {
    const checked = [];
    document.querySelectorAll('.perm-checkbox:checked').forEach(cb => {
      checked.push(cb.value);
    });
    return checked;
  }

  function setCheckedPermisos(arr) {
    document.querySelectorAll('.perm-check-item').forEach(item => {
      const key = item.dataset.key;
      const color = item.dataset.color;
      const cb = item.querySelector('.perm-checkbox');
      const dot = item.querySelector('.perm-check-dot');
      const checkIcon = dot?.querySelector('.bi-check2');
      const isOn = arr.includes(key);
      if (cb) cb.checked = isOn;
      item.classList.toggle('checked', isOn);
      if (dot) {
        dot.style.background = isOn ? color : `${color}20`;
        dot.style.borderColor = isOn ? color : '#D1D5DB';
      }
      if (checkIcon) checkIcon.style.display = isOn ? '' : 'none';
    });
  }

  // Clicking perm-check-item label toggles visually
  qs('permisosGrid')?.addEventListener('click', function (e) {
    const item = e.target.closest('.perm-check-item');
    if (!item) return;
    const cb = item.querySelector('.perm-checkbox');
    if (!cb) return;
    cb.checked = !cb.checked;
    const color = item.dataset.color;
    const dot = item.querySelector('.perm-check-dot');
    const checkIcon = dot?.querySelector('.bi-check2');
    item.classList.toggle('checked', cb.checked);
    if (dot) {
      dot.style.background = cb.checked ? color : `${color}20`;
      dot.style.borderColor = cb.checked ? color : '#D1D5DB';
    }
    if (checkIcon) checkIcon.style.display = cb.checked ? '' : 'none';
  });

  // Quick-select buttons
  qs('btnPermAllAdmin')?.addEventListener('click', () => setCheckedPermisos(DEFAULT_PERMISOS.administrador || []));
  qs('btnPermMesero')?.addEventListener('click', () => setCheckedPermisos(DEFAULT_PERMISOS.mesero || []));
  qs('btnPermCocinero')?.addEventListener('click', () => setCheckedPermisos(DEFAULT_PERMISOS.cocinero || []));
  qs('btnPermNone')?.addEventListener('click', () => setCheckedPermisos([]));

  // Auto-fill permisos when role changes in modal
  qs('usuarioRol')?.addEventListener('change', function () {
    // Only auto-fill if creating new user (no id)
    if (!qs('usuarioId')?.value) {
      setCheckedPermisos(DEFAULT_PERMISOS[this.value] || []);
    }
  });

  // ======================================================
  // MODAL: NUEVO USUARIO
  // ======================================================
  function abrirNuevo() {
    qs('usuarioModalTitle').textContent = 'Nuevo usuario';
    qs('usuarioId').value = '';
    qs('usuarioUsuario').value = '';
    qs('usuarioNombre').value = '';
    qs('usuarioRol').value = 'mesero';
    qs('usuarioActivo').checked = true;
    qs('usuarioPassword').value = '';
    showError('usuarioError', '');
    setCheckedPermisos(DEFAULT_PERMISOS['mesero'] || []);
    usuarioModal?.show();
    setTimeout(() => qs('usuarioUsuario')?.focus(), 250);
  }

  document.getElementById('btnNuevoUsuario')?.addEventListener('click', abrirNuevo);

  // ======================================================
  // MODAL: EDITAR USUARIO
  // ======================================================
  function abrirEditar(u) {
    qs('usuarioModalTitle').textContent = 'Editar usuario';
    qs('usuarioId').value = u.id;
    qs('usuarioUsuario').value = u.usuario || '';
    qs('usuarioNombre').value = u.nombre || '';
    qs('usuarioRol').value = u.rol || 'mesero';
    qs('usuarioActivo').checked = Number(u.activo) === 1;
    qs('usuarioPassword').value = '';
    showError('usuarioError', '');
    setCheckedPermisos(u.permisosArr || []);
    usuarioModal?.show();
    setTimeout(() => qs('usuarioUsuario')?.focus(), 250);
  }

  // ======================================================
  // GUARDAR USUARIO (crear / editar)
  // ======================================================
  async function guardarUsuario() {
    showError('usuarioError', '');
    const id = qs('usuarioId').value;
    const permisos = getCheckedPermisos();
    const body = {
      usuario: qs('usuarioUsuario').value.trim(),
      nombre: qs('usuarioNombre').value.trim(),
      rol: qs('usuarioRol').value,
      activo: qs('usuarioActivo').checked ? 1 : 0,
      permisos
    };
    const password = qs('usuarioPassword').value;

    try {
      if (!body.usuario) throw new Error('Usuario requerido');
      if (!body.rol) throw new Error('Rol requerido');

      if (!id) {
        if (!password) throw new Error('Contrasena requerida para nuevo usuario');
        await fetchJson('/api/usuarios', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...body, password })
        });
      } else {
        await fetchJson(`/api/usuarios/${encodeURIComponent(id)}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        });
        if (password && password.trim()) {
          await fetchJson(`/api/usuarios/${encodeURIComponent(id)}/password`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password })
          });
        }
      }
      usuarioModal?.hide();
      await recargarDatos();
      Swal.fire({ icon: 'success', title: 'Guardado', timer: 1800, showConfirmButton: false });
    } catch (e) {
      showError('usuarioError', e.message || 'Error');
    }
  }

  document.getElementById('btnGuardarUsuario')?.addEventListener('click', guardarUsuario);

  // ======================================================
  // MODAL: CAMBIAR PASSWORD
  // ======================================================
  function abrirPassword(u) {
    qs('passwordUserId').value = u.id;
    qs('passwordNueva').value = '';
    qs('passwordNueva2').value = '';
    showError('passwordError', '');
    passwordModal?.show();
    setTimeout(() => qs('passwordNueva')?.focus(), 250);
  }

  async function guardarPassword() {
    showError('passwordError', '');
    const id = qs('passwordUserId').value;
    const p1 = qs('passwordNueva').value;
    const p2 = qs('passwordNueva2').value;
    try {
      if (!p1) throw new Error('Contrasena requerida');
      if (p1 !== p2) throw new Error('Las contrasenas no coinciden');
      await fetchJson(`/api/usuarios/${encodeURIComponent(id)}/password`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ password: p1 })
      });
      passwordModal?.hide();
      Swal.fire({ icon: 'success', title: 'Contrasena actualizada', timer: 1800, showConfirmButton: false });
    } catch (e) {
      showError('passwordError', e.message || 'Error');
    }
  }

  document.getElementById('btnGuardarPassword')?.addEventListener('click', guardarPassword);

  // ======================================================
  // ELIMINAR USUARIO
  // ======================================================
  async function eliminarUsuario(u) {
    const ok = await Swal.fire({
      title: 'Eliminar usuario?',
      text: `Se eliminara: ${u.usuario}`,
      icon: 'warning',
      showCancelButton: true,
      confirmButtonText: 'Si, eliminar',
      cancelButtonText: 'Cancelar',
      confirmButtonColor: '#EF4444'
    });
    if (!ok.isConfirmed) return;
    try {
      await fetchJson(`/api/usuarios/${encodeURIComponent(u.id)}`, { method: 'DELETE' });
      await recargarDatos();
      Swal.fire({ icon: 'success', title: 'Eliminado', timer: 1600, showConfirmButton: false });
    } catch (e) {
      Swal.fire({ icon: 'error', title: e.message || 'Error' });
    }
  }

  // ======================================================
  // INIT: sync table if it's the default view
  // ======================================================
  if (currentView === 'tabla') {
    // Table was server-rendered; force sync from memory to keep consistency
    // Only re-render if JS data differs from SSR (data already loaded)
    // This is a no-op on initial load but ensures reload works
  }
});
