// routes/google-auth.js
'use strict';

const express = require('express');
const router = express.Router();
const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const db = require('../db');
const crypto = require('crypto');
const { registrarAudit } = require('../services/audit');

// Passport serialization
passport.serializeUser((user, done) => done(null, user));
passport.deserializeUser((user, done) => done(null, user));

// Configure Google Strategy (only if credentials are set)
if (process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET) {
  passport.use(new GoogleStrategy({
    clientID: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    callbackURL: process.env.GOOGLE_CALLBACK_URL || '/auth/google/callback',
    passReqToCallback: true
  }, async (req, accessToken, refreshToken, profile, done) => {
    try {
      const email = profile.emails && profile.emails[0];
      if (!email || !email.verified) {
        return done(null, false, { message: 'Se requiere un email verificado de Google' });
      }

      const googleEmail = email.value;
      const googleId = profile.id;

      // Check if email is blocked
      const [[blocked]] = await db.query(
        'SELECT id FROM google_emails_bloqueados WHERE email = ?', [googleEmail]
      );
      if (blocked) {
        return done(null, false, { message: 'Este email ha sido bloqueado. Contacta soporte.' });
      }

      // Check if user already exists with this google_id
      const [[existingUser]] = await db.query(
        'SELECT id, usuario, nombre, rol, tenant_id, auth_provider, google_email FROM usuarios WHERE google_id = ?',
        [googleId]
      );

      if (existingUser) {
        // Login existente
        return done(null, {
          id: existingUser.id,
          usuario: existingUser.usuario,
          nombre: existingUser.nombre,
          rol: existingUser.rol,
          tenant_id: existingUser.tenant_id,
          auth_provider: existingUser.auth_provider,
          google_email: existingUser.google_email
        });
      }

      // Nuevo usuario: crear tenant + usuario
      const nombre = profile.displayName || googleEmail.split('@')[0];
      const subdominio = googleEmail.split('@')[0]
        .replace(/[^a-z0-9]/gi, '')
        .substring(0, 20)
        .toLowerCase()
        + '-' + crypto.randomBytes(3).toString('hex');

      // Crear tenant
      const [[newTenant]] = await db.query(
        `INSERT INTO tenants (nombre, subdominio, plan, activo, estado_trial)
         VALUES (?, ?, 'free', true, 'pendiente') RETURNING id`,
        [nombre, subdominio]
      );
      const tenantId = newTenant.id;

      // Crear usuario administrador
      const [[newUser]] = await db.query(
        `INSERT INTO usuarios (usuario, nombre, password_hash, rol, activo, tenant_id, google_id, google_email, google_avatar, auth_provider)
         VALUES (?, ?, '', 'administrador', true, ?, ?, ?, ?, 'google') RETURNING id`,
        [googleEmail, nombre, tenantId, googleId, googleEmail, profile.photos?.[0]?.value || null]
      );

      await registrarAudit({
        usuarioId: newUser.id,
        tenantId: tenantId,
        accion: 'registro_google',
        modulo: 'auth',
        tabla: 'usuarios',
        registroId: newUser.id,
        datosNuevos: { google_email: googleEmail },
        ip: req.ip,
        userAgent: req.headers['user-agent']
      });

      return done(null, {
        id: newUser.id,
        usuario: googleEmail,
        nombre: nombre,
        rol: 'administrador',
        tenant_id: tenantId,
        auth_provider: 'google',
        google_email: googleEmail,
        is_new: true  // Flag para redirigir a onboarding
      });
    } catch (err) {
      return done(err);
    }
  }));
}

// GET /auth/google — Inicia OAuth flow
router.get('/google', (req, res, next) => {
  // Generate state nonce for CSRF protection
  const state = crypto.randomBytes(16).toString('hex');
  req.session.oauthState = state;
  req.session.save(() => {
    passport.authenticate('google', {
      scope: ['profile', 'email'],
      state: state,
      prompt: 'select_account'
    })(req, res, next);
  });
});

// GET /auth/google/callback — Google redirige aquí
router.get('/google/callback',
  (req, res, next) => {
    // Verify state nonce
    if (req.query.state !== req.session.oauthState) {
      return res.redirect('/login?error=csrf');
    }
    delete req.session.oauthState;
    next();
  },
  passport.authenticate('google', { failureRedirect: '/login?error=google' }),
  (req, res) => {
    // Set session user
    req.session.user = req.user;
    req.session.save(() => {
      if (req.user.is_new) {
        return res.redirect('/onboarding');
      }
      // Existing user — middleware requireTrialActivo handles redirection
      res.redirect('/');
    });
  }
);

module.exports = router;
