# Runbook: Run a database migration

> ⚠️ **Solo `@Leonidasx8` ejecuta migrations contra producción.** Workers NUNCA tocan `migrations/` sin autorización escrita.

## When to use

Usa este runbook cuando:
- Hay un nuevo archivo `migrations/YYYYMMDD_*.sql` que necesita aplicarse
- Modificaste la estructura de una tabla existente
- Agregaste índices, constraints, o columnas nuevas

**NO uses este runbook** para:
- Modificaciones a datos de negocio (eso va en UPDATE/INSERT regulares desde la app)
- Cambios de config de Supabase (dashboards, RLS) — esos se hacen en la UI de Supabase

## Prerequisites

- [ ] Acceso al Supabase Dashboard del proyecto
- [ ] Contraseña del usuario `postgres` del proyecto (guardada en tu password manager)
- [ ] `psql` instalado localmente (`brew install postgresql` en Mac)
- [ ] `DATABASE_URL` válido en tu `.env` local
- [ ] La migration YA fue revisada y mergeada en un PR — jamás ejecutes una migration que no está en `main`

## Principios antes de empezar

1. **Toda migration debe ser idempotente** — usa `IF NOT EXISTS` / `IF EXISTS` / `DROP CONSTRAINT IF EXISTS`. Si se corre dos veces no debe romperse.
2. **Toda migration debe estar en una transacción** — envuelve con `BEGIN;` y `COMMIT;`. Si falla a la mitad, nada se aplica.
3. **Toda migration debe tener un rollback plan** — qué hacer si el deploy falla después de correrla.
4. **Correr primero en staging, después en prod** — si tienes staging DB, pruébala ahí primero. Si no, haz backup antes.
5. **NUNCA corras migrations durante horas pico** — horario preferido: 3 AM hora Perú, cuando hay cero tráfico.
6. **NUNCA interrumpas una migration en ejecución** — si Control+C a la mitad, la DB puede quedar en estado inconsistente.

## Steps

### 1. Backup de la DB

Antes de CUALQUIER cambio de schema, crea un snapshot en Supabase Dashboard:

1. Ve a https://supabase.com/dashboard/project/<YOUR_PROJECT>/database/backups
2. Click en **"Create backup"**
3. Espera confirmación (puede tardar 1-5 min según tamaño)
4. Anota el ID del backup — lo necesitarás si hay que rollback

Si no tienes el botón de backup (plan free), usa `pg_dump` manualmente:

```bash
# Con DATABASE_URL en tu entorno
pg_dump "$DATABASE_URL" > /tmp/backup-$(date +%Y%m%d-%H%M).sql
ls -lh /tmp/backup-*.sql  # verifica que no está vacío
```

### 2. Revisa la migration

```bash
cd "/Users/leonidasyauri/Sistema para gesionar restaurantes"
cat migrations/YYYYMMDD_<nombre>.sql
```

Lee TODO el archivo. Asegúrate que:
- [ ] Empieza con `BEGIN;` y termina con `COMMIT;`
- [ ] Usa `IF NOT EXISTS` para CREATE y `IF EXISTS` para DROP
- [ ] Tiene comentarios explicando cada bloque
- [ ] No tiene `DROP TABLE` sin `CASCADE` warning
- [ ] No tiene `DELETE FROM` sin `WHERE` (peligro extremo)

### 3. Dry-run en una transacción de prueba

```bash
# Corre la migration dentro de una transacción que haces rollback automáticamente
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 <<EOF
BEGIN;
\i migrations/YYYYMMDD_<nombre>.sql
ROLLBACK;
EOF
```

Si ves errores → NO sigas. Arregla la migration y vuelve al paso 2.

Si ves `ROLLBACK` al final sin errores → la migration es sintácticamente válida.

### 4. Aplica la migration de verdad

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f migrations/YYYYMMDD_<nombre>.sql
```

Debes ver:
- `BEGIN`
- Cada statement aplicándose
- `COMMIT` al final

Si ves `ROLLBACK` → la migration falló. Ve a **Rollback** abajo.

### 5. Verifica el schema post-migration

```bash
psql "$DATABASE_URL" -c "\d <tabla_afectada>"
```

Confirma que:
- [ ] Las columnas nuevas existen con el tipo correcto
- [ ] Los constraints se aplicaron
- [ ] Los índices nuevos están listados
- [ ] Los datos existentes no se corrompieron (`SELECT COUNT(*) FROM tabla_afectada`)

### 6. Deploy el código que usa el schema nuevo

Mergea el PR de código que depende de la migration. Esto dispara el deploy automático en Vercel.

Verifica en Vercel Dashboard que el deploy completó sin errores.

### 7. Smoke test en producción

```bash
# Con curl contra tu dominio de producción
curl -s https://mirestconia.com/login -o /dev/null -w "%{http_code}\n"  # debe dar 200
```

Hazle login con tu cuenta de admin y navega a la pantalla afectada por la migration. Verifica que funciona.

## Verification

- [ ] Backup creado y anotado
- [ ] Dry-run sin errores
- [ ] Migration aplicada con `COMMIT` (no `ROLLBACK`)
- [ ] `\d tabla` muestra el schema esperado
- [ ] Deploy de código completado en Vercel
- [ ] Smoke test en producción pasa

## Rollback

### Si la migration falla ANTES del COMMIT

La transacción ya hizo `ROLLBACK` automático. No hay que hacer nada. Arregla el SQL y reintenta.

### Si la migration se aplicó pero el código rompió

Opción A — **Rollback el código primero** (más seguro):
1. En Vercel Dashboard, promueve el deploy anterior (botón "Promote to Production")
2. Verifica que el código viejo funciona con el schema nuevo (si la migration es backwards-compatible, sí)
3. Investiga por qué el código nuevo falló
4. Fix forward en un PR nuevo

Opción B — **Rollback el schema** (destructivo, solo si es urgente):
1. Escribe un SQL inverso que deshaga la migration
2. Córrelo con `psql "$DATABASE_URL" -f /tmp/rollback.sql`
3. Si el rollback no es trivial, usa el backup:
   ```bash
   psql "$DATABASE_URL" < /tmp/backup-YYYYMMDD-HHMM.sql
   ```
   **Atención**: restaurar un backup implica perder todas las transacciones entre el backup y el momento del restore.

## Post-mortem

Si tuviste que hacer rollback:
1. Documenta qué salió mal en `docs/superpowers/audits/YYYY-MM-DD-migration-failure.md`
2. Agrega el incidente a `SECURITY.md` sección "Incidentes pasados"
3. Si es un tipo de error recurrente, agrega una regla al CI o al runbook

## Contact

Si algo sale mal y no sabes qué hacer: **detén todo**, preserva el estado, y contacta inmediatamente a `@Leonidasx8` por el canal de emergencia (WhatsApp).
