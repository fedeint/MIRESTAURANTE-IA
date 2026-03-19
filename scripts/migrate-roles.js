/**
 * Migration: Add 'cajero' and 'almacenero' roles to rol_usuario_enum,
 * then update almacen1 user from 'administrador' to 'almacenero'.
 *
 * Run with:  node scripts/migrate-roles.js
 */

require('dotenv').config();
const db = require('../db');

async function migrate() {
    console.log('Starting role migration...');

    // 1. Add 'cajero' to enum (IF NOT EXISTS is supported in PG 9.6+)
    try {
        await db.query("ALTER TYPE rol_usuario_enum ADD VALUE IF NOT EXISTS 'cajero'");
        console.log('[OK] cajero added to rol_usuario_enum');
    } catch (e) {
        // Some PG versions don't support IF NOT EXISTS — try without it
        if (String(e.message).includes('already exists')) {
            console.log('[SKIP] cajero already in enum');
        } else {
            console.error('[WARN] cajero enum error:', e.message);
        }
    }

    // 2. Add 'almacenero' to enum
    try {
        await db.query("ALTER TYPE rol_usuario_enum ADD VALUE IF NOT EXISTS 'almacenero'");
        console.log('[OK] almacenero added to rol_usuario_enum');
    } catch (e) {
        if (String(e.message).includes('already exists')) {
            console.log('[SKIP] almacenero already in enum');
        } else {
            console.error('[WARN] almacenero enum error:', e.message);
        }
    }

    // 3. Verify current enum values
    try {
        const [rows] = await db.query(
            "SELECT unnest(enum_range(NULL::rol_usuario_enum))::text AS val"
        );
        console.log('[INFO] Current enum values:', rows.map(r => r.val).join(', '));
    } catch (e) {
        console.error('[WARN] Could not read enum values:', e.message);
    }

    // 4. Update almacen1 role from 'administrador' to 'almacenero'
    try {
        const [result] = await db.query(
            "UPDATE usuarios SET rol = 'almacenero' WHERE usuario = 'almacen1' AND rol = 'administrador'"
        );
        if (result.affectedRows > 0) {
            console.log('[OK] almacen1 role updated to almacenero');
        } else {
            // Maybe already updated or uses different username
            const [check] = await db.query(
                "SELECT usuario, rol FROM usuarios WHERE usuario = 'almacen1'"
            );
            if (check.length > 0) {
                console.log('[SKIP] almacen1 current role:', check[0].rol);
            } else {
                console.log('[INFO] almacen1 user not found — skipping');
            }
        }
    } catch (e) {
        console.error('[ERROR] Failed to update almacen1:', e.message);
    }

    // 5. Also fix cajero1 if it has a wrong role due to enum mismatch
    try {
        const [cajero] = await db.query(
            "SELECT usuario, rol FROM usuarios WHERE usuario = 'cajero1'"
        );
        if (cajero.length > 0 && cajero[0].rol !== 'cajero') {
            await db.query(
                "UPDATE usuarios SET rol = 'cajero' WHERE usuario = 'cajero1'"
            );
            console.log('[OK] cajero1 role corrected to cajero (was:', cajero[0].rol + ')');
        } else if (cajero.length > 0) {
            console.log('[SKIP] cajero1 already has role: cajero');
        } else {
            console.log('[INFO] cajero1 user not found — skipping');
        }
    } catch (e) {
        console.error('[WARN] cajero1 check error:', e.message);
    }

    // 6. Final verification: print all users and roles
    try {
        const [users] = await db.query(
            'SELECT usuario, rol FROM usuarios ORDER BY usuario'
        );
        console.log('\n[RESULT] All users:');
        users.forEach(u => console.log('  ', u.usuario.padEnd(20), u.rol));
    } catch (e) {
        console.error('[ERROR] Could not list users:', e.message);
    }

    console.log('\nMigration complete.');
    process.exit(0);
}

migrate().catch(e => {
    console.error('Fatal migration error:', e);
    process.exit(1);
});
