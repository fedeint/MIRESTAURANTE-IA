# Runbook: Debug en producción

> **Regla fundamental**: no debuggees en producción si puedes reproducirlo en dev. Solo recurres a este runbook cuando el bug SOLO aparece en prod.

## When to use

- Un usuario reporta un bug que no puedes reproducir en local
- El comportamiento en prod es diferente al de dev
- Los errores en Vercel logs no dan suficiente info
- Hay un performance issue específico a prod (lento solo allí)

## NO uses este runbook para

- Bugs reproducibles en local → arréglalos en local
- Exploración general → nunca explores datos de prod por curiosidad
- "Solo una consulta rápida" a la DB de prod → si no tienes un bug específico, no tienes por qué consultar

## Reglas de oro

1. **Read-only first** — nunca UPDATE/DELETE/INSERT en prod sin backup + plan de rollback
2. **No pegues datos reales en chats** — si necesitas compartir un resultado, redacta (oculta nombres, IDs, emails)
3. **Usa una session de DB separada** — no la misma que la app usa para servir tráfico
4. **Logea todo lo que hagas** — deja un audit trail de tus queries para el post-mortem
5. **Ten un plan antes de ejecutar** — escribe los pasos antes, no improvises

## Prerequisites

- [ ] Acceso al Supabase Dashboard → SQL Editor
- [ ] `psql` instalado localmente con el connection string de prod
- [ ] Acceso a Vercel logs
- [ ] Acceso a `/superadmin/observabilidad` del sistema
- [ ] Un issue con el bug reportado (para referenciar en el post-mortem)

## Debugging workflow

### Paso 1: Reunir info

Antes de tocar nada en prod, reúne toda la info disponible:

1. **Vercel logs del request que falló**:
   ```bash
   vercel logs --prod --follow  # tiempo real
   # O desde la UI: Vercel Dashboard → Deployments → logs
   ```

2. **Request ID del error** (si el usuario lo reportó con screenshot, puede tener el `X-Request-Id`):
   Esto permite filtrar logs exactos de ese request específico.

3. **Dashboard de observabilidad**: `/superadmin/observabilidad` muestra errores recientes agrupados.

4. **Grafana Cloud**: para latencia y tendencias. Busca spikes en el tiempo del bug.

5. **Pregúntale al usuario**:
   - ¿A qué hora exacta?
   - ¿Qué hiciste antes del error?
   - ¿Qué navegador/dispositivo?
   - ¿Puedes enviarme un screenshot?

### Paso 2: Reproduce si puedes

Si tienes una cuenta de admin en un tenant de staging o test, intenta reproducir allí. Si no puedes reproducir en staging, pasa al paso 3.

### Paso 3: Consulta read-only la DB

Solo `SELECT`, nunca `UPDATE/DELETE/INSERT`.

```sql
-- Ejemplo: investigar un pedido específico
SELECT
    p.id,
    p.tenant_id,
    p.estado,
    p.total,
    p.created_at,
    p.updated_at,
    m.numero as mesa_numero,
    u.nombre as mesero_nombre
FROM pedidos p
LEFT JOIN mesas m ON m.id = p.mesa_id
LEFT JOIN usuarios u ON u.nombre = p.mesero_nombre
WHERE p.tenant_id = <TENANT_ID>
  AND p.id = <PEDIDO_ID>;
```

**Usa siempre un LIMIT** para evitar traer millones de filas:
```sql
SELECT * FROM pedidos WHERE tenant_id = 42 LIMIT 100;
```

### Paso 4: Verifica el schema si sospechas corrupción

```sql
\d tabla_afectada     -- en psql
```

En Supabase SQL Editor, usa:
```sql
SELECT column_name, data_type, is_nullable
FROM information_schema.columns
WHERE table_name = 'tabla_afectada'
ORDER BY ordinal_position;
```

### Paso 5: Correlaciona con otros eventos

Si el bug ocurrió a las 14:35, busca qué pasó en ese minuto:

```sql
SELECT event_type, message, tenant_id, created_at
FROM audit_log
WHERE created_at BETWEEN '2026-04-08 14:34:00' AND '2026-04-08 14:36:00'
ORDER BY created_at;

SELECT ip, event, created_at
FROM ataques_log
WHERE created_at BETWEEN '2026-04-08 14:34:00' AND '2026-04-08 14:36:00';

SELECT usuario, ip, success, error_msg, created_at
FROM login_history
WHERE created_at BETWEEN '2026-04-08 14:34:00' AND '2026-04-08 14:36:00';
```

### Paso 6: Hipótesis + prueba en local

Con toda la info, formula una hipótesis clara:

> "Creo que el bug es causado por X, porque veo Y en los logs y Z en la DB."

Luego intenta reproducir en local con los datos equivalentes:

```bash
npm run dev
# Con un tenant de test, intenta replicar la secuencia exacta que causó el bug
```

Si reproduce en local → sal de producción y debuggea en local con tranquilidad.

### Paso 7: Si necesitas FIX en prod

**NO hagas el fix directamente en prod.** Siempre:

1. Abre un PR con el fix + test
2. Corre el CI
3. Review express con @Leonidasx8 (2 min si es obvio)
4. Merge a main → deploy automático
5. Verifica en prod

Si el bug es SEV-1 y no hay tiempo para PR, puedes hacer un hotfix directo. Pero eso es excepcional y requiere aprobación explícita de @Leonidasx8.

## Cosas que NUNCA haces en prod

- ❌ `DELETE FROM tabla WHERE ...` — usa soft delete (set `deleted_at`) o abre un PR
- ❌ `UPDATE tabla SET ...` masivo sin WHERE preciso
- ❌ `DROP TABLE` — nunca, jamás
- ❌ `TRUNCATE` — nunca, jamás
- ❌ `ALTER TABLE` — eso va por migration, no ad-hoc
- ❌ Exportar tablas enteras a un CSV y compartirlo — privacidad
- ❌ Ejecutar un `node -e "..."` contra la DB de prod desde tu máquina
- ❌ Conectarte a la DB de prod desde tu IDE como datasource persistente

## Herramientas útiles

```bash
# Ver queries lentas del último minuto (requires pg_stat_statements)
psql "$DATABASE_URL" -c "
  SELECT query, mean_exec_time, calls
  FROM pg_stat_statements
  ORDER BY mean_exec_time DESC
  LIMIT 20;
"

# Ver conexiones activas
psql "$DATABASE_URL" -c "
  SELECT pid, state, query, usename
  FROM pg_stat_activity
  WHERE state != 'idle';
"

# Matar una query atorada (solo si sabes qué estás haciendo)
psql "$DATABASE_URL" -c "SELECT pg_cancel_backend(<pid>);"
```

## Post-debug

1. Documenta el bug + el fix en el issue
2. Agrega un test de regresión si aplica (para que no vuelva a pasar)
3. Si encontraste algo raro en la DB (data inconsistente), abre un ticket para investigar cómo llegó ahí
4. Si la herramienta que usaste fue útil, agrégala a este runbook

## Contact

Bug complejo que no entiendes → @Leonidasx8. Mejor pedir ayuda 30 min que romper prod por 3 horas.
