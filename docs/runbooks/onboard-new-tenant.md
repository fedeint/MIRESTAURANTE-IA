# Runbook: Onboard a new tenant (restaurante cliente)

> Cómo dar de alta un nuevo restaurante cliente en el SaaS. Usado por `@Leonidasx8` o superadmin.

## When to use

- Un restaurante nuevo firmó el contrato y necesita acceso al sistema
- Una demo de ventas que necesita un tenant aislado
- Migration de un tenant del ambiente de staging a producción

## Prerequisites

- [ ] Acceso como `superadmin` al panel `/superadmin/tenants`
- [ ] Datos del restaurante cliente: nombre comercial, razón social, RUC, dirección, dueño, email, teléfono
- [ ] Plan contratado (basic, pro, enterprise) — afecta qué módulos están habilitados
- [ ] Slug único para el subdominio (ej: `elrico` para `elrico.mirestconia.com`)

## Steps

### 1. Crear el tenant desde la UI

1. Login como superadmin
2. Ve a `/superadmin/tenants`
3. Click **"Nuevo tenant"**
4. Llena el formulario:
   - Slug (único, solo a-z, 0-9, guiones)
   - Nombre comercial
   - Razón social
   - RUC (11 dígitos)
   - Dirección
   - Plan (basic/pro/enterprise)
   - Fecha de fin de trial (default: 14 días desde hoy)
5. Click **"Crear"**

El sistema automáticamente:
- Inserta en `tenants`
- Crea el usuario admin inicial con password default `admin123`
- Inicializa categorías base (productos, gastos, etc)
- Habilita los módulos del plan contratado

### 2. Configurar el subdominio (Vercel)

El DNS del subdominio tiene que apuntar a Vercel.

1. Ve a https://vercel.com/<team>/<project>/settings/domains
2. Click **"Add Domain"**
3. Ingresa: `<slug>.mirestconia.com`
4. Vercel te muestra el DNS target (algo como `cname.vercel-dns.com`)
5. En tu proveedor de DNS (Cloudflare), crea el CNAME record
6. Espera propagación DNS (usualmente <5 min)
7. Verifica: `curl -sI https://<slug>.mirestconia.com | grep HTTP`

### 3. Comunicar las credenciales al cliente

**NUNCA por chat grupal o email sin cifrar.** Usa:

- WhatsApp directo al dueño
- Llamada telefónica
- Documento compartido con expiración

Mensaje estándar:
```
Bienvenido a MiRest con IA!

Tu subdominio: https://<slug>.mirestconia.com
Usuario: admin
Contraseña temporal: admin123

Por seguridad, cambia la contraseña en tu primer login (el sistema
te lo pedirá automáticamente).

Si tienes alguna duda, contáctame por este canal.
```

### 4. Onboarding inicial del cliente

El cliente al entrar verá el wizard de onboarding. Asegúrate que:

- [ ] Agregó sus productos (o los importó desde Excel)
- [ ] Configuró sus mesas (cantidad, capacidad)
- [ ] Creó usuarios para el resto del equipo (meseros, cajeros, cocinero)
- [ ] Subió el logo del restaurante
- [ ] Configuró los datos fiscales para SUNAT
- [ ] Probó abrir la caja y hacer un pedido de prueba

### 5. Monitoreo las primeras 48 horas

- Revisa `/superadmin/observabilidad` → filtra por el nuevo tenant
- Verifica que no hay errores 500 asociados
- Verifica que está usando los módulos (no es un cliente "fantasma")
- Si algo raro, contáctalo proactivamente

## Verification

- [ ] Tenant existe en `tenants` tabla
- [ ] Subdominio resuelve a la app y muestra login
- [ ] Cliente puede loguearse con credenciales iniciales
- [ ] Cliente forzó a cambiar password en primer login
- [ ] Trial expire date está bien setteado
- [ ] Módulos del plan están habilitados

## Rollback

Si el cliente canceló antes de usar el sistema:

```sql
-- Solo si estás 100% seguro que no tiene datos
UPDATE tenants SET activo = false, cancelado_at = NOW() WHERE id = <id>;
```

**NO borres el tenant** — conserva el registro para auditoría. Solo márcalo como inactivo.

Si necesitas re-activarlo después, setea `activo = true` y actualiza el `trial_ends_at`.

## Problemas comunes

- **"DNS no propaga"**: verifica el CNAME con `dig <slug>.mirestconia.com`. Si no aparece, espera 10 min más o revisa la config en Cloudflare.
- **"Cliente no puede loguearse"**: verifica que el subdominio resuelve y que el cliente usa el usuario `admin` (no su email personal).
- **"Usuario admin no existe"**: probablemente el script de creación falló. Revisa logs de Vercel del momento del onboarding.

## Contact

Cliente con problemas de onboarding → sé tú quien lo ayuda directamente. No lo mandes a soporte (todavía no tienes tier de soporte).
