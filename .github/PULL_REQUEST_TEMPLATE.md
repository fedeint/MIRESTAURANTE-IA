<!--
  Template obligatorio para todo PR. Los PRs sin este checklist se cierran sin review.
  Borra las secciones que no apliquen pero NO borres el checklist final.
-->

## Qué hace este PR

<!-- 1-3 oraciones explicando el cambio. Enfócate en el "qué" y el "por qué". No copies el diff. -->

## Módulo afectado

- [ ] Caja
- [ ] Cocina
- [ ] Mesas
- [ ] Delivery
- [ ] Productos
- [ ] Clientes
- [ ] Recetas
- [ ] Reportes
- [ ] Almacén
- [ ] Otro: <!-- especificar -->

## Tipo de cambio

- [ ] feat — feature nueva
- [ ] fix — bug fix
- [ ] refactor — refactorización sin cambio de comportamiento
- [ ] docs — solo documentación
- [ ] chore — limpieza, deps, config
- [ ] style — formato

## Screenshots (obligatorio para cambios visuales)

<!--
  Si tu cambio afecta la UI, adjunta screenshots:
  - Desktop (ancho 1440)
  - Mobile/PWA (ancho 430)
  Si es un flujo, múltiples screenshots en secuencia.
-->

## Plan de pruebas

<!-- Cómo verificaste que tu cambio funciona. Sé específico. -->

- [ ] `npm test` pasa al 100%
- [ ] Probado en navegador desktop
- [ ] Probado en navegador mobile (o DevTools con viewport 430x932)
- [ ] Si tu cambio afecta data del servidor, probado con datos reales en dev
- [ ] Si tu cambio agrega una vista nueva, ambas variantes (`.ejs` + `-desktop.ejs`) fueron creadas y registradas en `tests/view-variants.test.js`

## Checklist de calidad

- [ ] Leí [CONTRIBUTING.md](../CONTRIBUTING.md) y [SECURITY.md](../SECURITY.md)
- [ ] Mi código sigue las reglas de seguridad (no secrets, no SQL concat, validación con zod)
- [ ] Toqué **solo** los archivos de mi módulo asignado
- [ ] No toqué `server.js`, `db.js`, `lib/**`, `middleware/**`, `migrations/**`, `views/partials/**`, `package.json` sin coordinar
- [ ] No dejé `console.log`, `debugger`, ni código comentado de debug
- [ ] No dejé TODOs sin un ticket o issue asociado
- [ ] El pre-commit hook corrió y pasó
- [ ] Mi rama está actualizada contra `main` (rebase o merge reciente)
- [ ] El título del PR sigue el formato `<tipo>(<modulo>): <descripcion>` (ej: `feat(caja): agregar filtro por fecha`)

## Cambios en la base de datos

- [ ] **Este PR NO toca `migrations/`** ✅ (por defecto — toca solo si coordinaste con Leonidas)
- [ ] Si toca `migrations/`: expliqué el plan de rollback y la compatibilidad hacia atrás

## Breaking changes

- [ ] **Este PR NO introduce breaking changes** ✅ (por defecto)
- [ ] Si introduce breaking changes: los listé aquí y expliqué el plan de migración

## Dependencias nuevas

- [ ] **Este PR NO agrega dependencias nuevas** ✅ (por defecto)
- [ ] Si agrega: justificación (por qué, alternativas consideradas, CVEs revisados con `npm audit`)

## Notas para el reviewer

<!-- Cualquier contexto extra que te ayude a Leonidas a entender el PR. Decisiones raras, trade-offs, preguntas abiertas. -->

---

> 🤖 **Reviewer automático**: Este PR será revisado por Claude (AI assistant) antes de que Leonidas lo mergee. Si Claude pide cambios, atiende sus comentarios en nuevos commits (no `--amend`).
