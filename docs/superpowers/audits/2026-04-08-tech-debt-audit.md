# Tech Debt Audit — 2026-04-08

> **Scope:** Seguridad, tamaño de archivos, duplicación, dependencias.
> **Ejecutado por:** Agentes paralelos en sesión de proyecto-audit.
> **Branch:** `chore/project-audit`

---

## Resumen ejecutivo

| Categoría | Issues encontrados | Críticos | Prioridad |
|-----------|-------------------|----------|-----------|
| Seguridad | 9 | 3 | Alta |
| Tamaño de archivos | 3 | 3 | Media |
| Duplicación de código | 2 patrones | — | Media |
| Dependencias | 5 | 1 | Media |

**Top 3 acciones inmediatas:**
1. Eliminar `stack traces` de respuestas HTTP en producción (3 archivos, 4 líneas)
2. Extraer `escapeHtml` a `public/js/utils.js` (5 definiciones duplicadas)
3. Eliminar `mysql2` del proyecto (dependencia fantasma, 3.7 MB)

---

## 1. Seguridad

### SEV-HIGH: Stack traces en respuestas HTTP

Exponer `error.stack` en respuestas HTTP revela rutas internas, versiones de librerías y lógica del servidor. **Esto no debe llegar al cliente en producción.**

| Archivo | Línea | Código |
|---------|-------|--------|
| `routes/clientes.js` | 15 | `stack: error.stack` |
| `routes/cocina.js` | 26 | `stack: error.stack` (render 'error') |
| `routes/mesas.js` | 236 | `stack: error.stack` (render 'error') |
| `server.js` | 1201 | `stack: err.stack \|\| ''` |

**Fix:**
```js
// En vez de:
res.status(500).render('error', { error: { message: 'Error...', stack: error.stack } });

// Usar:
const isProd = process.env.NODE_ENV === 'production';
res.status(500).render('error', {
  error: { message: 'Error al cargar la página', stack: isProd ? null : error.stack }
});
```

---

### SEV-HIGH: SQL con interpolación de string (`${HOY}`)

El patrón `${HOY}` en queries SQL es interpolación directa de variable en la string SQL. Aunque `HOY` se calcula internamente (no es input del usuario), el patrón es peligroso porque:
1. Un refactor futuro podría introducir user input en esa variable.
2. Viola el principio de queries parametrizadas.
3. Confunde a revisores de seguridad.

**Archivos afectados:** `server.js` líneas 744, 748, 750, 754, 756, 814, 828, 843, 858 (9 instancias)

**Fix — usar `CURRENT_DATE AT TIME ZONE 'America/Lima'` directamente en SQL:**
```js
// En vez de:
const HOY = `(NOW() AT TIME ZONE 'America/Lima')::date`;
db.query(`SELECT ... WHERE fecha::date = ${HOY}`)

// Usar parámetro:
db.query(`SELECT ... WHERE fecha::date = CURRENT_DATE`, [])

// O si necesitas la zona horaria:
db.query(`SELECT ... WHERE (fecha AT TIME ZONE 'America/Lima')::date = (NOW() AT TIME ZONE 'America/Lima')::date`)
```

> **Nota:** Las queries de `tenant_id` ya usan `?` correctamente. Solo las queries que usan `${HOY}` tienen este problema.

---

### SEV-MEDIUM: Console.error con stack trace en logs

`routes/mesas.js` líneas 855 y 880 loguean `error.stack` via `console.error`. Los logs van a Vercel/Grafana Loki, que son accesibles por el equipo — esto es aceptable. Pero si algún día los logs van a un canal más amplio, revisar.

```js
// Línea 855:
console.error('[ALMACEN] ERROR descuento:', almErr.message, almErr.stack);
// Línea 880:
console.error('Error al enviar item a cocina:', error.message, error.stack);
```

**Acción:** Reemplazar con `logger.error()` de `lib/logger.js` (ya usa nivel SECURITY/ERROR apropiado).

---

## 2. Tamaño de archivos

Archivos que superan el umbral de mantenibilidad de 500 líneas:

| Archivo | Líneas | Razón del tamaño | Plan |
|---------|--------|-----------------|------|
| `public/js/mesas.js` | 2079 | Todo el JS del módulo mesas en un archivo | Extraer: `mesas-productos.js`, `mesas-comanda.js`, `mesas-pagos.js` |
| `routes/mesas.js` | 1373 | Rutas + lógica de negocio mezcladas | Extraer lógica a `services/mesas.js` |
| `server.js` | 1298 | Configuración + rutas inline + helpers | Extraer rutas inline al directorio `routes/` |

**Impacto de no actuar:** Los trabajadores SENATI tendrán dificultad leyendo y editando estos archivos. Los PRs tendrán conflictos de merge frecuentes en `routes/mesas.js`.

**Orden de refactor recomendado:**
1. `public/js/mesas.js` → split en 3 archivos (independiente, no afecta backend)
2. `routes/mesas.js` → extraer helpers a `services/mesas.js`
3. `server.js` → mover rutas inline a `routes/` (más riesgo, hacerlo al final)

> **Regla para workers:** Ningún archivo nuevo debe superar 400 líneas. Si necesitas más, es señal de que el módulo hace demasiado.

---

## 3. Duplicación de código

### `normalizarPagos` — 2 definiciones

La función que normaliza el array de métodos de pago está duplicada:

| Archivo | Línea | Tipo |
|---------|-------|------|
| `routes/facturas.js` | 25 | Función standalone (módulo) |
| `routes/mesas.js` | 1157 | Función inline (closure) |

**Fix:** Mover a `lib/pagos.js` y requerir desde ambos lugares:
```js
// lib/pagos.js
function normalizarPagos(pagos) { /* lógica única */ }
module.exports = { normalizarPagos };

// routes/mesas.js y routes/facturas.js:
const { normalizarPagos } = require('../lib/pagos');
```

---

### `escapeHtml` — 5 definiciones en frontend

La función de escape XSS está definida en cada archivo JS por separado:

| Archivo | Línea |
|---------|-------|
| `public/js/mesas.js` | 1826 |
| `public/js/productos.js` | 22 |
| `public/js/usuarios.js` | 32 |
| `public/js/cocina.js` | 48 |
| `public/js/onboarding-wizard.js` | 337 |

**Fix:** Extraer a `public/js/utils.js` y cargar antes que los otros scripts:
```js
// public/js/utils.js
window.escapeHtml = function(s) {
  if (!s) return '';
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&#39;');
};
```
Agregar `<script src="/js/utils.js"></script>` en `views/partials/head.ejs` antes de los otros scripts.

---

## 4. Dependencias

### ELIMINAR: `mysql2` (fantasma)

`mysql2` está en `package.json` pero el proyecto usa 100% PostgreSQL (`pg`). `db.js` tiene comentarios "match mysql2 format" pero eso es solo documentación de compatibilidad de la API — no hay `require('mysql2')` en ningún lado.

```bash
npm uninstall mysql2
# Ahorra ~3.7 MB en node_modules y reduce superficie de ataque
```

---

### REVISAR: `@supabase/supabase-js` + `pg` (clientes duplicados)

El proyecto tiene dos clientes de base de datos para Supabase:
- `pg` — usado en `db.js` (cliente principal, todas las queries)
- `@supabase/supabase-js` — verificar si se usa realmente

```bash
grep -r "require.*supabase\|from.*supabase" routes/ lib/ server.js
```

Si no se usa, eliminar con `npm uninstall @supabase/supabase-js`.

---

### REVISAR: `knex` (query builder sin usar)

`knex` está instalado pero `db.js` usa `pg` directamente con raw SQL. Verificar si hay algún archivo que lo use:

```bash
grep -r "require.*knex\|from.*knex" routes/ lib/ server.js
```

Si no se usa, eliminar con `npm uninstall knex`.

---

### REVISAR: `body-parser` (deprecated)

`body-parser` está en dependencias pero Express 4.16+ incluye `express.json()` y `express.urlencoded()` built-in. Verificar si hay algún uso directo:

```bash
grep -rn "require.*body-parser\|bodyParser" server.js routes/
```

Si solo se usa `express.json()` / `express.urlencoded()`, eliminar con `npm uninstall body-parser`.

---

### REVISAR: Frontend libs en server package.json

`jquery`, `bootstrap`, `select2`, `select2-bootstrap-5-theme`, `sweetalert2`, `chart.js`, `bootstrap-icons` están en `dependencies` del servidor. Estas son librerías de frontend — se deberían servir desde CDN o tener su propio `package.json` en `public/`.

**Impacto:** Inflan el bundle de node_modules, pueden confundir Vercel al optimizar el deploy. Bajo riesgo funcional — prioridad baja.

---

## Backlog priorizado

| # | Item | Esfuerzo | Impacto | Asignable a worker |
|---|------|----------|---------|-------------------|
| 1 | Eliminar stack traces de respuestas HTTP | 30 min | Alto (seguridad) | Sí |
| 2 | Eliminar `mysql2` del proyecto | 5 min | Medio (deps) | Sí |
| 3 | Extraer `escapeHtml` a `public/js/utils.js` | 1h | Medio (deuda) | Sí |
| 4 | Reemplazar `${HOY}` por SQL nativo en server.js | 2h | Alto (seguridad) | No (@Leonidasx8) |
| 5 | Extraer `normalizarPagos` a `lib/pagos.js` | 30 min | Bajo (deuda) | Sí |
| 6 | Verificar y eliminar `@supabase/supabase-js` si no se usa | 15 min | Bajo (deps) | Sí |
| 7 | Verificar y eliminar `knex` si no se usa | 15 min | Bajo (deps) | Sí |
| 8 | Split `public/js/mesas.js` en 3 archivos | 4h | Medio (mantenibilidad) | No (@Leonidasx8) |
| 9 | Extraer lógica de `routes/mesas.js` a `services/mesas.js` | 6h | Medio (mantenibilidad) | No (@Leonidasx8) |
| 10 | Mover rutas inline de `server.js` a `routes/` | 8h | Medio (mantenibilidad) | No (@Leonidasx8) |

> Items marcados **"No (@Leonidasx8)"** afectan archivos críticos con alto riesgo de regresión. No asignar a workers hasta que exista cobertura de tests apropiada.

---

## Próximas acciones

1. **Esta semana:** Items 1–3, 6–7 — bajo riesgo, alto valor
2. **Sprint siguiente:** Items 4–5 con tests de regresión
3. **Planificar:** Items 8–10 como proyectos separados, con spec + plan + subagent-driven-development
