# Onboarding — Primer día en MiRest con IA

Bienvenido al equipo. Este documento te guía paso a paso desde cero hasta tu primer PR.

---

## Día 1: Setup

### ✅ Checklist

- [ ] 1. Leer [README.md](../../README.md) (general del proyecto)
- [ ] 2. Leer [CONTRIBUTING.md](../../CONTRIBUTING.md) (reglas para contribuir)
- [ ] 3. Leer [SECURITY.md](../../SECURITY.md) (reglas de seguridad)
- [ ] 4. Leer [CLAUDE.md](../../CLAUDE.md) — secciones "Variantes de vistas" y "Seguridad"
- [ ] 5. Instalar Node.js 24 LTS desde https://nodejs.org/
- [ ] 6. Instalar Git y configurarlo con tu nombre y email reales
- [ ] 7. Clonar el repo
- [ ] 8. Pedir a Leonidas el archivo `.env.local` con credenciales de desarrollo
- [ ] 9. Correr `npm install`
- [ ] 10. Correr `npm run hooks:install` (pre-commit hook)
- [ ] 11. Correr `npm run dev` — debe arrancar en http://localhost:1995
- [ ] 12. Hacer login con `admin / admin123` y explorar el dashboard
- [ ] 13. Hacerle a Leonidas 2-3 preguntas sobre lo que no entiendas

### Setup paso a paso

```bash
# 1. Clona el repo
git clone https://github.com/Leonidasx8/MiRestconIA.git
cd MiRestconIA

# 2. Instala dependencias
npm install

# 3. Pídele a Leonidas el .env.local y cópialo a la raíz del proyecto
#    (NUNCA lo pongas en chat — siempre privado)

# 4. Instala el pre-commit hook
npm run hooks:install

# 5. Verifica que los tests pasan
npm test

# 6. Arranca el servidor
npm run dev
```

Si `npm run dev` te da error de `password authentication failed` → el `.env.local` tiene una credencial vieja. Pídele a Leonidas la actualizada.

---

## Día 2: Conoce tu módulo

Ve a [.github/CODEOWNERS](../../.github/CODEOWNERS) y busca tu nombre. Ahí están listados los archivos que te tocan. Asignaciones actuales:

| Worker | Módulos | Archivos principales |
|--------|---------|---------------------|
| Anthony Pulgar | Caja, Cocina | `views/caja*`, `views/cocina*`, `routes/caja.js`, `routes/cocina.js` |
| Jonathan (Jhonatan) | Mesas | `views/mesas*`, `views/mesa-*`, `routes/mesas.js` |
| Ian Miguel | Delivery, Productos | `views/delivery*`, `views/productos*`, `views/ranking.ejs`, `routes/delivery.js`, `routes/productos.js` |
| Bruce (`@brucev030`) | Clientes, Recetas | `views/clientes*`, `views/recetas*`, `routes/clientes.js`, `routes/recetas.js` |
| Daniel | Reportes, Almacén | `views/reportes*`, `views/almacen/**`, `routes/reportes.js`, `routes/almacen.js` |

### Explora tu módulo en el navegador

Con el servidor corriendo (`npm run dev`), abre http://localhost:1995 y navega a tu módulo:

- Caja → http://localhost:1995/caja
- Cocina → http://localhost:1995/cocina
- Mesas → http://localhost:1995/mesas
- Delivery → http://localhost:1995/delivery
- Productos → http://localhost:1995/productos
- Clientes → http://localhost:1995/clientes
- Recetas → http://localhost:1995/recetas
- Reportes → http://localhost:1995/api/reportes
- Almacén → http://localhost:1995/almacen

Juega con la app. Intenta cosas. Rompe cosas (en tu entorno local — no en prod).

### Lee el código de tu módulo

- Abre los archivos `.ejs` de tu módulo. Fíjate en:
  - ¿Tiene marker `@variant: pwa` o `@variant: desktop` en la primera línea?
  - ¿Usa DM Sans (PWA) o Inter (desktop)?
  - ¿Cómo lee los datos? Busca variables EJS tipo `<%= producto.nombre %>`
- Abre el `.js` del route correspondiente en `routes/`. Fíjate en:
  - `requireAuth` y `requireRole` — control de acceso
  - Queries con `db.query('...', [params])` — placeholders
  - Cómo se pasa `tenantId` — siempre de `req.session`
- Si hay algo raro, anótalo. No lo "arregles" todavía.

---

## Día 3: Tu primer PR (el más chiquito posible)

Para tu **primer PR** buscamos algo pequeño, reversible, y que te familiarice con el flow. No un feature grande.

### Sugerencias de primer PR

Elige UNA de estas:

- **Fix un typo** que veas en tu módulo (mensaje de error, label, comentario)
- **Mejora un mensaje de error** para que sea más claro para el usuario
- **Agrega un `console.error` con más contexto** en un catch block existente
- **Simplifica un `if/else` redundante** que hayas encontrado
- **Corrige la indentación** de un bloque desordenado (solo si es feo)

### Pasos

```bash
# 1. Asegúrate de tener main al día
git checkout main
git pull origin main

# 2. Crea tu rama (usa tu nombre real, en kebab-case)
git checkout -b fix/anthony-caja-typo-total

# 3. Haz el cambio en tu editor

# 4. Verifica que los tests pasan
npm test

# 5. Verifica el cambio visualmente en el navegador
npm run dev
# abre la página afectada y confirma

# 6. Commit (el hook correrá npm test automáticamente)
git add views/caja.ejs
git commit -m "fix(caja): corregir typo en label Total"

# 7. Push
git push -u origin fix/anthony-caja-typo-total

# 8. Abre el PR en GitHub
#    - GitHub te mostrará un link después del push
#    - Usa el template completo
#    - Asigna a @Leonidasx8
```

### Qué esperar del review

Leonidas y el AI reviewer (Claude) van a revisar tu PR:
- **Primero el AI** deja comentarios automáticos (usualmente en <5 min)
- **Después Leonidas** hace el review humano
- Si piden cambios, haces los cambios en **nuevos commits** (no `--amend`)
- Cuando todo esté aprobado, Leonidas mergea

**No hagas self-merge** aunque tengas permisos — el flujo es siempre review → merge por Leonidas.

---

## Gotchas frecuentes

### 1. "Mi PR no pasa el test de variantes"

Significa que `views/<x>.ejs` y `views/<x>-desktop.ejs` quedaron byte-idénticos. Esto pasa cuando copias un archivo al otro sin modificar.

**Fix**: asegúrate de que la versión PWA usa DM Sans + max-width 480px, y la desktop usa Inter + sidebar + layout wide. Son diseños distintos, no el mismo responsive.

### 2. "Toqué un archivo del module de otro por accidente"

Devuélvelo al estado anterior:

```bash
git checkout main -- path/al/archivo.ejs
```

Y solo commitea lo tuyo.

### 3. "El hook de pre-commit me bloquea"

Eso es a propósito. El hook corre `npm test` y bloquea si falla. **No lo saltes con `--no-verify`**. Lee el error del test, arréglalo, y vuelve a intentar el commit.

Si el test que falla no es sobre tu cambio (por ejemplo, un test roto que viene de main), avísale a Leonidas antes de continuar.

### 4. "Me pidieron credenciales en el chat"

**Nunca** pegues credenciales en chat. Usa siempre canal privado directo. Si alguien te las pega, avísale a Leonidas inmediatamente para que las rote.

### 5. "Instalé una dep nueva y nadie más la tiene"

Cuando instalas con `npm install <paquete>`, se actualiza `package.json` y `package-lock.json`. Debes commitear ambos archivos y justificar la dependencia nueva en el PR. Si Leonidas dice que no la agregues, la quitas con `npm uninstall <paquete>`.

---

## Preguntas frecuentes

**¿Puedo usar Copilot / ChatGPT / Claude para escribir código?**
Sí, siempre que:
1. Entiendas lo que el AI escribió antes de commitearlo
2. Pases `npm test` y verifiques manualmente
3. No pegues secrets o data real en el prompt del AI
4. No copies código que no entiendas — estás aprendiendo

**¿Puedo hacer push directo a `main`?**
No. `main` está protegida. Todo va por PR.

**¿Puedo agregar librerías nuevas?**
Solo con justificación en el PR (por qué, alternativas, CVEs revisados). Leonidas aprueba.

**¿Puedo cambiar el diseño por mi cuenta?**
No. El diseño viene del archivo `UI.DELSISTEMA.pen`. Si crees que debería cambiar, abre un issue con tu propuesta.

**¿Cómo pruebo mi cambio en mobile?**
Chrome DevTools → botón "Toggle device toolbar" → elige "iPhone 14 Pro" o "iPad Pro". O usa tu teléfono real conectándote a `http://TU_IP_LOCAL:1995`.

**¿Qué pasa si rompo producción?**
Primero: no entres en pánico. Avísale a Leonidas inmediatamente. No intentes "arreglarlo" tú mismo — puede hacer peor el problema. Preserva evidencia (logs, screenshots).

---

## Siguientes pasos

Cuando ya estés cómodo con el flow de PR, pide a Leonidas que te asigne tickets del backlog para tu módulo. Los tickets vienen con:
- Descripción del bug/feature
- Archivos afectados
- Criterios de aceptación
- Link al frame correspondiente en `UI.DELSISTEMA.pen`

---

¿Preguntas? Pregúntale a Leonidas. No te quedes atorado — preguntar es gratis.

Última actualización: 2026-04-08
