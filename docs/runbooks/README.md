# Runbooks

Guías paso-a-paso para operaciones comunes del sistema. Úsalas cuando necesites hacer una tarea que requiere varios pasos y donde equivocarse tiene costo.

## Index

### Operaciones

- [run-migration.md](./run-migration.md) — Cómo correr una migration SQL contra Supabase de forma segura
- [rotate-credentials.md](./rotate-credentials.md) — Rotación de secretos (DB, SESSION_SECRET, API keys)
- [onboard-new-tenant.md](./onboard-new-tenant.md) — Crear un nuevo restaurante cliente
- [rollback-deploy.md](./rollback-deploy.md) — Cómo revertir un deploy a producción que rompió algo

### Emergencias

- [incident-response.md](./incident-response.md) — Qué hacer cuando algo está caído o hay un ataque activo
- [debug-production.md](./debug-production.md) — Cómo debuggear un bug en producción sin romper más cosas

### Desarrollo

- [first-pr.md](./first-pr.md) — Guía paso a paso del primer PR para workers nuevos (alias de `docs/onboarding/README.md`)

---

## Convenciones de los runbooks

Cada runbook tiene estas secciones:

1. **When to use this** — Cuándo aplica este runbook y cuándo NO
2. **Prerequisites** — Lo que necesitas antes de empezar (acceso, herramientas, info)
3. **Steps** — Pasos numerados con comandos exactos
4. **Verification** — Cómo confirmar que terminaste bien
5. **Rollback** — Qué hacer si algo sale mal a la mitad
6. **Contact** — A quién pedir ayuda si te atoras

Todos los comandos asumen que estás en la raíz del repo. Si no, `cd` a la raíz primero.

---

## Si no encuentras un runbook para tu problema

1. Busca en [CLAUDE.md](../../CLAUDE.md) si la regla existe
2. Busca en [docs/superpowers/specs/](../superpowers/specs/) si hay un diseño previo
3. Pregúntale a `@Leonidasx8`
4. Si es un problema recurrente, **crea un runbook nuevo** en este directorio como parte del fix
