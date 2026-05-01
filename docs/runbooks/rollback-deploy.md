# Runbook: Rollback a production deploy

> ⚠️ **Solo `@Leonidasx8` ejecuta rollbacks.** Si ves producción caída, avísale inmediatamente.

## When to use

- Un deploy nuevo rompió producción (500s, timeouts, crash loops)
- Un bug crítico en el último deploy afecta a usuarios reales (bloquea operaciones)
- Una migration se aplicó bien pero el código nuevo no funciona como esperado

**NO uses este runbook** para:
- Bugs menores que no bloquean operación (abre un hotfix PR en vez)
- Problemas de terceros (Supabase down, Meta API down) — esos no se arreglan con rollback

## Prerequisites

- Acceso admin a Vercel Dashboard
- (Opcional) `vercel` CLI instalado
- 5 minutos de atención ininterrumpida

## Options

### Opción A: Rollback via Vercel Dashboard (MÁS FÁCIL, 2 min)

1. Ve a https://vercel.com/leonidasyuriyauri-gmailcoms-projects/sistema-para-gesionar-restaurantes/deployments
2. Encuentra el último deploy que SÍ funcionaba (el que está arriba del roto)
3. Click en los 3 puntos (`⋯`) → **"Promote to Production"**
4. Confirma la promoción
5. Espera ~30 segundos a que se propague
6. Verifica: `curl -s https://mirestconia.com/login -o /dev/null -w "%{http_code}\n"` → debe dar 200

Vercel NO toca la DB. Solo cambia a qué deploy apunta el tráfico de producción.

### Opción B: Rollback via CLI

```bash
cd "/Users/leonidasyauri/Sistema para gesionar restaurantes"

# 1. Lista los deploys recientes
vercel ls

# 2. Identifica el SHA del deploy anterior que funcionaba
vercel inspect <deploy-url-anterior>

# 3. Promueve ese deploy a producción
vercel promote <deploy-url-anterior> --scope=<tu-team>
```

### Opción C: Revert del commit + push

Si el rollback Vercel no es suficiente (ej: el deploy viejo también tiene un bug), revierte el commit:

```bash
git checkout main
git pull origin main
git revert <SHA-del-commit-malo> --no-edit
git push origin main
```

Esto dispara un deploy nuevo con el revert. Tarda ~2 min en Vercel.

## Si la migration rompió la DB también

Ver [run-migration.md](./run-migration.md) sección "Rollback". El orden correcto es:

1. **Primero rollback el código** (vía Vercel promote) — el código viejo no usa el schema nuevo
2. **Segundo rollback la migration** (si es necesario) usando el SQL inverso o el backup

**Nunca** rollbackees la migration primero sin el código — el código nuevo fallaría contra el schema viejo.

## Verification

- [ ] El endpoint principal responde 200 (`curl https://mirestconia.com/login`)
- [ ] Puedes loguearte como admin
- [ ] El dashboard carga sin errores
- [ ] No hay spike de 500s en Vercel Analytics o Grafana
- [ ] Los errores que motivaron el rollback ya no aparecen

## Post-rollback

1. **Comunica al equipo** que hubo rollback (canal interno, no clientes)
2. **Preserva el deploy roto** en Vercel (no lo borres) para poder investigar
3. **Abre un issue** `[Incident] <fecha>: rollback de producción por <razón>` con:
   - Timeline (hora detectado, hora rollback, hora resuelto)
   - Root cause (lo que causó el bug)
   - Impacto (cuántos usuarios afectados, qué transacciones perdidas)
   - Action items (qué hacer para que no vuelva a pasar)
4. **Fix forward en un PR nuevo** — no re-deployes el rollback hasta que el bug esté arreglado
5. **Post-mortem** en `docs/superpowers/audits/YYYY-MM-DD-incident.md`

## Contact

Incident activo que no puedes resolver en 15 min → contacta a `@Leonidasx8` por WhatsApp directo.
