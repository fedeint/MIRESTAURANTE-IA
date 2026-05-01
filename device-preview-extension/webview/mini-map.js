// mini-map.js — Mini map context panel showing module info for current route

let moduleMap = null;
let allModules = [];

function loadModuleMap(data) {
  moduleMap = data;
  allModules = [];
  if (data.auth) allModules.push(data.auth);
  (data.categories || []).forEach(cat => {
    (cat.modules || []).forEach(mod => {
      mod._categoryColor = cat.color;
      mod._categoryName = cat.name;
      allModules.push(mod);
    });
  });
}

function findModuleByRoute(route) {
  if (!route || !allModules.length) return null;
  const clean = route.split('?')[0].replace(/\/+$/, '') || '/';
  let best = null;
  let bestLen = 0;
  for (const mod of allModules) {
    for (const r of (mod.routes || [])) {
      if (clean.startsWith(r) && r.length > bestLen) {
        best = mod;
        bestLen = r.length;
      }
    }
  }
  return best;
}

function getPipeline(moduleId) {
  if (!moduleMap?.pipelines) return null;
  for (const p of moduleMap.pipelines) {
    if (p.steps.includes(moduleId)) return p;
  }
  return null;
}

function renderMiniMap(containerId, route) {
  const container = document.getElementById(containerId);
  if (!container) return;

  const mod = findModuleByRoute(route);
  if (!mod) {
    container.style.display = 'none';
    return;
  }
  container.style.display = 'flex';

  const pipeline = getPipeline(mod.id);
  const deps = (mod.dependsOn || []).map(id => allModules.find(m => m.id === id)).filter(Boolean);
  const blocks = (mod.blocks || []).map(id => allModules.find(m => m.id === id)).filter(Boolean);

  const pipelineHtml = pipeline ? `
    <div class="mini-map-section">
      <span class="mini-map-label">PIPELINE ACTIVO</span>
      <div class="pipeline-flow">
        ${pipeline.steps.map((stepId, i) => {
          const isLast = i === pipeline.steps.length - 1;
          return `<span class="pipeline-step ${stepId === mod.id ? 'active' : ''}">${stepId}</span>${isLast ? '' : '<span class="pipeline-arrow">\u2192</span>'}`;
        }).join('')}
      </div>
    </div>
  ` : '';

  const depsHtml = (deps.length || blocks.length) ? `
    <div class="mini-map-section">
      <span class="mini-map-label">DEPENDENCIAS</span>
      <div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap;">
        ${deps.length ? '<span style="font-size:7px;color:var(--inactive);">depende de:</span>' : ''}
        ${deps.map(d => `<span class="dep-chip depends">${d.name}</span>`).join('')}
      </div>
      <div style="display:flex;gap:4px;align-items:center;flex-wrap:wrap;margin-top:2px;">
        ${blocks.length ? '<span style="font-size:7px;color:var(--inactive);">bloquea a:</span>' : ''}
        ${blocks.map(b => `<span class="dep-chip blocks">${b.name}</span>`).join('')}
      </div>
    </div>
  ` : '';

  const endpointsHtml = `
    <div class="mini-map-section">
      <span class="mini-map-label">ENDPOINTS CLAVE</span>
      ${(mod.keyEndpoints || []).slice(0, 5).map(ep => `<span class="endpoint-line">${ep}</span>`).join('')}
      ${(mod.endpointCount || 0) > 5 ? `<span style="font-size:7px;color:var(--inactive);">... +${mod.endpointCount - 5} m\u00e1s</span>` : ''}
    </div>
  `;

  const statusColor = mod.status === 'active' ? 'var(--teal)' : 'var(--orange)';

  container.innerHTML = `
    <div class="mini-map-header">
      <span style="color:var(--purple);font-size:14px;">&#9783;</span>
      <span class="mini-map-title">CONTEXTO DEL MODULO</span>
      <span style="display:inline-flex;align-items:center;gap:4px;height:18px;padding:0 8px;border-radius:9px;border:1px solid var(--inactive);font-size:10px;">
        <span style="width:6px;height:6px;border-radius:50%;background:${statusColor};display:inline-block;"></span>
        <span style="font-family:'Oswald',sans-serif;font-weight:600;">${mod.name}</span>
      </span>
      <span style="font-size:9px;color:var(--text-secondary);">${(mod.routes || []).join(' \u00b7 ')} \u00b7 ${mod.endpointCount || '?'} endpoints</span>
      <span style="margin-left:auto;font-size:7px;font-weight:600;padding:0 6px;height:14px;border-radius:4px;background:rgba(99,102,241,0.15);color:var(--purple);display:inline-flex;align-items:center;">${(mod.roles || []).join(' \u00b7 ')}</span>
    </div>
    <div class="mini-map-content">
      ${pipelineHtml}
      ${depsHtml}
      ${endpointsHtml}
    </div>
  `;
}

window.miniMapSystem = { load: loadModuleMap, render: renderMiniMap, findModule: findModuleByRoute };
