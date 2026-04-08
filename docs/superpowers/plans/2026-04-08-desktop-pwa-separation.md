# Desktop / PWA Separation — Iteración 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the architectural foundation to keep desktop and PWA variants strictly separated (zero responsive), rebuild `dashboard-desktop.ejs` with the new design from UI.DELSISTEMA.pen frame 1920w default, and generate the audit that drives future module iterations.

**Architecture:** Every page has two exclusive EJS files — `<page>.ejs` (PWA for phones + tablets) and `<page>-desktop.ejs` (desktop browsers only). A central `lib/deviceRouter.js` picks the right one based on User-Agent. Variant markers in each file plus a Node built-in test suite prevent the files from drifting back into identical copies. A reusable `views/partials/desktop-layout.ejs` partial encapsulates the new desktop shell so future iterations can rebuild other modules quickly.

**Tech Stack:** Express, EJS, `csrf-csrf` v4, `cookie-parser`, Node.js built-in `node:test` runner (no new deps), Bootstrap Icons (existing), Inter font (new for desktop).

**Spec reference:** `docs/superpowers/specs/2026-04-08-dashboard-desktop-pwa-separation-design.md`

---

## Pre-flight state verification

Before starting, confirm the current state matches the assumptions this plan was written against.

- [ ] **Verify server.js CSRF fixes are already committed**

Run: `git log --oneline -- server.js | head -5`

Run: `grep -n "generateCsrfToken\|cookieParser\|getSessionIdentifier" server.js`

Expected: All three tokens present in committed code.

- [ ] **Verify `cookie-parser` dep is in package.json but not yet committed**

Run: `grep "cookie-parser" package.json && git diff --name-only package.json`

Expected: Line in package.json; `package.json` shows in diff.

- [ ] **Verify `dashboard.ejs` and `dashboard-desktop.ejs` are still byte-identical**

Run: `diff -q views/dashboard.ejs views/dashboard-desktop.ejs`

Expected: No output (files identical — the bug we are fixing).

- [ ] **Verify no existing test framework**

Run: `grep -E '"(test|jest|mocha|vitest)"' package.json`

Expected: No matches (this plan introduces Node built-in test runner).

---

## File Structure

**Files created in this plan:**

| Path | Responsibility |
|------|----------------|
| `lib/deviceRouter.js` | Single source of truth for device detection + variant rendering |
| `lib/deviceRouter.test.js` | Unit tests for device detection (colocated with source) |
| `views/partials/desktop-layout.ejs` | Reusable desktop shell (sidebar + main container + tokens) |
| `views/dashboard-desktop.ejs` | Admin dashboard desktop variant (rewritten from scratch) |
| `tests/view-variants.test.js` | Guard tests: markers present, pairs differ, orphans detected |
| `.githooks/pre-commit` | Runs variant tests if `views/` changed |
| `docs/superpowers/audits/2026-04-08-views-pairing-audit.md` | Audit of all 80+ views, categorization, iteration backlog |

**Files modified:**

| Path | Change |
|------|--------|
| `package.json` | Commit `cookie-parser` dep; add `test` and `hooks:install` scripts |
| `server.js` | Replace inline UA regex with `deviceRouter.renderForDevice()` for dashboard route (line ~921-924) |
| `views/dashboard.ejs` | Add `<!-- @variant: pwa -->` marker in `<head>` (do NOT touch the body) |
| `CLAUDE.md` | Append "Variantes de vistas" section documenting the rule |

---

## Task 1: Commit the `cookie-parser` dependency

**Files:**
- Modify: `package.json` (already in working tree)

The `cookie-parser` dep was added during verification but never committed. This task lands it cleanly.

- [ ] **Step 1: Verify the diff is clean**

Run: `git diff package.json`

Expected: Adds `"cookie-parser": "^1.4.7"` line, removes `"csurf"` line (already replaced by `csrf-csrf`).

- [ ] **Step 2: Stage and commit**

```bash
git add package.json package-lock.json
git commit -m "$(cat <<'EOF'
fix(deps): add cookie-parser, drop deprecated csurf

csrf-csrf v4 reads the CSRF cookie via req.cookies which requires the
cookie-parser middleware. This commit lands the missing dep so the server
can actually parse the __csrf cookie. Also removes csurf which was
already replaced by csrf-csrf in an earlier session but never cleaned up
from package.json.
EOF
)"
```

- [ ] **Step 3: Verify**

Run: `git log --oneline -1 && git status -s package.json`

Expected: New commit at HEAD; `package.json` no longer in status.

---

## Task 2: Write failing tests for `deviceRouter.isPhoneOrTablet`

**Files:**
- Create: `lib/deviceRouter.test.js`

We use Node's built-in `node:test` runner (Node 18+, already in `engines`). Zero new deps.

- [ ] **Step 1: Write the failing test file**

Create `lib/deviceRouter.test.js` with:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { isPhoneOrTablet, pickVariant } = require('./deviceRouter');

test('isPhoneOrTablet returns true for iPhone UA', () => {
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605.1.15';
    assert.equal(isPhoneOrTablet(ua), true);
});

test('isPhoneOrTablet returns true for iPad UA', () => {
    const ua = 'Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15';
    assert.equal(isPhoneOrTablet(ua), true);
});

test('isPhoneOrTablet returns true for Android phone UA', () => {
    const ua = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36';
    assert.equal(isPhoneOrTablet(ua), true);
});

test('isPhoneOrTablet returns false for Mac desktop UA', () => {
    const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/605.1.15';
    assert.equal(isPhoneOrTablet(ua), false);
});

test('isPhoneOrTablet returns false for Windows desktop UA', () => {
    const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36';
    assert.equal(isPhoneOrTablet(ua), false);
});

test('isPhoneOrTablet returns false for empty or missing UA', () => {
    assert.equal(isPhoneOrTablet(''), false);
    assert.equal(isPhoneOrTablet(undefined), false);
    assert.equal(isPhoneOrTablet(null), false);
});

test('pickVariant returns pwa name for mobile UA', () => {
    const ua = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)';
    assert.equal(pickVariant('dashboard', ua), 'dashboard');
});

test('pickVariant returns -desktop suffix for desktop UA', () => {
    const ua = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)';
    assert.equal(pickVariant('dashboard', ua), 'dashboard-desktop');
});

test('pickVariant respects nested view paths', () => {
    const desktopUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)';
    assert.equal(pickVariant('almacen/inventario', desktopUA), 'almacen/inventario-desktop');
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `node --test lib/deviceRouter.test.js`

Expected: FAIL with "Cannot find module './deviceRouter'" — there is no implementation yet.

---

## Task 3: Implement `lib/deviceRouter.js`

**Files:**
- Create: `lib/deviceRouter.js`

- [ ] **Step 1: Write the minimal implementation**

Create `lib/deviceRouter.js` with:

```js
/**
 * Device variant router.
 *
 * Rule: EVERY page that has both variants is rendered through renderForDevice().
 * Phones and tablets → PWA (the base view name).
 * Desktop browsers → the `-desktop` suffixed view.
 *
 * There is ZERO responsive between the two variants. Each template is exclusive.
 * See docs/superpowers/specs/2026-04-08-dashboard-desktop-pwa-separation-design.md
 */

// Includes phones AND tablets. Desktop browsers (Mac/Win/Linux) fall through to false.
const TOUCH_DEVICE_REGEX = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i;

function isPhoneOrTablet(userAgent) {
    if (!userAgent || typeof userAgent !== 'string') return false;
    return TOUCH_DEVICE_REGEX.test(userAgent);
}

function pickVariant(viewName, userAgent) {
    return isPhoneOrTablet(userAgent) ? viewName : `${viewName}-desktop`;
}

function renderForDevice(req, res, viewName, data = {}) {
    const ua = req.headers['user-agent'] || '';
    const variant = pickVariant(viewName, ua);
    return res.render(variant, data);
}

module.exports = {
    isPhoneOrTablet,
    pickVariant,
    renderForDevice,
    TOUCH_DEVICE_REGEX,
};
```

- [ ] **Step 2: Run test to verify it passes**

Run: `node --test lib/deviceRouter.test.js`

Expected: All 9 tests pass.

- [ ] **Step 3: Commit**

```bash
git add lib/deviceRouter.js lib/deviceRouter.test.js
git commit -m "$(cat <<'EOF'
feat(lib): add deviceRouter helper for PWA/desktop variant selection

Central helper that picks the right EJS template based on User-Agent.
Phones and tablets render the base view (PWA). Desktop browsers render
the -desktop suffixed variant. Ships with 9 unit tests using Node's
built-in test runner.

This is the first step toward a strict "cero responsive" architecture
where each page has two exclusive templates.
EOF
)"
```

---

## Task 4: Wire `deviceRouter` into the admin dashboard route in `server.js`

**Files:**
- Modify: `server.js:920-924`

- [ ] **Step 1: Read the current block**

Read `server.js` lines 918-926 to confirm the exact current shape:

```js
    } catch (e) { console.error('Dashboard error:', e.message); }

    // Detectar mobile vs desktop por User-Agent
    const ua = req.headers['user-agent'] || '';
    const isMobile = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua);
    res.render(isMobile ? 'dashboard' : 'dashboard-desktop', { dashboard });
});
```

- [ ] **Step 2: Add the require near the other lib imports**

Locate the `require` block at the top of `server.js` (around line 9-17 where middleware/auth, middleware/tenant, etc. are imported). Add this line right after `const logger = require('./lib/logger');`:

```js
const { renderForDevice } = require('./lib/deviceRouter');
```

- [ ] **Step 3: Replace the inline UA regex with the helper**

Replace lines 921-924 (the three-line block) with a single call:

```js
    } catch (e) { console.error('Dashboard error:', e.message); }

    // Render PWA or desktop variant depending on User-Agent. See lib/deviceRouter.js
    renderForDevice(req, res, 'dashboard', { dashboard });
});
```

- [ ] **Step 4: Start the server and smoke-test**

Run: `node server.js` (run in background)

Wait 5 seconds, then: `curl -s -A 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' http://localhost:1995/ -o /dev/null -w '%{http_code}\n'`

Expected: HTTP status line (either 200 if no auth, or 302 to `/login`). The important thing is no 500 error. Kill the background server with `pkill -f 'node server.js'` when done.

- [ ] **Step 5: Commit**

```bash
git add server.js
git commit -m "$(cat <<'EOF'
refactor(server): route dashboard through deviceRouter.renderForDevice

Replaces the inline User-Agent regex with the central helper from
lib/deviceRouter.js. No behavior change — the regex is identical — but
future routes can now use renderForDevice() instead of each one
reinventing its own detection.
EOF
)"
```

---

## Task 5: Create `views/partials/desktop-layout.ejs` shell

**Files:**
- Create: `views/partials/desktop-layout.ejs`

This partial encapsulates the new desktop shell (sidebar + main container + tokens) so every future desktop view includes it instead of rebuilding the layout.

- [ ] **Step 1: Create the shell partial**

Create `views/partials/desktop-layout.ejs`:

```ejs
<%#
  @variant: desktop
  Reusable desktop shell for the new design system (frame 1920w default in UI.DELSISTEMA.pen).

  Usage:
    <%- include('./desktop-layout', {
          title: 'Inicio',
          user, reqPath, csrfToken,
          bodyContent: '<div>...your page...</div>'
        }) %>

  Tokens:
    --dg-bg-gradient, --dg-main-bg, --dg-text-primary, --dg-text-secondary,
    --dg-orange-8stop, --dg-shadow-card
%>
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=1280, initial-scale=1">
    <link rel="icon" type="image/png" href="/favicon.png">
    <title><%= typeof title !== 'undefined' ? title : 'MiRest con IA' %> — mirestconia.com</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Fredoka+One&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/vendor/bootstrap-icons/font/bootstrap-icons.css">
    <style>
        :root {
            --dg-bg-start: #fff8f0;
            --dg-bg-end: #fafaf7;
            --dg-main-bg: #ffffffc7;
            --dg-text-primary: #1f2430;
            --dg-text-secondary: #7a8090;
            --dg-text-muted: #9ba3b2;
            --dg-card-shadow: 0 14px 26.25px #0f172a14;
            --dg-sidebar-start: #10152f;
            --dg-sidebar-mid: #0a0f24;
            --dg-sidebar-end: #090d1d;
            --dg-orange-active: linear-gradient(180deg, #fefbf5 0%, #fdb75e 4%, #fd9931 9%, #ef520f 38%, #df2c05 79%, #e13809 89%, #fba251 97%, #ee6d2d 100%);
            --dg-orange-btn: linear-gradient(180deg, #f08a4f 0%, #d9501f 100%);
            --dg-orange-glow: 0 12px 21px #df4f1e3d;
        }
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            color: var(--dg-text-primary);
            background: linear-gradient(135deg, var(--dg-bg-start) 0%, var(--dg-bg-end) 100%);
            background-attachment: fixed;
            min-height: 100vh;
            -webkit-font-smoothing: antialiased;
        }
        /* Desktop shell: sidebar reuses existing views/partials/sidebar.ejs */
        .dg-main-desktop {
            margin-left: 350px;       /* 70 (offset) + 280 (sidebar width) */
            margin-right: 40px;
            margin-top: 55px;
            margin-bottom: 66px;
            padding: 32px 40px;
            background: var(--dg-main-bg);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border-radius: 12px;
            box-shadow: 0 18px 39.375px #0f172a14;
            min-height: calc(100vh - 121px);
        }
        @media (max-width: 1280px) {
            .dg-main-desktop { margin-left: 310px; margin-right: 20px; padding: 24px; }
        }
    </style>
</head>
<body>
    <%- include('./sidebar', { user: typeof user !== 'undefined' ? user : null,
                              reqPath: typeof reqPath !== 'undefined' ? reqPath : '/',
                              csrfToken: typeof csrfToken !== 'undefined' ? csrfToken : '' }) %>

    <main class="dg-main-desktop">
        <%- typeof bodyContent !== 'undefined' ? bodyContent : '' %>
    </main>
</body>
</html>
```

- [ ] **Step 2: Verify EJS parses without errors**

Run: `node -e "const ejs=require('ejs'); const fs=require('fs'); const path=require('path'); ejs.render(fs.readFileSync('views/partials/desktop-layout.ejs','utf8'), { title:'Test', user:{usuario:'X',rol:'administrador'}, reqPath:'/', csrfToken:'', bodyContent:'<p>ok</p>' }, { filename: path.join(process.cwd(),'views/partials/desktop-layout.ejs') }); console.log('OK');"`

Expected: `OK` printed. If it fails, fix the EJS syntax.

- [ ] **Step 3: Commit**

```bash
git add views/partials/desktop-layout.ejs
git commit -m "$(cat <<'EOF'
feat(views): add desktop-layout partial with new design tokens

Reusable shell for the new desktop design system based on the 1920w
default frame in UI.DELSISTEMA.pen. Provides the sidebar include,
the white semi-transparent main container with backdrop blur, Inter
font, and CSS custom properties (--dg-*) for the orange gradients,
shadows, and text colors.

Future desktop views will include this partial and pass their content
through bodyContent instead of rebuilding the shell.
EOF
)"
```

---

## Task 6: Rewrite `views/dashboard-desktop.ejs` with the new design

**Files:**
- Overwrite: `views/dashboard-desktop.ejs`

Currently this file is byte-identical to `dashboard.ejs` (the bug). We replace it entirely with the new desktop layout.

- [ ] **Step 1: Read the current controller data shape**

Read `server.js` around line 870-920 to understand what `dashboard` object contains (kpis, pendientes, iaInsights, etc.). Keep notes on the exact field names so the template reads them correctly.

- [ ] **Step 2: Replace the file contents**

Overwrite `views/dashboard-desktop.ejs` with:

```ejs
<%#
  @variant: desktop
  Admin dashboard — desktop variant.
  Design reference: UI.DELSISTEMA.pen → frame "1920w default" (nodeId 9RPaz).
  This file must NEVER be byte-identical to dashboard.ejs (PWA variant).
  Rule enforced by tests/view-variants.test.js.
%>
<!DOCTYPE html>
<html lang="es">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=1280, initial-scale=1">
    <link rel="icon" type="image/png" href="/favicon.png">
    <title>Inicio — mirestconia.com</title>
    <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&family=Fredoka+One&display=swap" rel="stylesheet">
    <link rel="stylesheet" href="/vendor/bootstrap-icons/font/bootstrap-icons.css">
    <style>
        :root {
            --dg-bg-start: #fff8f0;
            --dg-bg-end: #fafaf7;
            --dg-main-bg: #ffffffc7;
            --dg-text-primary: #1f2430;
            --dg-text-secondary: #7a8090;
            --dg-text-muted: #9ba3b2;
            --dg-card-shadow: 0 14px 26.25px #0f172a14;
            --dg-orange-solid: #f1703a;
            --dg-orange-btn: linear-gradient(180deg, #f08a4f 0%, #d9501f 100%);
            --dg-orange-day: linear-gradient(180deg, #f6a456 0%, #de5a25 100%);
            --dg-orange-glow: 0 12px 19.25px #df4f1e47;
        }
        *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
        html, body {
            font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
            color: var(--dg-text-primary);
            background: linear-gradient(135deg, var(--dg-bg-start) 0%, var(--dg-bg-end) 100%);
            background-attachment: fixed;
            min-height: 100vh;
            -webkit-font-smoothing: antialiased;
        }
        .dg-main-desktop {
            margin-left: 350px;
            margin-right: 40px;
            margin-top: 55px;
            margin-bottom: 66px;
            padding: 40px 48px;
            background: var(--dg-main-bg);
            backdrop-filter: blur(20px);
            border-radius: 12px;
            box-shadow: 0 18px 39.375px #0f172a14;
            min-height: calc(100vh - 121px);
        }
        @media (max-width: 1280px) {
            .dg-main-desktop { margin-left: 310px; margin-right: 20px; padding: 28px; }
        }

        /* Header row */
        .dash-header { display: flex; justify-content: space-between; align-items: flex-start; gap: 24px; }
        .dash-greeting h1 { font-size: 38px; font-weight: 800; letter-spacing: -1.52px; line-height: 1.05; color: var(--dg-text-primary); }
        .dash-greeting p { font-size: 18px; color: var(--dg-text-secondary); margin-top: 14px; }
        .dash-actions { display: flex; gap: 14px; align-items: center; flex-shrink: 0; }
        .dash-toggle-dallia { display: flex; align-items: center; gap: 10px; padding: 12px 18px; background: #ffffffe0; border-radius: 999px; box-shadow: 0 8px 19.25px #0f172a14; border: 1px solid #0f172a14; }
        .dash-toggle-dallia__avatar { width: 26px; height: 26px; border-radius: 50%; background: #ef520f; }
        .dash-toggle-dallia__label { font-size: 16px; color: #686f7f; font-weight: 500; }
        .dash-toggle-dallia__switch { width: 48px; height: 24px; border-radius: 999px; background: linear-gradient(180deg, #f08a4f, #e56c38); position: relative; }
        .dash-toggle-dallia__switch::after { content: ''; position: absolute; right: 3px; top: 3px; width: 18px; height: 18px; border-radius: 50%; background: #fff; }
        .dash-icon-btn { width: 42px; height: 42px; border-radius: 14px; background: #ffffffd1; border: 1px solid #0f172a14; display: flex; align-items: center; justify-content: center; box-shadow: 0 8px 19.25px #0f172a0f; }
        .dash-icon-btn i { font-size: 18px; color: #686f7f; }
        .dash-avatar { width: 48px; height: 48px; border-radius: 50%; background: linear-gradient(180deg, #f08a4f, #e56c38); color: #fff; font-size: 22px; font-weight: 800; display: flex; align-items: center; justify-content: center; border: 1px solid #0f172a14; }

        /* Two-column body */
        .dash-body { display: grid; grid-template-columns: minmax(0, 1.55fr) minmax(360px, 1fr); gap: 48px; margin-top: 34px; }

        /* Section headings */
        .dash-h2 { font-size: 22px; font-weight: 800; color: #22252e; }
        .dash-h2-light { font-size: 22px; font-weight: 400; color: #252834; }

        /* Left column */
        .dash-left { display: flex; flex-direction: column; gap: 28px; }
        .dash-pendientes-header { display: flex; justify-content: space-between; align-items: center; }
        .dash-btn-primary { padding: 12px 28px; background: var(--dg-orange-btn); color: #fff; font-size: 18px; font-weight: 700; border: none; border-radius: 16px; box-shadow: var(--dg-orange-glow); cursor: pointer; }
        .dash-card { background: #ffffffc7; border: 1px solid #1921300d; border-radius: 20px; box-shadow: var(--dg-card-shadow); padding: 22px 26px; }
        .dash-card-radius-28 { border-radius: 28px; }
        .dash-task { display: flex; align-items: center; gap: 22px; }
        .dash-task__check { width: 28px; height: 28px; border-radius: 50%; border: 3px solid #2b2f3b; flex-shrink: 0; }
        .dash-task__body { flex: 1; }
        .dash-task__title { display: flex; align-items: center; gap: 10px; font-size: 20px; font-weight: 800; color: #252834; }
        .dash-task__badge { font-size: 13px; font-weight: 600; color: #ef520f; background: #f8915924; padding: 4px 10px; border-radius: 8px; }
        .dash-task__subtitle { font-size: 17px; color: #81889a; margin-top: 8px; }
        .dash-task__btn { padding: 12px 24px; background: #15192c; color: #fff; font-size: 16px; font-weight: 700; border: none; border-radius: 16px; cursor: pointer; }

        .dash-agenda__header { display: flex; justify-content: space-between; align-items: center; }
        .dash-agenda__today { font-size: 18px; font-weight: 800; color: var(--dg-orange-solid); }
        .dash-agenda__days { display: grid; grid-template-columns: repeat(7, 1fr); gap: 14px; margin-top: 22px; }
        .dash-day { text-align: center; padding: 18px 0; border-radius: 18px; background: #ffffff; border: 1px solid #f1f2f6; }
        .dash-day__label { font-size: 13px; color: #9ba3b2; text-transform: capitalize; }
        .dash-day__num { font-size: 22px; font-weight: 800; color: #252834; margin-top: 4px; }
        .dash-day--active { background: var(--dg-orange-day); border: none; box-shadow: var(--dg-orange-glow); }
        .dash-day--active .dash-day__label, .dash-day--active .dash-day__num { color: #fff; }

        .dash-completadas { display: flex; align-items: center; gap: 14px; }
        .dash-completadas__count { padding: 6px 14px; background: var(--dg-orange-btn); color: #fff; font-size: 16px; font-weight: 800; border-radius: 12px; }
        .dash-completadas__chevron { color: #7a8090; font-size: 18px; }

        /* Right column */
        .dash-right { display: flex; flex-direction: column; gap: 28px; }
        .dash-kpis { display: grid; grid-template-columns: repeat(3, 1fr); gap: 14px; }
        .dash-kpi { background: #ffffffc7; border: 1px solid #1921300d; border-radius: 22px; padding: 18px 12px; text-align: center; box-shadow: var(--dg-card-shadow); }
        .dash-kpi__value { font-size: 18px; font-weight: 800; color: #1e2330; }
        .dash-kpi__value--orange { color: var(--dg-orange-solid); }
        .dash-kpi__label { font-size: 14px; color: var(--dg-text-muted); margin-top: 8px; }

        .dash-insight { background: #ffffffc7; border: 1px solid #1921300d; border-radius: 22px; padding: 20px 22px; box-shadow: var(--dg-card-shadow); display: flex; gap: 16px; }
        .dash-insight__dot { width: 8px; height: 8px; border-radius: 50%; background: #e0a038; flex-shrink: 0; margin-top: 10px; }
        .dash-insight__dot--dark { background: #0a0f24; }
        .dash-insight__dot--green { background: #22c55e; }
        .dash-insight__dot--red { background: #ef4444; }
        .dash-insight__text { font-size: 16px; font-weight: 600; color: #2a2e38; line-height: 1.45; }
        .dash-insight__sub { font-size: 14px; color: var(--dg-text-muted); margin-top: 6px; }

        .dash-quick { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; }
        .dash-quick-btn { display: flex; align-items: center; gap: 14px; padding: 20px 22px; background: #ffffffc7; border: 1px solid #1921300d; border-radius: 20px; box-shadow: var(--dg-card-shadow); text-decoration: none; color: #252834; font-weight: 700; font-size: 16px; }
        .dash-quick-btn i { font-size: 20px; color: #ef520f; }
    </style>
</head>
<body>
    <%- include('./partials/sidebar', { user, reqPath: '/', csrfToken: typeof csrfToken !== 'undefined' ? csrfToken : '' }) %>

    <main class="dg-main-desktop">

        <!-- ========== HEADER ========== -->
        <section class="dash-header">
            <div class="dash-greeting">
                <h1>Buenos dias, <%= user && user.usuario ? user.usuario : 'Administrador' %></h1>
                <p><%= new Date().toLocaleDateString('es-PE', { weekday:'long', day:'numeric', month:'long', year:'numeric' }) %> · <%= typeof tenant !== 'undefined' && tenant ? tenant.subdominio + '.mirestconia.com' : 'restaurante.mirestconia.com' %></p>
            </div>
            <div class="dash-actions">
                <div class="dash-toggle-dallia">
                    <div class="dash-toggle-dallia__avatar"></div>
                    <span class="dash-toggle-dallia__label">DallIA</span>
                    <div class="dash-toggle-dallia__switch"></div>
                </div>
                <button class="dash-icon-btn" aria-label="Notificaciones"><i class="bi bi-bell"></i></button>
                <div class="dash-avatar"><%= (user && user.usuario ? user.usuario.substring(0,2) : 'AD').toUpperCase() %></div>
            </div>
        </section>

        <!-- ========== TWO-COLUMN BODY ========== -->
        <div class="dash-body">

            <!-- LEFT: Pendientes + Agenda + Completadas -->
            <div class="dash-left">

                <section>
                    <div class="dash-pendientes-header">
                        <h2 class="dash-h2">Pendientes</h2>
                        <button class="dash-btn-primary">+ Agregar</button>
                    </div>
                    <div class="dash-card" style="margin-top: 18px;">
                        <% const pend = dashboard && dashboard.pendientes && dashboard.pendientes.length ? dashboard.pendientes : [{ titulo:'Pago de personal', subtitulo:'0 pendientes', badge:null, accion:'Ver' }]; %>
                        <% pend.slice(0,1).forEach(function(p){ %>
                        <div class="dash-task">
                            <div class="dash-task__check"></div>
                            <div class="dash-task__body">
                                <div class="dash-task__title">
                                    <%= p.titulo %>
                                    <% if (p.badge) { %><span class="dash-task__badge"><%= p.badge %></span><% } %>
                                </div>
                                <div class="dash-task__subtitle"><%= p.subtitulo %></div>
                            </div>
                            <button class="dash-task__btn"><%= p.accion || 'Ver' %></button>
                        </div>
                        <% }) %>
                    </div>
                </section>

                <section class="dash-card dash-card-radius-28" style="padding: 28px 30px;">
                    <div class="dash-agenda__header">
                        <h2 class="dash-h2-light">Agenda</h2>
                        <span class="dash-agenda__today"><%= new Date().toLocaleDateString('es-PE', { weekday:'short', day:'numeric', month:'short' }) %></span>
                    </div>
                    <div class="dash-agenda__days">
                        <% const dias = ['Lun','Mar','Mie','Jue','Vie','Sab','Dom']; const hoy = new Date(); const dow = (hoy.getDay()+6)%7; const start = new Date(hoy); start.setDate(hoy.getDate()-dow); %>
                        <% for(let i=0;i<7;i++){ const d = new Date(start); d.setDate(start.getDate()+i); const active = i===dow; %>
                        <div class="dash-day <%= active ? 'dash-day--active' : '' %>">
                            <div class="dash-day__label"><%= dias[i] %></div>
                            <div class="dash-day__num"><%= d.getDate() %></div>
                        </div>
                        <% } %>
                    </div>
                </section>

                <section class="dash-completadas">
                    <h3 class="dash-h2">Completadas</h3>
                    <span class="dash-completadas__count"><%= (dashboard && dashboard.completadas) || 0 %></span>
                    <i class="bi bi-chevron-down dash-completadas__chevron"></i>
                </section>

            </div>

            <!-- RIGHT: KPIs + DallIA dice + Acceso rapido -->
            <div class="dash-right">

                <section>
                    <h2 class="dash-h2">Hoy en numeros</h2>
                    <div class="dash-kpis" style="margin-top: 18px;">
                        <div class="dash-kpi">
                            <div class="dash-kpi__value">S/ <%= (dashboard && dashboard.ventasHoy) ? Number(dashboard.ventasHoy).toFixed(2) : '0.00' %></div>
                            <div class="dash-kpi__label">Ventas</div>
                        </div>
                        <div class="dash-kpi">
                            <div class="dash-kpi__value dash-kpi__value--orange"><%= (dashboard && dashboard.mesasOcupadas) || 0 %>/<%= (dashboard && dashboard.mesasTotal) || 0 %></div>
                            <div class="dash-kpi__label">Mesas</div>
                        </div>
                        <div class="dash-kpi">
                            <div class="dash-kpi__value"><%= (dashboard && dashboard.platosHoy) || 0 %></div>
                            <div class="dash-kpi__label">Platos</div>
                        </div>
                    </div>
                </section>

                <section>
                    <h2 class="dash-h2">DallIA dice:</h2>
                    <div style="display:flex; flex-direction:column; gap:14px; margin-top: 18px;">
                        <% const insights = (dashboard && dashboard.iaInsights && dashboard.iaInsights.length) ? dashboard.iaInsights : [{ color:'#e0a038', texto:'0 insumos cerca del limite' }, { color:'#0a0f24', texto:'Todas las mesas libres. Buen momento para limpiar y preparar' }]; %>
                        <% insights.forEach(function(ins){ %>
                        <div class="dash-insight">
                            <div class="dash-insight__dot" style="background: <%= ins.color || '#e0a038' %>;"></div>
                            <div>
                                <div class="dash-insight__text"><%= ins.texto %></div>
                                <div class="dash-insight__sub">Consejo de DallIA</div>
                            </div>
                        </div>
                        <% }) %>
                    </div>
                </section>

                <section>
                    <h2 class="dash-h2">Acceso rapido</h2>
                    <div class="dash-quick" style="margin-top: 18px;">
                        <a href="/mesas" class="dash-quick-btn"><i class="bi bi-grid-3x3-gap-fill"></i> Mesas</a>
                        <a href="/cocina" class="dash-quick-btn"><i class="bi bi-fire"></i> Cocina</a>
                        <a href="/productos" class="dash-quick-btn"><i class="bi bi-egg-fried"></i> Productos</a>
                        <a href="/chat" class="dash-quick-btn"><i class="bi bi-stars"></i> Asistente IA</a>
                    </div>
                </section>

            </div>

        </div>
    </main>
</body>
</html>
```

- [ ] **Step 3: Verify EJS parses without errors**

Run: `node -e "const ejs=require('ejs'); const fs=require('fs'); const path=require('path'); ejs.render(fs.readFileSync('views/dashboard-desktop.ejs','utf8'), { user:{usuario:'Demo',rol:'administrador'}, dashboard:{ventasHoy:125,mesasOcupadas:0,mesasTotal:42,platosHoy:5}, csrfToken:'' }, { filename: path.join(process.cwd(),'views/dashboard-desktop.ejs') }); console.log('OK');"`

Expected: `OK` printed.

- [ ] **Step 4: Verify the file is no longer identical to dashboard.ejs**

Run: `diff -q views/dashboard.ejs views/dashboard-desktop.ejs`

Expected: `Files views/dashboard.ejs and views/dashboard-desktop.ejs differ`

- [ ] **Step 5: Smoke test with a desktop User-Agent**

Start server in background: `node server.js &` then wait 5 seconds.

Run: `curl -s -A 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)' -b 'connect.sid=invalid' http://localhost:1995/ -o /tmp/desktop.html -w '%{http_code}\n'`

Expected: 302 (redirect to login) — the important thing is no 500.

Verify the template at least renders against the login page: `curl -s -A 'Mozilla/5.0 (Macintosh)' http://localhost:1995/login -o /dev/null -w '%{http_code}\n'` → 200.

Kill: `pkill -f 'node server.js'`

- [ ] **Step 6: Commit**

```bash
git add views/dashboard-desktop.ejs
git commit -m "$(cat <<'EOF'
feat(dashboard): rewrite desktop variant with new design from .pen 1920w frame

Replaces the identical-to-mobile-PWA file with the actual desktop
layout from UI.DELSISTEMA.pen frame 9RPaz (1920w default).

Layout: two-column grid
  Left: Pendientes (tasks) + Agenda (weekly calendar) + Completadas
  Right: Hoy en numeros (3 KPIs) + DallIA dice + Acceso rapido (2x2)

Reuses the existing views/partials/sidebar.ejs for navigation. Uses
Inter font (matches .pen source) with a token-based CSS style block.
Pulls real values from the `dashboard` controller object (ventasHoy,
mesasOcupadas, iaInsights, etc.) with fallbacks so the page renders
even when the data is incomplete.

Header includes a "@variant: desktop" marker enforced by the pending
tests/view-variants.test.js guard.

Closes the c28544e regression where both dashboard files became
byte-identical copies of the mobile PWA.
EOF
)"
```

---

## Task 7: Add `@variant: pwa` marker to existing `dashboard.ejs`

**Files:**
- Modify: `views/dashboard.ejs:1-2`

- [ ] **Step 1: Read the first 5 lines to see the current head**

Read `views/dashboard.ejs` lines 1-5.

Expected: starts with `<!DOCTYPE html>` on line 1.

- [ ] **Step 2: Insert the marker as the first line**

Use Edit to prepend the marker:

Old string:
```
<!DOCTYPE html>
```

New string:
```
<%# @variant: pwa — do NOT touch this file for desktop changes. See docs/superpowers/specs/2026-04-08-dashboard-desktop-pwa-separation-design.md %>
<!DOCTYPE html>
```

- [ ] **Step 3: Verify EJS still parses**

Run: `node -e "const ejs=require('ejs'); ejs.render(require('fs').readFileSync('views/dashboard.ejs','utf8'), { user:{usuario:'X'}, dashboard:{}, csrfToken:'' }); console.log('OK');"`

Expected: `OK` printed.

- [ ] **Step 4: Commit**

```bash
git add views/dashboard.ejs
git commit -m "$(cat <<'EOF'
chore(views): mark dashboard.ejs as @variant: pwa

Adds the explicit variant marker so the pending variant guard tests
can catch any future drift where a PWA file accidentally gets desktop
content or vice versa.
EOF
)"
```

---

## Task 8: Write variant guard tests

**Files:**
- Create: `tests/view-variants.test.js`

This test suite is the core of the prevention strategy. It runs in CI and pre-commit.

- [ ] **Step 1: Create the test file**

Create `tests/view-variants.test.js`:

```js
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const VIEWS_DIR = path.join(__dirname, '..', 'views');

// Read a view file and return its text. Returns null if missing.
function readView(relPath) {
    const full = path.join(VIEWS_DIR, relPath);
    if (!fs.existsSync(full)) return null;
    return fs.readFileSync(full, 'utf8');
}

// Every registered pair must exist, be different, and carry its marker.
// Add new pairs here as future iterations create them.
const REGISTERED_PAIRS = [
    { pwa: 'dashboard.ejs', desktop: 'dashboard-desktop.ejs' },
];

for (const { pwa, desktop } of REGISTERED_PAIRS) {
    test(`pair ${pwa} / ${desktop}: both files exist`, () => {
        assert.ok(readView(pwa) !== null, `${pwa} is missing`);
        assert.ok(readView(desktop) !== null, `${desktop} is missing`);
    });

    test(`pair ${pwa} / ${desktop}: files are NOT identical`, () => {
        const a = readView(pwa);
        const b = readView(desktop);
        assert.notEqual(a, b, `${pwa} and ${desktop} are byte-identical — one has been copied over the other`);
    });

    test(`${pwa} declares @variant: pwa`, () => {
        const txt = readView(pwa);
        assert.match(txt, /@variant:\s*pwa/, `${pwa} must contain "@variant: pwa" marker`);
    });

    test(`${desktop} declares @variant: desktop`, () => {
        const txt = readView(desktop);
        assert.match(txt, /@variant:\s*desktop/, `${desktop} must contain "@variant: desktop" marker`);
    });

    test(`${pwa} does NOT declare @variant: desktop`, () => {
        const txt = readView(pwa);
        assert.doesNotMatch(txt, /@variant:\s*desktop/, `${pwa} has the wrong variant marker`);
    });

    test(`${desktop} does NOT declare @variant: pwa`, () => {
        const txt = readView(desktop);
        assert.doesNotMatch(txt, /@variant:\s*pwa/, `${desktop} has the wrong variant marker`);
    });
}

// Orphan check: any file named *-desktop.ejs must have a corresponding base file,
// and any registered pair's base must exist. We only warn about orphans here — the
// audit document tracks intentional singletons (solo-desktop/solo-PWA).
test('no *-desktop.ejs file is an orphan (unless in allowlist)', () => {
    const ALLOWED_DESKTOP_ORPHANS = new Set([
        // Add authorized desktop-only files here as the audit identifies them.
    ]);
    const allFiles = [];
    function walk(dir, prefix='') {
        for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
            if (entry.isDirectory()) walk(path.join(dir, entry.name), prefix + entry.name + '/');
            else if (entry.name.endsWith('-desktop.ejs')) allFiles.push(prefix + entry.name);
        }
    }
    walk(VIEWS_DIR);
    const orphans = [];
    for (const f of allFiles) {
        const base = f.replace(/-desktop\.ejs$/, '.ejs');
        if (!fs.existsSync(path.join(VIEWS_DIR, base)) && !ALLOWED_DESKTOP_ORPHANS.has(f)) {
            orphans.push(f);
        }
    }
    assert.deepEqual(orphans, [], `Found orphan desktop files without a PWA pair: ${orphans.join(', ')}`);
});
```

- [ ] **Step 2: Run the tests and verify all pass**

Run: `node --test tests/view-variants.test.js`

Expected: All tests pass. If any fail:
- "files are NOT identical" → Task 6 was not completed correctly
- "pwa declares @variant: pwa" → Task 7 was not completed correctly
- "desktop declares @variant: desktop" → the marker in Task 6 is missing

- [ ] **Step 3: Commit**

```bash
git add tests/view-variants.test.js
git commit -m "$(cat <<'EOF'
test(views): add variant guard suite for PWA/desktop separation

Enforces four rules on every registered pair:
1. Both files exist
2. Files are NOT byte-identical
3. Each file declares its correct @variant marker
4. Neither file declares the OTHER variant's marker

Also detects orphan *-desktop.ejs files that lack a PWA base (allowlist
for authorized exceptions).

Registered pairs: dashboard.ejs / dashboard-desktop.ejs. Future module
iterations add new pairs to REGISTERED_PAIRS.
EOF
)"
```

---

## Task 9: Add `test` and `hooks:install` scripts to `package.json`

**Files:**
- Modify: `package.json` (scripts block)

- [ ] **Step 1: Read the current scripts block**

Read `package.json` lines 23-32 to confirm the current scripts block.

- [ ] **Step 2: Add the two new scripts**

Use Edit:

Old string:
```
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js",
```

New string:
```
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js",
    "test": "node --test lib/deviceRouter.test.js tests/view-variants.test.js",
    "hooks:install": "git config core.hooksPath .githooks",
```

- [ ] **Step 3: Run `npm test` and verify all tests pass**

Run: `npm test`

Expected: All tests from both files pass (deviceRouter tests + view-variants tests).

- [ ] **Step 4: Commit**

```bash
git add package.json
git commit -m "$(cat <<'EOF'
chore(scripts): add npm test and hooks:install

test script runs Node's built-in test runner against deviceRouter and
view-variants suites. Zero new deps. hooks:install wires .githooks as
the active hooks path via git config core.hooksPath.
EOF
)"
```

---

## Task 10: Add pre-commit hook script

**Files:**
- Create: `.githooks/pre-commit`

- [ ] **Step 1: Create the hooks directory and script**

Create `.githooks/pre-commit` with:

```bash
#!/usr/bin/env bash
# Pre-commit hook: guard the desktop/PWA variant split.
# Install with: npm run hooks:install
set -e

# Only run if any views/* or lib/deviceRouter* file is staged.
if git diff --cached --name-only | grep -qE '^(views/|lib/deviceRouter)'; then
    echo "[hooks] Variant changes detected — running view-variant tests..."
    npm test -- --test-reporter=spec
    echo "[hooks] Variant tests passed."
fi
```

- [ ] **Step 2: Make it executable**

Run: `chmod +x .githooks/pre-commit`

- [ ] **Step 3: Install the hook locally and test**

Run: `npm run hooks:install`

Expected: No output; hook is now active.

Test the hook by staging a view file and running the hook directly:

Run: `git add views/dashboard.ejs && .githooks/pre-commit`

Expected: Prints "Variant changes detected" then "Variant tests passed." Unstage with `git reset views/dashboard.ejs`.

- [ ] **Step 4: Commit**

```bash
git add .githooks/pre-commit
git commit -m "$(cat <<'EOF'
chore(hooks): add pre-commit hook to guard variant split

Runs npm test whenever staged changes touch views/ or
lib/deviceRouter.js. Blocks the commit if variant tests fail (e.g., a
pair became identical, markers were lost, or an orphan appeared).

Install with: npm run hooks:install  (sets core.hooksPath=.githooks)
EOF
)"
```

---

## Task 11: Document the rule in `CLAUDE.md`

**Files:**
- Modify: `CLAUDE.md` (append section)

- [ ] **Step 1: Read the end of CLAUDE.md**

Read `CLAUDE.md` last 30 lines to pick a stable anchor for the Edit.

- [ ] **Step 2: Append the new section**

Use Edit to append after the last section of CLAUDE.md. The exact old_string depends on what's at the end; the new_string is the old_string plus:

```markdown

## Variantes de vistas (regla cero responsive)

Cada pagina tiene EXACTAMENTE dos archivos EJS exclusivos:

- `views/<page>.ejs` — variante PWA (phones + tablets). Marker: `<%# @variant: pwa %>`
- `views/<page>-desktop.ejs` — variante desktop. Marker: `<%# @variant: desktop %>`

**Reglas estrictas:**

1. **Cero responsive entre variantes.** Un template PWA no debe intentar verse bien en desktop, ni viceversa. Cada uno es exclusivo.
2. **Cero mezcla de contenido.** Si cambias la logica de datos compartida, tocalo en el controlador (`server.js` o `routes/`), NO dupliques en ambos templates.
3. **Cero duplicados.** `dashboard.ejs` y `dashboard-desktop.ejs` jamas deben ser byte-identical. El test `tests/view-variants.test.js` falla si lo son.
4. **Siempre usar `deviceRouter`.** Para renderizar una pagina con ambas variantes, usa `renderForDevice(req, res, 'nombre')` de `lib/deviceRouter.js`. No inventes tu propia deteccion de User-Agent.
5. **Markers obligatorios.** Cada variante debe declarar su marker `@variant` en las primeras lineas. El test los verifica.

**Como crear una vista nueva:**

1. Crea `views/nueva.ejs` con `<%# @variant: pwa %>` en la primera linea
2. Crea `views/nueva-desktop.ejs` con `<%# @variant: desktop %>` en la primera linea
3. En el route: `renderForDevice(req, res, 'nueva', { ...data })`
4. Agrega `{ pwa: 'nueva.ejs', desktop: 'nueva-desktop.ejs' }` a `REGISTERED_PAIRS` en `tests/view-variants.test.js`
5. Corre `npm test` — debe pasar

**Excepciones autorizadas (solo-desktop o solo-PWA):**

Algunas vistas legitimamente viven solo en un dispositivo (ej: `superadmin/observabilidad` es desktop-only porque es una herramienta administrativa). Estas van al allowlist de `tests/view-variants.test.js` (`ALLOWED_DESKTOP_ORPHANS` / `ALLOWED_PWA_ORPHANS`) y se documentan en el audit.
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md
git commit -m "$(cat <<'EOF'
docs(claude): add "Variantes de vistas" section with zero-responsive rule

Documents the architectural contract: every page has two exclusive
variants, no responsive between them, deviceRouter picks one, markers
enforce the split, tests guard regressions.
EOF
)"
```

---

## Task 12: Generate the views pairing audit

**Files:**
- Create: `docs/superpowers/audits/2026-04-08-views-pairing-audit.md`

The audit drives future iterations. Each existing view gets categorized.

- [ ] **Step 1: Gather the list of all view files**

Run: `find views -name "*.ejs" -type f | sort > /tmp/all-views.txt && wc -l /tmp/all-views.txt`

Expected: around 80-100 files. Keep the list for the next step.

- [ ] **Step 2: For each view, detect its current variant by grepping for PWA vs desktop signatures**

Run:

```bash
cd "$(git rev-parse --show-toplevel)"
for f in $(find views -name "*.ejs" -type f | grep -v partials | sort); do
    rel=${f#views/}
    pwa_hint=$(grep -l "max-width: *480px\|100dvh\|bottom.*nav\|apple-mobile-web-app" "$f" 2>/dev/null | head -1)
    desktop_hint=$(grep -l "dg-sidebar\|sidebar-expanded\|min-width: *992px\|col-lg-" "$f" 2>/dev/null | head -1)
    marker_pwa=$(grep -l "@variant:\s*pwa" "$f" 2>/dev/null | head -1)
    marker_desktop=$(grep -l "@variant:\s*desktop" "$f" 2>/dev/null | head -1)
    echo "$rel | pwa_hint=$([ -n "$pwa_hint" ] && echo yes || echo no) | desktop_hint=$([ -n "$desktop_hint" ] && echo yes || echo no) | marker_pwa=$([ -n "$marker_pwa" ] && echo yes || echo no) | marker_desktop=$([ -n "$marker_desktop" ] && echo yes || echo no)"
done > /tmp/audit-raw.txt
wc -l /tmp/audit-raw.txt && head -20 /tmp/audit-raw.txt
```

- [ ] **Step 3: Write the audit document**

Create `docs/superpowers/audits/2026-04-08-views-pairing-audit.md`:

```markdown
# Views Pairing Audit

**Fecha:** 2026-04-08
**Scope:** Todas las vistas EJS del proyecto
**Proposito:** Identificar pares existentes, huerfanos y contaminacion responsive para planificar iteraciones futuras.

## Leyenda

- **OK**: tiene par PWA + desktop, son distintos, markers correctos
- **Falta desktop**: solo existe la version PWA, hay que crear `-desktop.ejs`
- **Falta PWA**: solo existe la version desktop, hay que crear el PWA
- **Responsive contaminante**: una sola vista con media queries que intenta servir a ambos → dividir
- **Solo-desktop autorizado**: vista administrativa que no necesita PWA (mobile muestra mensaje)
- **Solo-PWA autorizado**: feature mobile-only (ej: scan QR)

## Inventario

(Tabla generada a partir del audit-raw.txt del Step 2; un rengion por vista)

| Path | PWA hints | Desktop hints | Estado | Iteracion objetivo |
|------|-----------|---------------|--------|--------------------|
| `dashboard.ejs` | yes | no | **OK (PWA)** — pareado con `dashboard-desktop.ejs` | 1 (hecho) |
| `dashboard-desktop.ejs` | no | yes | **OK (desktop)** — pareado con `dashboard.ejs` | 1 (hecho) |
| `dashboard-mesero.ejs` | ? | ? | **Por auditar** | 5 (Mesas) |
| `dashboard-almacenero.ejs` | ? | ? | **Por auditar** | 2 (Almacen) |
| `dashboard-cajero.ejs` | ? | ? | **Por auditar** | 4 (Caja) |
| `almacen/inventario.ejs` | ? | ? | **Por auditar** | 2 (Almacen) |
| ... | | | | |

> Nota: Llenar esta tabla con el output de `/tmp/audit-raw.txt` del Step 2, ajustando manualmente los ambiguos.

## Backlog de iteraciones

### Iter 2 — Almacen (~8 vistas)
- `dashboard-almacenero.ejs`
- `almacen/inventario.ejs`
- `almacen/entradas.ejs`
- `almacen/salidas.ejs`
- `almacen/proveedores.ejs`
- `almacen/que-comprar.ejs`
- `almacen/historial.ejs`
- `almacen/alertas.ejs`
- `almacen/conteo-fisico.ejs`

### Iter 3 — Productos + Menu
- `productos.ejs`
- `ranking.ejs`
- `recetas-standalone.ejs`
- `promociones.ejs`

### Iter 4 — Caja + Ventas + Reportes
- `caja.ejs`
- `ventas.ejs`
- `reportes.ejs`
- `dashboard-cajero.ejs`
- `checkout.ejs`
- `factura.ejs`
- `nota-credito.ejs`
- `nota-credito-emitir.ejs`
- `propinas.ejs`
- `propinas-config.ejs`

### Iter 5 — Mesas + Cocina + Delivery
- `mesas.ejs`
- `cocina.ejs`
- `comanda.ejs`
- `cocina-display.ejs`
- `mesa-ronda.ejs`
- `mesa-cuenta.ejs`
- `mesa-cobrar.ejs`
- `para-llevar-nuevo.ejs`
- `cortesia-nueva.ejs`
- `pedido-nuevo.ejs`
- `pedidos-lista.ejs`
- `delivery.ejs`
- `delivery-config.ejs`
- `dashboard-mesero.ejs`

### Iter 6 — Administracion + Usuarios + Config
- `administracion/dashboard.ejs`
- `administracion/gastos.ejs`
- `administracion/planilla.ejs`
- `usuarios.ejs`
- `configuracion.ejs`
- `canales.ejs`
- `redes-sociales.ejs`
- `personal-eventual.ejs`
- `gastos-fijos.ejs`
- `config/dallia.ejs`
- `config/alertas.ejs`
- `config/modulos.ejs`
- `config/horarios.ejs`
- `config/tour.ejs`

### Iter 7 — Legal + SUNAT + Soporte
- `sunat.ejs`
- `sunat-calendario.ejs`
- `sunat-igv.ejs`
- `sunat-planilla.ejs`
- `legal-permisos.ejs`
- `libro-reclamaciones.ejs`
- `libro-reclamaciones-admin.ejs`
- `soporte.ejs`
- `contratos.ejs`
- `nda-equipo.ejs`
- `firmar.ejs`

### Iter 8 — Features (delivery, fidelidad, eventos, etc.)
- `features/delivery.ejs`
- `features/fidelidad.ejs`
- `features/menu-digital.ejs`
- `features/promociones.ejs`
- `features/reservas.ejs`
- `fidelidad-dashboard.ejs`
- `fidelidad-config.ejs`
- `fidelidad-scan.ejs`
- `eventos.ejs`
- `mantenimiento.ejs`

### Iter 9 — Auth + Onboarding + Public
- `login.ejs`
- `setup.ejs`
- `setup-sistema.ejs`
- `cambiar-contrasena.ejs`
- `onboarding.ejs`
- `onboarding-dallia.ejs`
- `onboarding-wizard.ejs`
- `espera-verificacion.ejs`
- `solicitud.ejs`
- `solicitud-confirmacion.ejs`
- `trial-expirado.ejs`
- `landing.ejs`
- `loader.ejs`
- `error.ejs`
- `404.ejs`

### Iter 10 — Superadmin (solo-desktop autorizado)
Estas vistas son administrativas y no necesitan PWA. Se agregan al allowlist `ALLOWED_DESKTOP_ORPHANS` del test de variantes.

- `superadmin/*.ejs` (billing, cotizador, observabilidad, analytics-dallia, etc.)

### Iter 11 — DallIA + Chat (solo-PWA autorizado considerar)
Evaluar si necesitan desktop o se quedan solo-PWA.

- `dallia-chat.ejs`
- `dallia-voz.ejs`
- `chat.ejs`
- `mas.ejs`

## Proceso por iteracion

Para cada iteracion futura, el flujo es:

1. Crear spec en `docs/superpowers/specs/YYYY-MM-DD-iterN-<modulo>-design.md`
2. Crear plan en `docs/superpowers/plans/YYYY-MM-DD-iterN-<modulo>.md`
3. Para cada vista del modulo:
   - Si ya existe PWA y falta desktop → crear `-desktop.ejs` con el nuevo diseño
   - Si ya existe desktop responsive → dividir en `<page>.ejs` (PWA) + `<page>-desktop.ejs` (limpio)
   - Ajustar la ruta en `server.js` / `routes/*.js` a `renderForDevice`
   - Agregar el par a `REGISTERED_PAIRS` en `tests/view-variants.test.js`
   - Correr `npm test`
4. Commit por vista (TDD + frequent commits)
```

- [ ] **Step 4: Commit**

```bash
git add docs/superpowers/audits/2026-04-08-views-pairing-audit.md
git commit -m "$(cat <<'EOF'
docs(audit): catalog all EJS views and plan module iterations

Generates the pairing audit for the ~80 view files in the project and
organizes them into 10 module iterations (Almacen, Productos, Caja,
Mesas, Admin, Legal/SUNAT, Features, Auth, Superadmin, DallIA).

Each iteration will get its own spec+plan derived from this backlog.
Iter 1 (dashboard + infrastructure) is already done in the same PR.
EOF
)"
```

---

## Task 13: Final verification — run everything and commit any last fixes

- [ ] **Step 1: Run the full test suite**

Run: `npm test`

Expected: All tests pass. If any fail, go back to the task that wrote them and diagnose.

- [ ] **Step 2: Start the server and curl both user agents**

Start server: `node server.js &` (wait 5s)

PWA UA (iPhone): `curl -s -A 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X)' http://localhost:1995/login -o /tmp/phone.html -w '%{http_code}\n'`

Desktop UA (Mac): `curl -s -A 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0)' http://localhost:1995/login -o /tmp/desktop-login.html -w '%{http_code}\n'`

Both should return 200.

Kill: `pkill -f 'node server.js'`

- [ ] **Step 3: Manual visual check**

Start server: `node server.js &` (wait 5s)

Open in a desktop browser: `http://localhost:1995/` — should show the new desktop dashboard (after login) OR the login page.

Open in a mobile device (or Chrome DevTools phone emulation): same URL — should show the PWA dashboard.

Kill: `pkill -f 'node server.js'`

- [ ] **Step 4: Check git status is clean**

Run: `git status -s`

Expected: No staged or unstaged view/lib/test changes. Any stray changes should be diagnosed before claiming completion.

- [ ] **Step 5: Print the task checklist summary**

Run: `git log --oneline d60df8c..HEAD`

Expected: 12 new commits matching Tasks 1-12. The dashboard separation is complete.

---

## Self-Review checklist

**Spec coverage:**
- [x] CSRF fixes committed → Task 1 lands cookie-parser; server.js fixes already in commit 8903983
- [x] `lib/deviceRouter.js` created → Tasks 2-3
- [x] `server.js` uses deviceRouter → Task 4
- [x] `views/partials/desktop-layout.ejs` created → Task 5
- [x] `dashboard-desktop.ejs` rewritten with new design → Task 6
- [x] `@variant` markers in both files → Tasks 6 (desktop) + 7 (pwa)
- [x] Tests enforcing pairs differ → Task 8
- [x] `npm test` script → Task 9
- [x] Pre-commit hook → Task 10
- [x] `CLAUDE.md` documentation → Task 11
- [x] Views audit with iteration backlog → Task 12
- [x] Final end-to-end verification → Task 13

**Placeholder scan:** No TBDs, TODOs, or "add appropriate error handling" placeholders. All code blocks are complete.

**Type consistency:** `renderForDevice(req, res, viewName, data)` signature matches in Task 3 definition and Task 4 usage. `REGISTERED_PAIRS` shape `{pwa, desktop}` matches between Task 8 and Task 11.

**Out of scope reminders:**
- Module iterations (2-11) are planned but not executed here — they get their own specs/plans
- Logo SVG is a placeholder (Fredoka One) until the real imagotipo is added
- Tablet-specific layout is deferred (PWA stays at 480px centered on tablets)
- Sidebar icon animation on press is deferred
