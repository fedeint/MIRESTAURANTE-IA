'use strict';

const express = require('express');
const router = express.Router();
const db = require('../db');
const {
  generateRegistrationOptions,
  verifyRegistrationResponse,
  generateAuthenticationOptions,
  verifyAuthenticationResponse,
} = require('@simplewebauthn/server');

const RP_NAME = 'MiRestcon IA';
const RP_ID = process.env.WEBAUTHN_RP_ID || 'mirestconia.com';
// Accept both apex and www, plus any comma-separated overrides from WEBAUTHN_ORIGIN.
// @simplewebauthn/server rejects the response if the browser origin doesn't exactly match.
const ORIGIN = (() => {
  const configured = (process.env.WEBAUTHN_ORIGIN || '').split(',').map(s => s.trim()).filter(Boolean);
  const defaults = [`https://${RP_ID}`, `https://www.${RP_ID}`];
  const set = new Set([...configured, ...defaults]);
  return Array.from(set);
})();

// ---------------------------------------------------------------------------
// GET /auth/webauthn/register/options
// ---------------------------------------------------------------------------
router.get('/register/options', async (req, res) => {
  try {
    const user = req.session?.user;
    if (!user) return res.status(401).json({ error: 'No autenticado' });

    const [existing] = await db.query(
      'SELECT credential_id FROM webauthn_credentials WHERE user_id = ?',
      [user.id]
    );

    const excludeCredentials = (existing || []).map(c => ({
      id: c.credential_id,
      type: 'public-key',
    }));

    const options = await generateRegistrationOptions({
      rpName: RP_NAME,
      rpID: RP_ID,
      userName: user.usuario,
      userDisplayName: user.nombre || user.usuario,
      attestationType: 'none',
      excludeCredentials,
      authenticatorSelection: {
        authenticatorAttachment: 'platform',
        userVerification: 'required',
        residentKey: 'preferred',
      },
    });

    await db.query(
      `INSERT INTO webauthn_challenges (user_id, challenge, expires_at)
       VALUES (?, ?, NOW() + INTERVAL '5 minutes')
       ON CONFLICT (user_id) DO UPDATE SET challenge = EXCLUDED.challenge, expires_at = EXCLUDED.expires_at`,
      [user.id, options.challenge]
    );

    res.json(options);
  } catch (err) {
    console.error('WebAuthn register options error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /auth/webauthn/register/verify
// ---------------------------------------------------------------------------
router.post('/register/verify', async (req, res) => {
  try {
    const user = req.session?.user;
    if (!user) return res.status(401).json({ error: 'No autenticado' });

    const [[challengeRow]] = await db.query(
      'SELECT challenge FROM webauthn_challenges WHERE user_id = ? AND expires_at > NOW()',
      [user.id]
    );
    if (!challengeRow) return res.status(400).json({ error: 'Challenge expirado' });

    const verification = await verifyRegistrationResponse({
      response: req.body,
      expectedChallenge: challengeRow.challenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
    });

    if (!verification.verified || !verification.registrationInfo) {
      return res.status(400).json({ error: 'Verificación fallida' });
    }

    const { credential } = verification.registrationInfo;

    await db.query(
      `INSERT INTO webauthn_credentials (user_id, tenant_id, credential_id, public_key, sign_count, device_name)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        user.id,
        user.tenant_id || req.tenantId || 1,
        credential.id,
        Buffer.from(credential.publicKey),
        credential.counter,
        req.body.deviceName || 'Dispositivo'
      ]
    );

    await db.query('DELETE FROM webauthn_challenges WHERE user_id = ?', [user.id]);

    res.json({ ok: true, message: 'Biometría registrada exitosamente' });
  } catch (err) {
    console.error('WebAuthn register verify error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// GET /auth/webauthn/login/options?usuario=X
// ---------------------------------------------------------------------------
router.get('/login/options', async (req, res) => {
  try {
    const { usuario } = req.query;
    if (!usuario) return res.status(400).json({ error: 'usuario requerido' });

    const tenantId = req.tenantId || 1;

    const [[user]] = await db.query(
      'SELECT id FROM usuarios WHERE usuario = ? AND tenant_id = ? AND activo = true LIMIT 1',
      [usuario, tenantId]
    );
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const [creds] = await db.query(
      'SELECT credential_id FROM webauthn_credentials WHERE user_id = ? AND tenant_id = ?',
      [user.id, tenantId]
    );

    if (!creds || creds.length === 0) {
      return res.status(404).json({ error: 'Sin biometría registrada' });
    }

    const allowCredentials = creds.map(c => ({
      id: c.credential_id,
      type: 'public-key',
    }));

    const options = await generateAuthenticationOptions({
      rpID: RP_ID,
      allowCredentials,
      userVerification: 'required',
    });

    await db.query(
      `INSERT INTO webauthn_challenges (user_id, challenge, expires_at)
       VALUES (?, ?, NOW() + INTERVAL '5 minutes')
       ON CONFLICT (user_id) DO UPDATE SET challenge = EXCLUDED.challenge, expires_at = EXCLUDED.expires_at`,
      [user.id, options.challenge]
    );

    options._userId = user.id;
    res.json(options);
  } catch (err) {
    console.error('WebAuthn login options error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

// ---------------------------------------------------------------------------
// POST /auth/webauthn/login/verify
// ---------------------------------------------------------------------------
router.post('/login/verify', async (req, res) => {
  try {
    const { usuario } = req.body;
    const tenantId = req.tenantId || 1;

    const [[user]] = await db.query(
      'SELECT id, usuario, nombre, rol, tenant_id, must_change_password FROM usuarios WHERE usuario = ? AND tenant_id = ? AND activo = true LIMIT 1',
      [usuario, tenantId]
    );
    if (!user) return res.status(404).json({ error: 'Usuario no encontrado' });

    const [[challengeRow]] = await db.query(
      'SELECT challenge FROM webauthn_challenges WHERE user_id = ? AND expires_at > NOW()',
      [user.id]
    );
    if (!challengeRow) return res.status(400).json({ error: 'Challenge expirado' });

    const credentialId = req.body.id;
    const [[cred]] = await db.query(
      'SELECT credential_id, public_key, sign_count FROM webauthn_credentials WHERE credential_id = ? AND user_id = ?',
      [credentialId, user.id]
    );
    if (!cred) return res.status(400).json({ error: 'Credential no encontrado' });

    const verification = await verifyAuthenticationResponse({
      response: req.body,
      expectedChallenge: challengeRow.challenge,
      expectedOrigin: ORIGIN,
      expectedRPID: RP_ID,
      credential: {
        id: cred.credential_id,
        publicKey: cred.public_key,
        counter: cred.sign_count,
      },
    });

    if (!verification.verified) {
      return res.status(400).json({ error: 'Verificación fallida' });
    }

    await db.query(
      'UPDATE webauthn_credentials SET sign_count = ?, last_used_at = NOW() WHERE credential_id = ?',
      [verification.authenticationInfo.newCounter, credentialId]
    );

    await db.query('DELETE FROM webauthn_challenges WHERE user_id = ?', [user.id]);

    const [permisos] = await db.query(
      'SELECT permiso FROM usuario_permisos WHERE usuario_id = ?', [user.id]
    ).catch(() => [[]]);

    req.session.user = {
      id: user.id,
      usuario: user.usuario,
      nombre: user.nombre || '',
      rol: user.rol,
      permisos: (permisos || []).map(p => p.permiso),
      must_change_password: !!user.must_change_password,
      tenant_id: user.tenant_id
    };
    req.session.lastActivity = Date.now();

    await db.query('UPDATE usuarios SET last_login = NOW() WHERE id = ?', [user.id]);

    res.json({ ok: true, redirect: user.must_change_password ? '/cambiar-contrasena' : '/' });
  } catch (err) {
    console.error('WebAuthn login verify error:', err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
