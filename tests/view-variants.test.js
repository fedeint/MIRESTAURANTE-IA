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
    { pwa: 'pedidos.ejs', desktop: 'pedidos-desktop.ejs' },
    { pwa: 'superadmin/boveda.ejs', desktop: 'superadmin/boveda-desktop.ejs' },
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
