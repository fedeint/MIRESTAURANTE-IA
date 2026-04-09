# Runbook: Rotate credentials

> ⚠️ **Solo `@Leonidasx8` ejecuta este runbook.** Workers NUNCA rotan secretos.

## When to use

- Un secret fue comprometido (pegado en chat, commit por error, leaked en logs)
- Rotación preventiva programada (ver tabla de rotación en `SECURITY.md`)
- Un empleado que tenía acceso ya no trabaja aquí
- Cambio de provider (ej: moviste de SendGrid a Resend)

## Prerequisites

- Acceso de admin al provider correspondiente (Supabase, Vercel, Google Cloud, Meta, etc.)
- Acceso a `.env.local` de producción en tu máquina
- Tiempo ininterrumpido: ~15 min para rotaciones simples, ~1 h para rotaciones con downtime

## Secretos que se rotan y cómo

### 1. `SESSION_SECRET`

**Impacto**: al rotar, todas las sesiones activas se invalidan y los usuarios tienen que re-loguearse.

**Pasos**:
```bash
# 1. Genera un secret nuevo (32 bytes en hex)
openssl rand -hex 32
# Copia el output

# 2. Actualízalo en Vercel
vercel env rm SESSION_SECRET production
echo "<el-nuevo-secret>" | vercel env add SESSION_SECRET production

# 3. Redeploy
vercel --prod
# O si ya está en main, cualquier push nuevo dispara redeploy

# 4. Verifica que el deploy completó
# (Vercel Dashboard o `vercel ls`)
```

Los usuarios activos verán "Sesión expirada" y tendrán que loguearse de nuevo. Esto es esperado.

### 2. `DATABASE_URL` (Supabase password)

**Impacto**: downtime hasta que el nuevo URL esté propagado en todos los clientes.

**Pasos**:
1. Ve a Supabase Dashboard → **Settings → Database → Database password**
2. Click **"Generate a new password"**
3. Copia el nuevo connection string (formato `postgres://postgres:NEW_PASS@.../postgres`)
4. Actualízalo en Vercel:
   ```bash
   vercel env rm DATABASE_URL production
   # Luego en la UI de Vercel → Settings → Environment Variables → Add:
   # Name: DATABASE_URL
   # Value: <el nuevo connection string>
   # Environments: Production, Preview, Development
   ```
5. Redeploy: push a main o `vercel --prod`
6. Verifica que el health check del app responde 200

**Rollback**: si el nuevo password rompe, Supabase te permite setear un password específico (no solo "generar nuevo"). Úsalo si necesitas volver al anterior temporalmente.

### 3. `GOOGLE_CLIENT_SECRET`

**Impacto**: los logins con Google fallan hasta que el nuevo secret se propague.

**Pasos**:
1. Ve a https://console.cloud.google.com/apis/credentials
2. Selecciona tu OAuth Client
3. Click **"Reset secret"** — genera uno nuevo
4. Copia el nuevo secret (solo se muestra una vez)
5. Actualiza en Vercel: `GOOGLE_CLIENT_SECRET`
6. Redeploy
7. Testea con un login de Google

### 4. API keys de terceros (Meta, TikTok, Anthropic, etc.)

Cada provider tiene su propio flujo. Patrón general:

1. Ve al dashboard del provider
2. Revoca el key viejo (si es posible)
3. Genera uno nuevo
4. Actualízalo en Vercel env vars
5. Redeploy
6. Testea el endpoint que usa el key

**Importante**: algunos providers (Meta) tienen limit de rotaciones por mes. Si necesitas rotar muchas veces, usa un nuevo token en vez de reset del existente.

### 5. Contraseña de usuario admin

**Cuando**: si un admin reutilizaba su password en otros servicios que fueron hackeados (ver haveibeenpwned.com).

**Pasos**:
1. Login como superadmin
2. Ve a `/superadmin/tenants` → selecciona el tenant → usuarios
3. Reset password (genera uno temporal)
4. Comunica el nuevo password al usuario por canal privado
5. El usuario debe cambiarlo en su primer login (el sistema fuerza el cambio si el flag `requiere_cambio_password` está en 1)

## Verification

- [ ] El secret viejo ya no funciona (intenta login/query con él)
- [ ] El secret nuevo funciona (smoke test del endpoint afectado)
- [ ] Vercel deploy completó sin errores
- [ ] El canal de comunicación del nuevo secret es privado (no chat grupal, no email sin cifrar)
- [ ] El secret viejo fue eliminado de Vercel (no solo reemplazado)
- [ ] El secret viejo fue eliminado de tu `.env.local` local

## Post-rotación

1. Documenta la rotación en `SECURITY.md` sección "Incidentes pasados" si fue reactiva
2. Si fue preventiva, actualiza la tabla de rotación con la fecha
3. Si el secret leaked, investiga cómo para prevenir el próximo leak

## Contact

Si algo sale mal durante la rotación y hay downtime, contacta inmediatamente a `@Leonidasx8` (eres tú si estás leyendo esto como admin principal — en ese caso, mantén la calma y sigue los pasos de rollback).
