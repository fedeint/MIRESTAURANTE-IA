// module-map-parser.js — Scans routes/ to extract endpoints and update module-map.json
// Used by the devicePreview.generateMap command

const fs = require('fs');
const path = require('path');

/**
 * Count HTTP method route registrations in a route file.
 * Matches patterns like: router.get(...), router.post(...), app.get(...), etc.
 */
function countEndpoints(filePath) {
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const matches = content.match(/\b(router|app)\.(get|post|put|patch|delete|all)\s*\(/gi);
    return matches ? matches.length : 0;
  } catch {
    return 0;
  }
}

/**
 * Extract route paths registered in server.js (or app.js).
 * Looks for: app.use('/path', routerVar) and app.use('/path', require(...))
 */
function extractMountPoints(serverFilePath) {
  const mounts = {};
  try {
    const content = fs.readFileSync(serverFilePath, 'utf8');
    // Match: app.use('/route', ...) or router.use('/route', ...)
    const re = /(?:app|router)\.use\(['"]([^'"]+)['"]\s*,\s*(?:require\(['"]([^'"]+)['"]\)|(\w+))/g;
    let m;
    while ((m = re.exec(content)) !== null) {
      const mountPath = m[1];
      const requirePath = m[2] || '';
      const varName = m[3] || '';
      // Normalize route file name
      const fileName = requirePath ? path.basename(requirePath).replace(/\.js$/, '') : varName;
      if (fileName) mounts[fileName] = mountPath;
    }
  } catch {
    /* server.js not found or unreadable */
  }
  return mounts;
}

/**
 * Extract role requirements from a route file.
 * Looks for: requireRole('role'), middleware.requireRole('role'), ['role1','role2']
 */
function extractRoles(filePath) {
  const roles = new Set();
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const re = /requireRole\s*\(\s*['"]([^'"]+)['"]\s*\)/g;
    let m;
    while ((m = re.exec(content)) !== null) roles.add(m[1]);
  } catch { /* ignore */ }
  return Array.from(roles);
}

/**
 * Extract key endpoints (first 5 route definitions with their paths).
 */
function extractKeyEndpoints(filePath) {
  const endpoints = [];
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    const re = /\b(?:router|app)\.(get|post|put|patch|delete)\s*\(\s*['"`]([^'"`]+)['"`]/gi;
    let m;
    while ((m = re.exec(content)) !== null && endpoints.length < 5) {
      endpoints.push(`${m[1].toUpperCase()} ${m[2]}`);
    }
  } catch { /* ignore */ }
  return endpoints;
}

/**
 * Main function: scan routes/ and update module-map.json.
 *
 * Strategy:
 * - Read existing module-map.json (preserves categories, pipelines, manual enrichment)
 * - For each module, find the matching routes/ file and update endpointCount, keyEndpoints, roles
 * - Append any new route files not yet in the map as uncategorized modules
 *
 * @param {string} workspaceRoot - Root of the project being previewed
 * @param {string} extensionPath - Path to the extension (for module-map.json location)
 * @returns {{ added: number, updated: number, map: object }}
 */
function parseAndUpdateMap(workspaceRoot, extensionPath) {
  const routesDir = path.join(workspaceRoot, 'routes');
  const mapPath = path.join(extensionPath, 'preview', 'module-map.json');
  const serverPath = path.join(workspaceRoot, 'server.js');

  // Load existing map
  let map = { categories: [], pipelines: [], auth: null };
  if (fs.existsSync(mapPath)) {
    try { map = JSON.parse(fs.readFileSync(mapPath, 'utf8')); } catch { /* use default */ }
  }

  // Get all route files
  const routeFiles = [];
  if (fs.existsSync(routesDir)) {
    fs.readdirSync(routesDir)
      .filter(f => f.endsWith('.js'))
      .forEach(f => routeFiles.push({ file: f, id: f.replace(/\.js$/, '') }));
  }

  // Get server.js mount points
  const mounts = extractMountPoints(serverPath);

  // Build index of existing modules by routeFile basename
  const moduleIndex = {};
  const allModules = [];
  if (map.auth) allModules.push(map.auth);
  (map.categories || []).forEach(cat => (cat.modules || []).forEach(m => allModules.push(m)));
  allModules.forEach(m => {
    const key = m.routeFile ? path.basename(m.routeFile).replace(/\.js$/, '') : m.id;
    moduleIndex[key] = m;
  });

  let updated = 0;
  let added = 0;
  const seenIds = new Set();

  // Update existing modules with fresh data
  routeFiles.forEach(({ file, id }) => {
    const filePath = path.join(routesDir, file);
    const count = countEndpoints(filePath);
    const roles = extractRoles(filePath);
    const keyEndpoints = extractKeyEndpoints(filePath);
    const mountPath = mounts[id];

    seenIds.add(id);

    if (moduleIndex[id]) {
      const mod = moduleIndex[id];
      mod.endpointCount = count;
      if (roles.length > 0) mod.roles = [...new Set([...(mod.roles || []), ...roles])];
      if (keyEndpoints.length > 0) mod.keyEndpoints = keyEndpoints;
      if (mountPath && !(mod.routes || []).includes(mountPath)) {
        mod.routes = mod.routes || [];
        if (!mod.routes.includes(mountPath)) mod.routes.unshift(mountPath);
      }
      updated++;
    } else {
      // New route file not yet in the map — add to a "Nuevos" category
      let newCat = (map.categories || []).find(c => c.id === 'new');
      if (!newCat) {
        newCat = { id: 'new', name: 'Nuevos (auto-detectados)', color: '#777777', modules: [] };
        map.categories = map.categories || [];
        map.categories.push(newCat);
      }
      newCat.modules = newCat.modules || [];
      newCat.modules.push({
        id,
        name: id.charAt(0).toUpperCase() + id.slice(1).replace(/-/g, ' '),
        routeFile: `routes/${file}`,
        status: 'pending',
        roles: roles.length ? roles : ['administrador'],
        dependsOn: [],
        blocks: [],
        routes: mountPath ? [mountPath] : [`/${id}`],
        endpointCount: count,
        keyEndpoints,
        screens: [],
      });
      added++;
    }
  });

  // Save updated map
  fs.writeFileSync(mapPath, JSON.stringify(map, null, 2), 'utf8');

  return { added, updated, map };
}

module.exports = { parseAndUpdateMap, countEndpoints, extractKeyEndpoints, extractRoles };
