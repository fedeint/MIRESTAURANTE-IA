# Guía para Contribuir — MiRest con IA

Bienvenido al repo. Esta guía explica cómo trabajar en el proyecto sin romper nada y sin que tu PR quede bloqueado en review.

> **TL;DR**: Crea una rama, toca SOLO tus archivos asignados, corre `npm test` antes de hacer commit, abre un PR con el template completo, espera review.

---

## 1. Requisitos

Antes de tu primer commit necesitas:

- **Node.js 24+** (el proyecto usa `node:test` built-in — no requiere Jest/Mocha)
- **Git** configurado con tu nombre y email reales
- **Editor** con soporte EJS + JavaScript (VS Code, WebStorm, etc.)
- **Cuenta de GitHub** con 2FA habilitado
- **Acceso al repo** concedido por el dueño (`@Leonidasx8`)

## 2. Setup local (una sola vez)

```bash
# 1. Clona el repo
git clone https://github.com/Leonidasx8/MiRestconIA.git
cd MiRestconIA

# 2. Instala dependencias
npm install

# 3. Instala el hook de pre-commit (corre tests automáticamente antes de cada commit)
npm run hooks:install

# 4. Pide a Leonidas que te pase el archivo .env.local con las credenciales de desarrollo.
#    NUNCA le pongas credenciales al repo. NUNCA las copies en chats.
#    Si necesitas una credencial nueva, pídesela por un canal privado.

# 5. Arranca el servidor
npm run dev
```

## 3. Reglas innegociables

### 🔒 Seguridad

1. **Cero secrets en el código.** Todo va en `.env` (gitignored). Si ves una API key hardcoded, repórtalo a Leonidas (no la modifiques tú mismo).
2. **Cero `eval()`, `Function()`, `exec()`** con input del usuario. Si necesitas ejecutar algo dinámico, pregunta primero.
3. **Cero queries SQL concatenadas.** Siempre usa placeholders: `db.query('SELECT * FROM x WHERE id=?', [id])` — **nunca** `db.query('SELECT * FROM x WHERE id=' + id)`.
4. **Cero `dangerouslySetInnerHTML`, `<%- %>`** con datos del usuario sin sanitizar.
5. **Valida TODO input** — usa `zod` (ya instalado): `const schema = z.object({...}); schema.parse(req.body)`.
6. **Rate limiting obligatorio** en endpoints nuevos. Mira cómo están configurados los existentes en `server.js`.

Más detalles en [SECURITY.md](./SECURITY.md).

### 📂 Alcance del cambio

- **Toca SOLO tus archivos asignados** (ver CODEOWNERS o pregunta a Leonidas).
- **No toques** `server.js`, `db.js`, `lib/**`, `middleware/**`, `migrations/**`, `views/partials/**`, `.env*`, `package.json` sin autorización.
- Si tu cambio necesita que Leonidas toque un archivo compartido, coordina con él primero.

### 🎨 Regla de variantes (zero responsive)

Cada página tiene DOS archivos EJS mutuamente excluyentes:

- `views/<page>.ejs` → variante PWA (teléfonos + tablets). Marker: `<%# @variant: pwa %>`
- `views/<page>-desktop.ejs` → variante desktop (Mac/Windows/Linux). Marker: `<%# @variant: desktop %>`

**NUNCA** intentes hacer una vista responsive que sirva a ambos. Si el PR de tu vista queda identica a su par, **el test fallará y el commit se bloqueará automáticamente**.

Ejemplo: si te toca mejorar `views/caja.ejs`, también debes actualizar (o crear) `views/caja-desktop.ejs`. Los dos son distintos. Usa Inter en desktop, DM Sans en PWA.

Si tienes dudas, lee [CLAUDE.md](./CLAUDE.md) sección "Variantes de vistas".

### 🧪 Tests

- Antes de cada commit, corre `npm test` — debe pasar al 100%.
- El hook de pre-commit lo corre automáticamente si tocaste `views/` o `lib/deviceRouter*`.
- Si agregas una vista nueva (tu par `.ejs` + `-desktop.ejs`), regístrala en `tests/view-variants.test.js` → `REGISTERED_PAIRS`.

## 4. Workflow de trabajo

### 4.1 Antes de empezar

1. Asegúrate de tener la última versión de `main`:
   ```bash
   git checkout main
   git pull origin main
   ```

2. Crea una rama con el formato correcto:
   ```bash
   git checkout -b <tipo>/<tu-nombre>-<descripcion-corta>
   ```

   **Tipos permitidos:**
   - `feat/` — feature nueva
   - `fix/` — bug fix
   - `refactor/` — refactorización sin cambio de comportamiento
   - `docs/` — solo documentación
   - `chore/` — limpieza, deps, config
   - `style/` — formato (espacios, comas) sin cambios lógicos

   **Ejemplo**: `feat/anthony-caja-filtros` o `fix/daniel-almacen-stock-negativo`

### 4.2 Durante el desarrollo

- Haz commits pequeños y frecuentes. **Un commit = un cambio atómico**.
- Mensaje de commit: en imperativo español o inglés. Ej: `feat(caja): agregar filtro por fecha` o `fix(almacen): corregir stock negativo`.
- Si tu cambio toca dos archivos no relacionados, son **dos commits separados**.
- Nunca hagas `git push --force` a `main`.
- Nunca hagas `git reset --hard` sin entender qué perderías.

### 4.3 Antes de abrir el PR

- [ ] `npm test` pasa al 100%
- [ ] No hay `console.log` de debug olvidados
- [ ] No hay TODO sin ticket asociado
- [ ] Probaste tu cambio en el navegador (desktop + mobile si aplica)
- [ ] Tu rama está actualizada contra `main`:
  ```bash
  git fetch origin main
  git rebase origin/main  # (o git merge origin/main si prefieres)
  ```

### 4.4 Abrir el PR

1. Push tu rama:
   ```bash
   git push -u origin <tu-rama>
   ```

2. Abre el PR en GitHub contra `main`.
3. **Llena el template completo** — es obligatorio. Los PRs sin checklist se cierran sin review.
4. Asigna a `@Leonidasx8` como reviewer.
5. No hagas self-merge. Espera a que Leonidas apruebe y mergee.

### 4.5 Responder a los comentarios del review

- Lee TODOS los comentarios antes de empezar a cambiar.
- Si no entiendes un comentario, pregunta en el PR (no asumas).
- Haz los cambios en nuevos commits (no `--amend` después de que el review empezó).
- Cuando termines, responde a cada hilo con "Fixed in abc1234" o similar.
- Re-solicita review si es necesario.

## 5. Lo que NO hacer (te bloquea el PR)

- ❌ Hacer push a `main` directamente
- ❌ Mergear tu propio PR
- ❌ Subir archivos con datos reales del negocio (recibos, clientes, fotos)
- ❌ Subir `.env`, `.env.local`, credenciales, tokens
- ❌ Tocar `migrations/` sin coordinar con Leonidas (pueden romper la DB)
- ❌ Instalar dependencias nuevas sin justificación en el PR
- ❌ Hacer "clean up" de código que no es el tuyo (eso va en su propio PR)
- ❌ Dejar que ambos `views/<x>.ejs` y `views/<x>-desktop.ejs` queden idénticos
- ❌ Ignorar el pre-commit hook (`--no-verify` está prohibido salvo que Leonidas lo autorice)

## 6. ¿Dudas?

- **Técnica o arquitectónica** → pregunta en el canal del equipo, menciona a Leonidas
- **Sobre qué archivos tocar** → mira `.github/CODEOWNERS`
- **Sobre el diseño** → pregunta por el frame correspondiente en `UI.DELSISTEMA.pen`
- **Seguridad** → NO lo pongas en chat grupal — privado a Leonidas

## 7. Glosario rápido

- **PWA**: Progressive Web App (la versión mobile del sistema)
- **Variant marker**: comentario `<%# @variant: pwa %>` o `<%# @variant: desktop %>` obligatorio en cada template
- **deviceRouter**: helper en `lib/deviceRouter.js` que elige qué template renderizar según el User-Agent del visitante
- **Pre-commit hook**: script que corre `npm test` antes de crear el commit; bloquea si falla
- **Tenant**: un restaurante cliente del SaaS. Cada tenant tiene su subdominio (ej: `mirestaurante.mirestconia.com`)

---

Bienvenido al equipo. 🚀
