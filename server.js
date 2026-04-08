require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const cookieParser = require('cookie-parser');
const path = require('path');
const fs = require('fs');
const app = express();
const db = require('./db');
const session = require('express-session');
const { attachUserToLocals, requireAuth, requireRole } = require('./middleware/auth');
const { attachTenant } = require('./middleware/tenant');
const { tenantGuard } = require('./middleware/tenantGuard');
const { slugRewrite } = require('./middleware/slugRouter');
const { createTenantUrlHelper } = require('./lib/tenantUrl');
const { sessionTimeout } = require('./middleware/sessionTimeout');
const { requirePasswordChange } = require('./middleware/requirePasswordChange');
const { requireCajaAbierta } = require('./middleware/requireCaja');
const { attachGeoContext } = require('./middleware/geoContext');

const logger = require('./lib/logger');

// Crear directorios necesarios
const createRequiredDirectories = () => {
    const directories = [
        path.join(__dirname, 'public'),
        path.join(__dirname, 'public', 'uploads'),
        path.join(__dirname, 'public', 'css'),
        path.join(__dirname, 'public', 'js')
    ];

    directories.forEach(dir => {
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
            console.log(`Directorio creado: ${dir}`);
        }
    });
};

// Crear directorios al iniciar
createRequiredDirectories();

// Configuración
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('etag', 'strong');

// Security headers (helmet)
const helmet = require('helmet');
const IS_PROD = process.env.NODE_ENV === 'production';
app.use(helmet({
    contentSecurityPolicy: IS_PROD ? {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: [
                "'self'",
                "'unsafe-inline'",    // EJS inline scripts (migrate to nonces in V3)
                "https://cdn.jsdelivr.net",
                "https://unpkg.com",
                "https://maps.googleapis.com",
            ],
            styleSrc: [
                "'self'",
                "'unsafe-inline'",    // Inline styles in EJS templates
                "https://fonts.googleapis.com",
                "https://cdn.jsdelivr.net",
                "https://unpkg.com",
            ],
            fontSrc: [
                "'self'",
                "https://fonts.gstatic.com",
                "https://cdn.jsdelivr.net",
            ],
            imgSrc: [
                "'self'",
                "data:",
                "blob:",
                "https://*.supabase.co",
                "https://*.tile.openstreetmap.org",
                "https://unpkg.com",
            ],
            connectSrc: [
                "'self'",
                "https://*.supabase.co",
                "https://us.i.posthog.com",
                "https://maps.googleapis.com",
            ],
            frameSrc: ["'self'"],
            objectSrc: ["'none'"],
            baseUri: ["'self'"],
            formAction: ["'self'"],
        }
    } : false,  // Disabled in dev for Device Preview
    crossOriginEmbedderPolicy: IS_PROD,
    crossOriginOpenerPolicy: IS_PROD ? { policy: 'same-origin' } : false,
    crossOriginResourcePolicy: IS_PROD ? { policy: 'same-origin' } : false,
    frameguard: IS_PROD ? { action: 'sameorigin' } : false,
}));

// Additional security headers
app.use((req, res, next) => {
    res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Permissions-Policy', 'geolocation=(), camera=()');
    next();
});

// Gzip/deflate compression for all responses (must be early, before routes)
const compression = require('compression');
app.use(compression());

// Rate limiting - protect login and AI chat from abuse
const rateLimit = require('express-rate-limit');
const loginLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 10, message: { error: 'Demasiados intentos. Intenta en 15 minutos.' } });
const chatLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 60, message: { error: 'Límite de mensajes IA alcanzado. Intenta en 1 hora.' } });
const apiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 120,
    message: { error: 'Demasiadas solicitudes. Intenta en un minuto.' }
});
// Rate limit agresivo para tenants en trial (30 req/min vs 120 normal)
const trialApiLimiter = rateLimit({
    windowMs: 60 * 1000,
    max: 30,
    message: { error: 'Demasiadas solicitudes. Intenta en un minuto.' },
    keyGenerator: (req) => `trial-${req.tenantId || req.ip}`,
    validate: false,
    skip: (req) => {
        const user = req.session?.user;
        if (!user || user.auth_provider === 'local' || !user.auth_provider) return true;
        const tenant = req.tenant;
        if (!tenant || tenant.plan === 'pro' || tenant.plan === 'enterprise') return true;
        return tenant.estado_trial !== 'activo';
    }
});

// Body size limits: 1mb for JSON API, 10mb for URL-encoded forms (file uploads use multer with own limits)
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
app.use(cookieParser());

// Trust proxy (Vercel runs behind a reverse proxy)
app.set('trust proxy', 1);

// Sesiones persistidas en PostgreSQL (necesario para serverless/Vercel)
// En modo local no se usa SSL y se apunta a la base local.
const pgSession = require('connect-pg-simple')(session);
const { Pool: PgPool } = require('pg');
const IS_LOCAL_MODE = (process.env.MODO || 'cloud').toLowerCase() === 'local';
const sessionPoolConfig = IS_LOCAL_MODE
    ? {
        connectionString: process.env.DATABASE_URL || 'postgresql://localhost:5432/dignita_local',
        // No SSL for local
        max: 5,
    }
    : {
        connectionString: process.env.DATABASE_URL,
        ssl: { rejectUnauthorized: false },
    };
const sessionPool = new PgPool(sessionPoolConfig);

// Fail if SESSION_SECRET is not set in production
if (process.env.NODE_ENV === 'production' && !process.env.SESSION_SECRET) {
    console.error('FATAL: SESSION_SECRET environment variable is required in production.');
    process.exit(1);
}

app.use(session({
    store: new pgSession({ pool: sessionPool, tableName: 'session' }),
    name: 'sr.sid',
    secret: process.env.SESSION_SECRET || 'dev-only-insecure-default',
    resave: false,
    saveUninitialized: false,
    rolling: true,
    cookie: {
        httpOnly: true,
        sameSite: 'lax',
        // In local mode we run plain HTTP on the LAN — never set secure=true there
        secure: process.env.NODE_ENV === 'production' && !IS_LOCAL_MODE,
        maxAge: 1000 * 60 * 60 * 24 // 24h absolute max
    }
}));

// Request ID middleware for tracing
const { attachRequestId } = require('./middleware/requestId');
app.use(attachRequestId);

// Redirect subdomain to path (temporary backwards compat)
app.use((req, res, next) => {
    const parts = (req.hostname || '').split('.');
    const isSubdomain = parts.length >= 3
        && parts[1] === 'mirestconia'
        && parts[2] === 'com'
        && parts[0] !== 'www';
    if (isSubdomain) {
        const slug = parts[0];
        const newUrl = `https://mirestconia.com/${slug}${req.originalUrl}`;
        return res.redirect(301, newUrl);
    }
    next();
});

// Geo context middleware (reads Vercel headers + fallback to req.ip)
app.use(attachGeoContext);

// Tenant middleware (resuelve tenant_id por request)
app.use(attachTenant);
app.use(tenantGuard);
// tenantUrl helper for EJS views
app.use((req, res, next) => {
    res.locals.tenantUrl = createTenantUrlHelper(res.locals.basePath || null);
    next();
});
app.use(sessionTimeout);

// Hacer disponible el usuario en EJS como "user"
app.use(attachUserToLocals);

// Passport (Google OAuth)
const passport = require('passport');
app.use(passport.initialize());
app.use(passport.session());

// Observability middlewares (after tenant + user are resolved)
const ipGuard = require('./middleware/ipGuard');
const telemetry = require('./middleware/telemetry');
const moduloUsage = require('./middleware/moduloUsage');
const sessionGeo = require('./middleware/sessionGeo');

app.use(ipGuard);
app.use(telemetry);
app.use(moduloUsage);
app.use(sessionGeo);

// Trial guard (after tenant + user resolved)
const { requireTrialActivo, blockTrialExports } = require('./middleware/requireTrial');
app.use(requireTrialActivo);
app.use(requirePasswordChange);
app.use(blockTrialExports);

// Make reqPath available in all views
app.use((req, res, next) => {
    res.locals.reqPath = req.path;
    next();
});

// Service Worker must not be cached by browsers/CDN
// Must be declared BEFORE the generic static middleware so the headers take effect first
app.get('/sw.js', (req, res, next) => {
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Service-Worker-Allowed', '/');
    next();
});

// Configuración de archivos estáticos con cache headers
// Public assets: 7-day cache (CSS/JS/images - cambiar nombre de archivo para invalidar)
const staticOptions = { maxAge: '7d', etag: true, lastModified: true };
// Vendor assets: 30-day cache + immutable (versionados por npm, nunca cambian sin cambiar versión)
const vendorOptions = { maxAge: '30d', etag: true, lastModified: true, immutable: true };

app.use('/static', express.static(path.join(__dirname, 'public'), staticOptions));
app.use(express.static(path.join(__dirname, 'public'), staticOptions));

// Vendor assets (para funcionar OFFLINE incluso empaquetado con pkg)
// Nota: estos paths deben existir en node_modules y estar incluidos en package.json -> pkg.assets
app.use('/vendor/bootstrap', express.static(path.join(__dirname, 'node_modules', 'bootstrap', 'dist'), vendorOptions));
app.use('/vendor/jquery', express.static(path.join(__dirname, 'node_modules', 'jquery', 'dist'), vendorOptions));
app.use('/vendor/sweetalert2', express.static(path.join(__dirname, 'node_modules', 'sweetalert2', 'dist'), vendorOptions));
app.use('/vendor/select2', express.static(path.join(__dirname, 'node_modules', 'select2', 'dist'), vendorOptions));
app.use('/vendor/select2-bootstrap-5-theme', express.static(path.join(__dirname, 'node_modules', 'select2-bootstrap-5-theme', 'dist'), vendorOptions));
// bootstrap-icons usa fuentes (woff/woff2) -> servir carpeta font completa
app.use('/vendor/bootstrap-icons', express.static(path.join(__dirname, 'node_modules', 'bootstrap-icons', 'font'), vendorOptions));
app.use('/vendor/chartjs', express.static(path.join(__dirname, 'node_modules', 'chart.js', 'dist'), vendorOptions));

// HTTPS redirect en produccion (solo en la nube, nunca en modo local LAN)
if (process.env.NODE_ENV === 'production' && !IS_LOCAL_MODE) {
    app.use((req, res, next) => {
        if (req.headers['x-forwarded-proto'] !== 'https') {
            return res.redirect(301, `https://${req.headers.host}${req.url}`);
        }
        next();
    });
}

// CSRF protection para formularios (no para API JSON)
const { doubleCsrf } = require('csrf-csrf');
const { generateCsrfToken: generateToken, doubleCsrfProtection } = doubleCsrf({
    getSecret: () => process.env.SESSION_SECRET || 'dev-csrf-secret',
    getSessionIdentifier: (req) => req.session?.id || '',
    cookieName: '__csrf',
    cookieOptions: {
        httpOnly: true,
        sameSite: 'lax',
        secure: process.env.NODE_ENV === 'production',
        path: '/',
    },
    getTokenFromRequest: (req) => req.body._csrf || req.headers['x-csrf-token'],
});
// Middleware que genera el token y lo pone en res.locals para EJS
const csrfProtection = (req, res, next) => {
    doubleCsrfProtection(req, res, (err) => {
        if (err) {
            logger.security('CSRF_REJECTED', { ip: req.ip, path: req.path, method: req.method });
            return res.status(403).json({ error: 'Invalid CSRF token' });
        }
        res.locals.csrfToken = generateToken(req, res);
        next();
    });
};
// Genera token para GET requests (formularios)
const csrfTokenGen = (req, res, next) => {
    res.locals.csrfToken = generateToken(req, res);
    next();
};
// Las APIs JSON están protegidas por SOP + Content-Type check

// Device Preview sync bridge — cargado desde preview-v4/bridge/sync-bridge.js
// WebSocket relay en ws://localhost:3001/sync (reemplaza BroadcastChannel)
const _syncBridgePath = require('path').join(__dirname, 'preview-v4', 'bridge', 'sync-bridge.js');
const _syncBridgeCode = require('fs').existsSync(_syncBridgePath)
  ? require('fs').readFileSync(_syncBridgePath, 'utf-8')
  : '';
const SYNC_BRIDGE = `<script id="__dp_bridge__">${_syncBridgeCode}</script>`;

app.use((req, res, next) => {
    // Inject sync bridge into HTML pages
    const origRender = res.render.bind(res);
    res.render = function(view, opts, cb) {
        const done = typeof opts === 'function' ? opts : cb;
        origRender(view, opts, function(err, html) {
            if (!err && html) html = html.replace('</body>', SYNC_BRIDGE + '</body>');
            if (done) done(err, html);
            else if (err) next(err);
            else res.send(html);
        });
    };
    next();
});

// Headers de seguridad y CORS
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    // X-Frame-Options removed to allow Device Preview (VS Code iframe extension)
    res.setHeader('X-XSS-Protection', '1; mode=block');
    const corsOrigin = process.env.CORS_ORIGIN;
    if (corsOrigin) {
        res.setHeader('Access-Control-Allow-Origin', corsOrigin);
    }
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    // Responder preflight sin caer en 404
    if (req.method === 'OPTIONS') {
        return res.sendStatus(204);
    }
    next();
});

// Rutas
const productosRoutes = require('./routes/productos');
const clientesRoutes = require('./routes/clientes');
const facturasRoutes = require('./routes/facturas');
const mesasRoutes = require('./routes/mesas');
const cocinaRoutes = require('./routes/cocina');
const configuracionRoutes = require('./routes/configuracion');
const configPwaRoutes = require('./routes/config-pwa');
const ventasRoutes = require('./routes/ventas');
const authRoutes = require('./routes/auth');
const usuariosRoutes = require('./routes/usuarios');
const chatRoutes = require('./routes/chat');
const socialApiRoutes = require('./routes/social-api');
const almacenRoutes = require('./routes/almacen');
const recetasRoutes = require('./routes/recetas');
const recetasStandaloneRoutes = require('./routes/recetas-standalone');
const cajaRoutes = require('./routes/caja');
const sunatRoutes    = require('./routes/sunat');
const sunatPwaRoutes = require('./routes/sunat-pwa');
const administracionRoutes = require('./routes/administracion');
const canalesRoutes = require('./routes/canales');
const reportesRoutes = require('./routes/reportes');
const featuresRoutes = require('./routes/features');
const ttsRoutes = require('./routes/tts');
const onboardingRoutes = require('./routes/onboarding');
const superadminRoutes = require('./routes/superadmin');
const syncRoutes       = require('./routes/sync');
const backupsRoutes    = require('./routes/backups');
const soporteRoutes    = require('./routes/soporte');
const pagosRoutes      = require('./routes/pagos');
const legalRoutes      = require('./routes/legal');
const legalPwaRoutes   = require('./routes/legal-pwa');
const contratosRoutes  = require('./routes/contratos');
const ndaEquipoRoutes  = require('./routes/nda-equipo');
const firmarRoutes     = require('./routes/firmar');
const cronRoutes       = require('./routes/cron');
const observabilidadRoutes = require('./routes/observabilidad');
const sostacRoutes         = require('./routes/sostac');
const sprint4Routes        = require('./routes/sprint4');

// Cron endpoints (Vercel Cron Jobs — auth via CRON_SECRET header)
app.use('/api/cron', cronRoutes);

// Honeypot: detect automated scanners hitting common attack paths
['/wp-admin', '/wp-login.php', '/.env', '/config.php', '/phpmyadmin', '/admin.php'].forEach(p => {
    app.all(p, (req, res) => {
        const logger = require('./lib/logger');
        logger.security('honeypot_triggered', {
            path: req.path,
            ip: req.geo?.ip || req.ip,
            country: req.geo?.country,
            userAgent: String(req.headers['user-agent'] || '').substring(0, 200)
        });
        res.status(404).send('Not found');
    });
});

// Auth routes (públicas): /login /logout /setup
// CSRF: generate token on GET, validate on POST
app.get('/login', csrfTokenGen);
app.get('/setup', csrfTokenGen);
app.get('/cambiar-contrasena', csrfTokenGen);
app.post('/login', loginLimiter, csrfProtection); // rate limit + CSRF
app.post('/setup', csrfProtection);
app.post('/cambiar-contrasena', csrfProtection);
app.post('/logout', csrfProtection);
app.use(authRoutes);

// Generate CSRF token for all authenticated GET requests (sidebar/navbar logout forms)
app.use((req, res, next) => {
    if (req.method === 'GET' && req.session?.user) {
        res.locals.csrfToken = generateToken(req, res);
    }
    next();
});

// Google Auth routes (public, rate limited)
const googleAuthRoutes = require('./routes/google-auth');
const googleAuthLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 10, message: { error: 'Demasiados intentos de registro.' } });
app.use('/auth', googleAuthLimiter, googleAuthRoutes);

// WebAuthn biometric routes (public, rate limited)
const webAuthnRoutes = require('./routes/webauthn');
const webAuthnLimiter = rateLimit({ windowMs: 60 * 60 * 1000, max: 30, message: { error: 'Demasiados intentos biométricos.' } });
app.use('/auth/webauthn', webAuthnLimiter, webAuthnRoutes);

// Global API rate limiter (+ trial rate limit for free trial tenants)
app.use('/api/', apiLimiter);
app.use('/api/', trialApiLimiter);

// ── Legal routes (PUBLIC — no auth required) ──────────────────────────────
// Libro de Reclamaciones (Ley 32495, Peru - INDECOPI required)
app.use('/libro-reclamaciones', legalRoutes);
app.use('/api/legal', legalRoutes);

// ── Legal PWA — admin panel (requireAuth + admin only) ────────────────────
app.use('/legal-pwa', requireAuth, requireRole('administrador'), legalPwaRoutes);
// Politica de Privacidad (Ley 29733, Peru)
app.get('/privacidad', (req, res) => res.render('legal/privacidad'));
// Terminos de Servicio
app.get('/terminos', (req, res) => res.render('legal/terminos'));

// Pagos Izipay (public - no auth needed so landing page can initiate payments)
app.use('/api/pagos', pagosRoutes);

// Firma electronica de contratos (public - no auth, rate limited)
const firmaLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 15, message: { error: 'Demasiados intentos.' } });
app.use('/firmar', firmaLimiter, firmarRoutes);

// Onboarding wizard (admin only, before the main dashboard guard)
app.use('/onboarding', requireAuth, requireRole('administrador'), onboardingRoutes);

// Solicitud de registro (public — before trial guard)
const solicitudRoutes = require('./routes/solicitud');
app.use('/solicitud', requireAuth, solicitudRoutes);

// Onboarding DallIA (post-approval, requiere auth)
const onboardingDalliaRoutes = require('./routes/onboarding-dallia');
app.use('/onboarding-dallia', requireAuth, onboardingDalliaRoutes);

// Setup del sistema (post-onboarding, requiere auth + trial activo)
const setupSistemaRoutes = require('./routes/setup-sistema');
app.use('/setup-sistema', requireAuth, setupSistemaRoutes);

// Pantallas de estado del trial (requieren auth pero NO trial activo)
app.get('/espera-verificacion', requireAuth, async (req, res) => {
    const tenantId = req.tenantId || req.session?.user?.tenant_id;
    try {
        const [[solicitud]] = await db.query(
            `SELECT estado, motivo_rechazo, intento, created_at FROM solicitudes_registro
             WHERE tenant_id = ? ORDER BY created_at DESC LIMIT 1`, [tenantId]
        );
        // Si no hay solicitud, redirigir al formulario
        if (!solicitud) return res.redirect('/solicitud');
        // Si fue rechazada, permitir reenvío
        if (solicitud.estado === 'rechazado') {
            return res.render('espera-verificacion', {
                solicitud,
                email: req.session?.user?.google_email || req.session?.user?.usuario,
                rechazado: true
            });
        }
        res.render('espera-verificacion', {
            solicitud,
            email: req.session?.user?.google_email || req.session?.user?.usuario,
            rechazado: false
        });
    } catch (e) {
        res.redirect('/solicitud');
    }
});

app.get('/trial-expirado', requireAuth, async (req, res) => {
    let tenant = req.tenant;
    const user = req.session?.user;
    if (!tenant && user?.tenant_id) {
        try {
            const [[t]] = await db.query('SELECT id, nombre, subdominio FROM tenants WHERE id = ?', [user.tenant_id]);
            tenant = t || {};
        } catch (_) { tenant = {}; }
    }
    res.render('trial-expirado', {
        usuario: user || {},
        tenant: tenant || {}
    });
});

// Landing page (always public)
// File proxy — serves tenant files from VPS storage (requires auth)
const vpsStorage = require('./services/vps-storage');
app.get('/api/files/:tenantId/*', requireAuth, async (req, res) => {
  const tenantId = Number(req.params.tenantId);
  const userTenantId = req.session?.user?.tenant_id || req.tenantId;
  const userRole = req.session?.user?.rol;

  // Superadmin can access any tenant, others only their own
  if (userRole !== 'superadmin' && tenantId !== userTenantId) {
    return res.status(403).json({ error: 'Acceso denegado' });
  }

  const pathParts = req.params[0].split('/');
  if (pathParts.length < 2) return res.status(400).json({ error: 'Path inválido' });

  const category = pathParts[0];
  const filename = pathParts.slice(1).join('/');

  const fileRes = await vpsStorage.downloadFile(tenantId, category, filename);
  if (!fileRes) return res.status(404).json({ error: 'Archivo no encontrado' });

  const contentType = fileRes.headers.get('content-type');
  if (contentType) res.setHeader('Content-Type', contentType);
  const buffer = await fileRes.arrayBuffer();
  res.send(Buffer.from(buffer));
});

// Public pages (no auth required) — homepage, paquetes, demo, restaurantes, beneficios, marketplace
const publicRoutes = require('./routes/public');
app.use(publicRoutes);

// /landing removed — replaced by /home (public homepage)
app.get('/landing', (req, res) => res.redirect('/home'));

// Sync routes (status + manual trigger - admin only in local mode)
app.use('/api/sync', requireAuth, requireRole('administrador'), syncRoutes);

// Diagnóstico temporal (remover después)
app.get('/api/health', async (req, res) => {
    const info = { db: false, dbError: null, envHasUrl: !!process.env.DATABASE_URL, envUrlPrefix: (process.env.DATABASE_URL || '').substring(0, 30) + '...', usuarios: 0 };
    try {
        const [rows] = await db.query('SELECT COUNT(*) as cnt FROM usuarios');
        info.db = true;
        info.usuarios = Number(rows?.[0]?.cnt || 0);
    } catch(e) { info.dbError = e.message; }
    res.json(info);
});

// Ruta principal - Dashboard (requiere login)
app.get('/', requireAuth, async (req, res) => {
    const rol = String(req.session?.user?.rol || '').toLowerCase();
    if (rol === 'cocinero') return res.redirect('/cocina');

    // ---- MESERO dashboard ----
    if (rol === 'mesero') {
        const userId = req.session?.user?.id || 0;
        const meseroData = {
            userName: req.session?.user?.nombre || req.session?.user?.usuario || 'Mesero',
            mesasTotal: 0, mesasOcupadas: 0, pedidosHoy: 0,
            mesasAsignadas: [], mesasAsignadasCount: 0, itemsListos: 0
        };
        try {
            const [[mt]] = await db.query("SELECT COUNT(*) as t FROM mesas");
            meseroData.mesasTotal = Number(mt.t);
            const [[mo]] = await db.query("SELECT COUNT(*) as t FROM mesas WHERE estado='ocupada'");
            meseroData.mesasOcupadas = Number(mo.t);
            const [[ph]] = await db.query("SELECT COUNT(*) as t FROM pedidos WHERE estado NOT IN ('cerrado','cancelado') AND (created_at AT TIME ZONE 'America/Lima')::date = (NOW() AT TIME ZONE 'America/Lima')::date");
            meseroData.pedidosHoy = Number(ph.t);

            // Mesas asignadas a este mesero
            const [asignadas] = await db.query(
                "SELECT id, numero, descripcion, estado FROM mesas WHERE mesero_asignado_id = ? ORDER BY numero",
                [userId]
            );
            meseroData.mesasAsignadas = asignadas || [];
            meseroData.mesasAsignadasCount = meseroData.mesasAsignadas.length;

            // Items listos para entregar en sus mesas asignadas
            if (meseroData.mesasAsignadasCount > 0) {
                const mesaIds = meseroData.mesasAsignadas.map(m => m.id);
                const [[il]] = await db.query(
                    `SELECT COUNT(*) as t FROM pedido_items pi
                     JOIN pedidos p ON p.id = pi.pedido_id
                     WHERE p.mesa_id IN (?) AND pi.estado = 'listo'`,
                    [mesaIds]
                );
                meseroData.itemsListos = Number(il.t);

                // Marcar cuales mesas tienen items listos
                const [mesasConListos] = await db.query(
                    `SELECT DISTINCT p.mesa_id FROM pedido_items pi
                     JOIN pedidos p ON p.id = pi.pedido_id
                     WHERE p.mesa_id IN (?) AND pi.estado = 'listo'`,
                    [mesaIds]
                );
                const mesasListasSet = new Set((mesasConListos || []).map(r => r.mesa_id));
                meseroData.mesasAsignadas.forEach(m => {
                    m.tieneListos = mesasListasSet.has(m.id);
                });
            }
        } catch(e) { console.error('Mesero dashboard error:', e.message); }
        return res.render('dashboard-mesero', { meseroData });
    }

    // ---- ALMACENERO dashboard ----
    if (rol === 'almacenero') {
        const almacenData = {
            userName: req.session?.user?.nombre || req.session?.user?.usuario || 'Almacenero',
            ingredientesTotal: 0, alertasStock: 0, lotesPorVencer: 0
        };
        try {
            const tid = req.tenantId || 1;
            const [[it]] = await db.query("SELECT COUNT(*) as t FROM almacen_ingredientes WHERE tenant_id=? AND activo=true", [tid]);
            almacenData.ingredientesTotal = Number(it.t);
            const [[al]] = await db.query("SELECT COUNT(*) as t FROM almacen_ingredientes WHERE tenant_id=? AND activo=true AND stock_actual <= stock_minimo", [tid]);
            almacenData.alertasStock = Number(al.t);
            const [[lv]] = await db.query("SELECT COUNT(*) as t FROM almacen_lotes WHERE tenant_id=? AND estado='disponible' AND fecha_vencimiento <= CURRENT_DATE + INTERVAL '7 days'", [tid]);
            almacenData.lotesPorVencer = Number(lv.t);
        } catch(e) { console.error('Almacenero dashboard error:', e.message); }
        return res.render('dashboard-almacenero', { almacenData });
    }

    // ---- CAJERO dashboard ----
    if (rol === 'cajero') {
        const cajaDash = {
            userName: req.session?.user?.nombre || req.session?.user?.usuario || 'Cajero',
            cajaAbierta: false,
            cajaId: null,
            ventasHoy: '0.00',
            facturasHoy: 0,
            efectivoEnCaja: '0.00',
            metodosHoy: []
        };
        try {
            const tid = req.tenantId || 1;

            // Caja abierta
            const [[cajaRow]] = await db.query(
                "SELECT id, monto_apertura FROM cajas WHERE tenant_id=? AND estado='abierta' ORDER BY fecha_apertura DESC LIMIT 1",
                [tid]
            );
            cajaDash.cajaAbierta = !!cajaRow;
            cajaDash.cajaId = cajaRow ? cajaRow.id : null;

            // Ventas y facturas del dia
            const [[vhRow]] = await db.query(
                "SELECT COUNT(*) as c, COALESCE(SUM(total),0) as m FROM facturas WHERE (fecha AT TIME ZONE 'America/Lima')::date = (NOW() AT TIME ZONE 'America/Lima')::date"
            );
            cajaDash.ventasHoy = Number(vhRow.m).toFixed(2);
            cajaDash.facturasHoy = Number(vhRow.c);

            // Efectivo actual en caja (solo movimientos de efectivo)
            if (cajaRow) {
                try {
                    const [[efEfectivo]] = await db.query(
                        `SELECT COALESCE(SUM(CASE WHEN cm.tipo='ingreso' THEN cm.monto ELSE -cm.monto END),0) as ef
                         FROM caja_movimientos cm
                         LEFT JOIN metodos_pago mp ON mp.id = cm.metodo_pago_id
                         WHERE cm.caja_id=? AND cm.anulado=false AND (mp.nombre ILIKE '%efectivo%' OR mp.nombre ILIKE '%cash%' OR cm.metodo_pago_id IS NULL)`,
                        [cajaRow.id]
                    );
                    cajaDash.efectivoEnCaja = Number(efEfectivo.ef || 0).toFixed(2);
                } catch (_) {}
            }

            // Desglose por metodo de pago hoy
            try {
                const [metodos] = await db.query(
                    `SELECT mp.nombre as metodo, COALESCE(SUM(f.total),0) as total, COUNT(f.id) as qty
                     FROM facturas f
                     LEFT JOIN metodos_pago mp ON mp.id = f.metodo_pago_id
                     WHERE (f.fecha AT TIME ZONE 'America/Lima')::date = (NOW() AT TIME ZONE 'America/Lima')::date
                     GROUP BY mp.nombre
                     ORDER BY total DESC`
                );
                cajaDash.metodosHoy = metodos || [];
            } catch (_) {}

        } catch (e) { console.error('Cajero dashboard error:', e.message); }

        return res.render('dashboard-cajero', { cajaDash });
    }

    // ---- ONBOARDING CHECK (administrador only) ----
    // If the restaurant hasn't been named yet, guide the admin through the wizard.
    if (rol === 'administrador' && !req.session?.onboardingCompleted) {
        try {
            const tid = req.tenantId || 1;
            const [[cfgRow]] = await db.query(
                "SELECT nombre_negocio FROM configuracion_impresion WHERE tenant_id=? LIMIT 1",
                [tid]
            );
            if (!cfgRow || !String(cfgRow.nombre_negocio || '').trim()) {
                return res.redirect('/onboarding');
            }
        } catch (_) {
            // If the query fails for any reason, don't block the dashboard
        }
    }

    // Admin dashboard data
    const dashboard = { ventasHoy: 0, ventasMes: 0, mesasTotal: 0, mesasOcupadas: 0, productosVendidosHoy: 0, clientesTotal: 0, alertas: 0, topProductos: [], userName: req.session?.user?.nombre || req.session?.user?.usuario || 'Admin', facturasHoy: 0, cajaAbierta: false, personalSinPago: 0, personalTotal: 0, meserosActivos: 0, ratioMesasPorMesero: 0, ventasAyer: 0, pendientes: [], iaInsights: [] };
    try {
        const tid = req.tenantId || 1;
        // Lima-aware "today" expression — reused in every date comparison
        const HOY = `(NOW() AT TIME ZONE 'America/Lima')::date`;

        // ── Batch 1: all independent queries in parallel ──────────────────────
        const [
            [[vh]], [[vm]], [[mt]], [[mo]],
            [[ph]], [[cl]], [tp], [[al]],
            [[cajaRow]], [[pTotal]], [[pPagados]], [[meseros]], [[va]]
        ] = await Promise.all([
            db.query(`SELECT COUNT(*) as c, COALESCE(SUM(total),0) as m FROM facturas WHERE (fecha AT TIME ZONE 'America/Lima')::date = ${HOY}`),
            db.query(`SELECT COALESCE(SUM(total),0) as m FROM facturas WHERE fecha >= NOW() - INTERVAL '30 days'`),
            db.query(`SELECT COUNT(*) as t FROM mesas`),
            db.query(`SELECT COUNT(*) as t FROM mesas WHERE estado='ocupada'`),
            db.query(`SELECT COALESCE(SUM(df.cantidad),0) as t FROM detalle_factura df JOIN facturas f ON f.id=df.factura_id WHERE (f.fecha AT TIME ZONE 'America/Lima')::date = ${HOY}`),
            db.query(`SELECT COUNT(*) as t FROM clientes`),
            db.query(`SELECT p.nombre, SUM(df.cantidad) as qty FROM detalle_factura df JOIN productos p ON p.id=df.producto_id JOIN facturas f ON f.id=df.factura_id WHERE (f.fecha AT TIME ZONE 'America/Lima')::date = ${HOY} GROUP BY df.producto_id, p.nombre ORDER BY qty DESC LIMIT 5`),
            db.query(`SELECT COUNT(*) as t FROM almacen_ingredientes WHERE tenant_id=? AND activo=true AND stock_actual <= stock_minimo`, [tid]),
            db.query(`SELECT id FROM cajas WHERE tenant_id=? AND estado='abierta' LIMIT 1`, [tid]).catch(() => [[null]]),
            db.query(`SELECT COUNT(*) as t FROM personal WHERE tenant_id=? AND activo=true`, [tid]).catch(() => [[{ t: 0 }]]),
            db.query(`SELECT COUNT(DISTINCT personal_id) as t FROM planilla_pagos WHERE tenant_id=? AND (fecha AT TIME ZONE 'America/Lima')::date = ${HOY}`, [tid]).catch(() => [[{ t: 0 }]]),
            db.query(`SELECT COUNT(*) as t FROM usuarios WHERE rol='mesero' AND activo=true`).catch(() => [[{ t: 0 }]]),
            db.query(`SELECT COALESCE(SUM(total),0) as m FROM facturas WHERE (fecha AT TIME ZONE 'America/Lima')::date = ${HOY} - INTERVAL '1 day'`).catch(() => [[{ m: 0 }]]),
        ]);

        dashboard.ventasHoy          = Number(vh.m).toFixed(2);
        dashboard.facturasHoy        = vh.c;
        dashboard.ventasMes          = Number(vm.m).toFixed(2);
        dashboard.mesasTotal         = mt.t;
        dashboard.mesasOcupadas      = mo.t;
        dashboard.productosVendidosHoy = Number(ph.t);
        dashboard.clientesTotal      = cl.t;
        dashboard.topProductos       = tp || [];
        dashboard.alertas            = al.t;
        dashboard.cajaAbierta        = !!cajaRow;
        dashboard.personalTotal      = pTotal.t;
        dashboard.personalSinPago    = Math.max(0, Number(pTotal.t) - Number(pPagados.t));
        dashboard.meserosActivos     = meseros.t;
        dashboard.ratioMesasPorMesero = meseros.t > 0 ? Math.round(dashboard.mesasTotal / meseros.t) : 0;
        dashboard.ventasAyer         = Number(va.m).toFixed(2);

        // === PENDIENTES DINAMICOS CON PRIORIDAD ===
        // Prioridad: 1=critico (bloquea operacion), 2=urgente (afecta servicio), 3=importante (afecta finanzas), 4=info
        const pendientes = [];

        // P1 CRITICO: Caja cerrada bloquea TODO el flujo de mesas/cocina/facturación
        if (!dashboard.cajaAbierta) {
            pendientes.push({ prioridad: 1, color: '#EF4444', titulo: 'Abrir caja del dia', desc: 'Sin caja abierta los meseros no pueden tomar pedidos', btn: 'Abrir', href: '/caja', urgente: true });
        }

        // P1 CRITICO: Ingredientes en 0 = platos que no se pueden preparar
        let platosAgotados = 0;
        try {
            const [[pa]] = await db.query("SELECT COUNT(*) as t FROM almacen_ingredientes WHERE tenant_id=? AND activo=true AND stock_actual <= 0", [tid]);
            platosAgotados = pa.t;
        } catch(_) {}
        if (platosAgotados > 0) {
            pendientes.push({ prioridad: 1, color: '#EF4444', titulo: 'Insumos agotados', desc: platosAgotados + ' ingredientes con stock en 0. No se pueden preparar platos', btn: 'Ver', href: '/almacen/inventario', urgente: true });
        }

        // P2 URGENTE: Stock bajo (no agotado pero cerca)
        if (dashboard.alertas > 0) {
            const esUrgente = dashboard.alertas > 10;
            pendientes.push({ prioridad: 2, color: '#F59E0B', titulo: 'Comprar insumos', desc: dashboard.alertas + ' insumos bajo minimo' + (esUrgente ? ' — comprar antes del servicio' : ''), btn: 'Ver', href: '/almacen/que-comprar', urgente: esUrgente });
        }

        // P2 URGENTE: Ratio mesas/mesero muy alto = mal servicio
        if (dashboard.meserosActivos > 0 && dashboard.ratioMesasPorMesero > 15) {
            pendientes.push({ prioridad: 2, color: '#EF4444', titulo: 'Falta personal de salon', desc: dashboard.meserosActivos + ' meseros para ' + dashboard.mesasTotal + ' mesas (' + dashboard.ratioMesasPorMesero + ' mesas c/u)', btn: 'Ver', href: '/usuarios', urgente: true });
        } else if (dashboard.meserosActivos === 0 && dashboard.mesasTotal > 0) {
            pendientes.push({ prioridad: 2, color: '#EF4444', titulo: 'Sin meseros registrados', desc: 'Crea al menos un usuario mesero para operar las mesas', btn: 'Crear', href: '/usuarios', urgente: true });
        }

        // P3 IMPORTANTE: Planilla pendiente
        if (dashboard.personalSinPago > 0 && dashboard.personalTotal > 0) {
            pendientes.push({ prioridad: 3, color: '#3B82F6', titulo: 'Pago de personal', desc: dashboard.personalSinPago + ' de ' + dashboard.personalTotal + ' empleados sin pago hoy', btn: 'Pagar', href: '/administracion/planilla', urgente: false });
        }

        // P3 IMPORTANTE: Gastos fijos del mes sin registrar
        try {
            const [[gf]] = await db.query(`SELECT COUNT(*) as t FROM gastos g JOIN gastos_categorias gc ON gc.id=g.categoria_id WHERE g.tenant_id=? AND gc.tipo='fijo' AND EXTRACT(MONTH FROM g.fecha)=EXTRACT(MONTH FROM ${HOY}) AND EXTRACT(YEAR FROM g.fecha)=EXTRACT(YEAR FROM ${HOY})`, [tid]);
            if (gf.t === 0) {
                pendientes.push({ prioridad: 3, color: '#8B5CF6', titulo: 'Registrar gastos fijos del mes', desc: 'Alquiler, luz, agua, internet — registralos para ver el P&L real', btn: 'Ir', href: '/administracion/gastos', urgente: false });
            }
        } catch(_) {}

        // P4 INFO: Sin ventas aun hoy
        if (Number(dashboard.facturasHoy) === 0 && dashboard.cajaAbierta) {
            pendientes.push({ prioridad: 4, color: '#6366F1', titulo: 'Sin ventas hoy', desc: 'La caja esta abierta pero no hay facturas registradas', btn: 'Mesas', href: '/mesas', urgente: false });
        }

        // P4 INFO: Revisar reporte del dia anterior
        if (Number(dashboard.ventasAyer) > 0) {
            try {
                const [[reporteVisto]] = await db.query(`SELECT id FROM admin_tareas WHERE tenant_id=? AND titulo='Revisar cierre de ayer' AND (created_at AT TIME ZONE 'America/Lima')::date = ${HOY} AND completada=true LIMIT 1`, [tid]);
                if (!reporteVisto) {
                    pendientes.push({ prioridad: 4, color: '#14B8A6', titulo: 'Revisar cierre de ayer', desc: 'Ayer se facturo S/' + dashboard.ventasAyer + ' — revisa el resumen', btn: 'Ver', href: '/ventas', urgente: false });
                }
            } catch(_) {}
        }

        // Ordenar por prioridad (1=critico primero)
        pendientes.sort((a, b) => a.prioridad - b.prioridad);

        // Sincronizar tareas auto con BD (upsert por titulo+fecha)
        const uid = req.session?.user?.id || 0;
        for (const p of pendientes) {
            try {
                const [[existe]] = await db.query(
                    `SELECT id FROM admin_tareas WHERE tenant_id=? AND titulo=? AND (created_at AT TIME ZONE 'America/Lima')::date = ${HOY} AND tipo='auto' LIMIT 1`,
                    [tid, p.titulo]
                );
                if (!existe) {
                    await db.query(
                        "INSERT INTO admin_tareas (tenant_id, usuario_id, tipo, titulo, descripcion, color, href, btn_texto, urgente) VALUES (?,?,'auto',?,?,?,?,?,?) RETURNING id",
                        [tid, uid, p.titulo, p.desc, p.color, p.href || null, p.btn || null, p.urgente ? 1 : 0]
                    );
                }
            } catch(_) {}
        }

        // Cargar pendientes activos (auto de hoy no completados + manuales no completados)
        try {
            const [tareasActivas] = await db.query(
                `SELECT * FROM admin_tareas WHERE tenant_id=? AND completada=false AND (tipo='manual' OR (created_at AT TIME ZONE 'America/Lima')::date = ${HOY}) ORDER BY urgente DESC, created_at ASC`,
                [tid]
            );
            dashboard.pendientes = tareasActivas.map(t => ({
                id: t.id, color: t.color || '#F59E0B', titulo: t.titulo, desc: t.descripcion || '',
                btn: t.btn_texto || 'Ver', href: t.href || '#', urgente: Number(t.urgente) === 1,
                tipo: t.tipo
            }));
        } catch(_) {
            dashboard.pendientes = pendientes; // fallback
        }

        // Historial de tareas completadas (ultimas 20)
        try {
            const [historial] = await db.query(
                "SELECT t.*, u.nombre as usuario_nombre FROM admin_tareas t LEFT JOIN usuarios u ON u.id=t.usuario_id WHERE t.tenant_id=? AND t.completada=true ORDER BY t.completada_at DESC LIMIT 20",
                [tid]
            );
            dashboard.historialTareas = historial;
        } catch(_) {
            dashboard.historialTareas = [];
        }

        // === IA INSIGHTS DINAMICOS ===
        const iaInsights = [];

        // Estado de inventario
        if (dashboard.alertas === 0) {
            iaInsights.push({ color: '#22C55E', texto: 'Inventario listo para el servicio' });
        } else if (dashboard.alertas <= 5) {
            iaInsights.push({ color: '#F59E0B', texto: dashboard.alertas + ' insumos cerca del limite' });
        } else {
            iaInsights.push({ color: '#EF4444', texto: dashboard.alertas + ' insumos agotandose. Revisar compras urgente' });
        }

        // Mesas
        const pctOcupacion = dashboard.mesasTotal > 0 ? Math.round((dashboard.mesasOcupadas / dashboard.mesasTotal) * 100) : 0;
        if (pctOcupacion === 0) {
            iaInsights.push({ color: '#3B82F6', texto: 'Todas las mesas libres. Buen momento para limpiar y preparar' });
        } else if (pctOcupacion >= 80) {
            iaInsights.push({ color: '#EF4444', texto: 'Ocupacion al ' + pctOcupacion + '%. Considerar lista de espera' });
        } else {
            iaInsights.push({ color: '#FF6B35', texto: dashboard.mesasOcupadas + ' de ' + dashboard.mesasTotal + ' mesas ocupadas (' + pctOcupacion + '%)' });
        }

        // Comparar ventas con ayer
        const ventasHoyNum = Number(dashboard.ventasHoy);
        const ventasAyerNum = Number(dashboard.ventasAyer);
        if (ventasHoyNum > 0 && ventasAyerNum > 0) {
            const diff = Math.round(((ventasHoyNum / ventasAyerNum) - 1) * 100);
            if (diff > 0) {
                iaInsights.push({ color: '#22C55E', texto: 'Ventas ' + diff + '% arriba vs ayer (S/' + dashboard.ventasAyer + ')' });
            } else if (diff < -20) {
                iaInsights.push({ color: '#EF4444', texto: 'Ventas ' + Math.abs(diff) + '% abajo vs ayer. Ayer fue S/' + dashboard.ventasAyer });
            } else {
                iaInsights.push({ color: '#F59E0B', texto: 'Ventas similares a ayer (S/' + dashboard.ventasAyer + ')' });
            }
        } else if (ventasHoyNum === 0 && ventasAyerNum > 0) {
            iaInsights.push({ color: '#F59E0B', texto: 'Ayer se vendio S/' + dashboard.ventasAyer + '. Hoy aun sin ventas' });
        }

        // Caja
        if (!dashboard.cajaAbierta) {
            iaInsights.push({ color: '#EF4444', texto: 'Caja cerrada. Abrela para empezar a operar' });
        }

        dashboard.iaInsights = iaInsights;
    } catch (e) { console.error('Dashboard error:', e.message); }

    // Detectar mobile vs desktop por User-Agent
    const ua = req.headers['user-agent'] || '';
    const isMobile = /Android|iPhone|iPad|iPod|webOS|BlackBerry|IEMobile|Opera Mini/i.test(ua);
    res.render(isMobile ? 'dashboard' : 'dashboard-desktop', { dashboard });
});

// API: Completar/descompletar tarea del dashboard
app.put('/api/tareas/:id/completar', requireAuth, async (req, res) => {
    try {
        const tid = req.tenantId || 1;
        const tareaId = Number(req.params.id);
        const [[tarea]] = await db.query("SELECT id, completada FROM admin_tareas WHERE id=? AND tenant_id=?", [tareaId, tid]);
        if (!tarea) return res.status(404).json({ error: 'Tarea no encontrada' });
        const nuevoEstado = Number(tarea.completada) === 1 ? 0 : 1;
        await db.query("UPDATE admin_tareas SET completada=?, completada_at=? WHERE id=?", [nuevoEstado, nuevoEstado ? new Date() : null, tareaId]);
        res.json({ completada: nuevoEstado === 1 });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// API: Crear tarea manual
app.post('/api/tareas', requireAuth, async (req, res) => {
    try {
        const tid = req.tenantId || 1;
        const uid = req.session?.user?.id || 0;
        const titulo = String(req.body.titulo || '').trim();
        if (!titulo) return res.status(400).json({ error: 'Titulo requerido' });
        const [result] = await db.query(
            "INSERT INTO admin_tareas (tenant_id, usuario_id, tipo, titulo, descripcion, color, urgente) VALUES (?,?,'manual',?,?,?,?) RETURNING id",
            [tid, uid, titulo, req.body.descripcion || null, req.body.color || '#3B82F6', req.body.urgente ? 1 : 0]
        );
        res.status(201).json({ id: result.insertId });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// API: Eliminar tarea manual
app.delete('/api/tareas/:id', requireAuth, async (req, res) => {
    try {
        const tid = req.tenantId || 1;
        await db.query("DELETE FROM admin_tareas WHERE id=? AND tenant_id=? AND tipo='manual'", [req.params.id, tid]);
        res.json({ ok: true });
    } catch(e) {
        res.status(500).json({ error: e.message });
    }
});

// Facturacion rapida (la vista original index.ejs)
app.get('/facturacion', requireRole(['mesero', 'administrador', 'cajero']), (req, res) => {
    res.render('index');
});

// Usar las rutas
// Panel de usuarios (solo admin)
app.use('/usuarios', requireRole('administrador'), usuariosRoutes);
app.use('/api/usuarios', requireRole('administrador'), usuariosRoutes);

// Productos
app.use('/productos', requireRole(['administrador', 'almacenero']), productosRoutes); // panel admin + almacenero
app.use('/api/productos', requireRole(['mesero', 'administrador', 'almacenero']), productosRoutes); // búsqueda/armado pedido

// Clientes
app.use('/clientes', requireRole('administrador'), clientesRoutes);
app.use('/api/clientes', requireRole(['mesero', 'administrador']), clientesRoutes);

// Facturas (impresión/creación). Mesero y cajero necesitan imprimir/gestionar.
app.use('/facturas', requireRole(['administrador', 'cajero', 'mesero']), facturasRoutes);
app.use('/api/facturas', requireRole(['mesero', 'administrador', 'cajero']), facturasRoutes);

// Mesas (mesero/admin)
app.use('/mesas', requireRole(['mesero', 'administrador']), requireCajaAbierta, mesasRoutes);
app.use('/api/mesas', requireRole(['mesero', 'administrador']), mesasRoutes);

// Cocina
// - Cocinero/Admin: puede preparar/marcar listo
// - Mesero: solo visualiza y marca "Entregado" en la pestaña de listos (la acción se hace vía /api/mesas/items/:id/estado con validación)
// Relacionado con: routes/cocina.js (middlewares por ruta) y routes/mesas.js (restricción servido)
app.use('/cocina', requireRole(['cocinero', 'mesero', 'administrador']), requireCajaAbierta, cocinaRoutes);
app.use('/api/cocina', requireRole(['cocinero', 'mesero', 'administrador']), requireCajaAbierta, cocinaRoutes);

// Mobile PWA routes — PASO 4
const pedidoNuevoRoutes = require('./routes/pedido-nuevo');
app.use('/pedido-nuevo', requireAuth, pedidoNuevoRoutes);

const cocinaDisplayRoutes = require('./routes/cocina-display');
app.use('/cocina-display', requireAuth, cocinaDisplayRoutes);

const pedidosListaRoutes = require('./routes/pedidos-lista');
app.use('/pedidos', requireAuth, pedidosListaRoutes);

// PASO 5 — Mesa Abierta + Para Llevar + Cortesías
const mesaCuentaRoutes = require('./routes/mesa-cuenta');
app.use('/mesa', requireAuth, mesaCuentaRoutes);

const paraLlevarRoutes = require('./routes/para-llevar');
app.use('/para-llevar', requireAuth, paraLlevarRoutes);

const cortesiasRoutes = require('./routes/cortesias');
app.use('/cortesias', requireAuth, cortesiasRoutes);

// Almacen (admin + almacenero)
app.use('/almacen', requireRole(['administrador', 'almacenero']), almacenRoutes);

// Recetas API (admin + almacenero)
app.use('/api/recetas', requireRole(['administrador', 'almacenero']), recetasRoutes);

// Recetas standalone page + items API (admin + almacenero)
app.use('/recetas', requireAuth, requireRole(['administrador', 'almacenero']), recetasStandaloneRoutes);
app.use('/api/recetas-standalone', requireAuth, requireRole(['administrador', 'almacenero']), recetasStandaloneRoutes);

// SUNAT (admin)
app.use('/sunat', requireRole('administrador'), sunatRoutes);
app.use('/api/sunat', requireRole('administrador'), sunatRoutes);

// SUNAT PWA — mobile views (admin + cajero)
app.use('/sunat-pwa', requireAuth, requireRole(['administrador', 'cajero']), sunatPwaRoutes);

// Sprint 4 — Mantenimiento, Eventos, Gastos, Fidelidad, Promociones, Propinas
app.use('/sprint4', requireAuth, requireRole(['administrador', 'cajero', 'mesero']), sprint4Routes);

// Hub "Más" — menú PWA con todos los módulos
app.get('/mas', requireAuth, (req, res) => {
  res.render('mas', { user: req.session.user });
});

// DallIA shorthand redirects
app.get('/dallia',     requireAuth, (req, res) => res.redirect('/api/chat/dallia'));
app.get('/dallia/voz', requireAuth, (req, res) => res.redirect('/api/chat/dallia/voz'));
app.get('/dallia/alertas', requireAuth, (req, res) => res.redirect('/api/chat/dallia/alertas'));

// Caja (admin + cajero)
app.use('/caja', requireRole(['administrador', 'cajero']), cajaRoutes);
app.use('/api/caja', requireRole(['administrador', 'cajero']), cajaRoutes);

// Chat IA (admin)
app.use('/chat', requireRole('administrador'), chatLimiter, chatRoutes);
app.use('/api/chat', requireRole('administrador'), chatLimiter, chatRoutes);

// SOSTAC — strategic framework (admin)
app.use('/sostac', requireAuth, requireRole(['administrador']), sostacRoutes);

// Contratos (superadmin only)
app.use('/contratos', requireAuth, requireRole('superadmin'), contratosRoutes);
app.use('/api/contratos', requireAuth, requireRole('superadmin'), contratosRoutes);

// NDA Equipo (superadmin only)
app.use('/nda-equipo', requireAuth, requireRole('superadmin'), ndaEquipoRoutes);
app.use('/api/nda-equipo', requireAuth, requireRole('superadmin'), ndaEquipoRoutes);

// Social media API (admin)
app.use('/api/social', requireRole('administrador'), socialApiRoutes);

// Redes sociales (admin)
app.get('/redes-sociales', requireRole('administrador'), (req, res) => res.render('redes-sociales'));

// Competencia (admin)
app.get('/competencia', requireRole('administrador'), (req, res) => res.render('competencia'));

// Ranking (admin) - with real data
app.get('/ranking', requireRole('administrador'), async (req, res) => {
    const stats = { ventasMes: 0, productoEstrella: 'N/A', clientesActivos: 0, ticketPromedio: 0, ventasHoy: 0, topProductos: [] };
    try {
        const tid = req.tenantId || 1;
        const [[vm]] = await db.query("SELECT COUNT(*) as t, COALESCE(SUM(total),0) as m FROM facturas WHERE fecha >= NOW() - INTERVAL '30 days'");
        stats.ventasMes = Number(vm.m).toFixed(2);
        const [[vh]] = await db.query("SELECT COUNT(*) as t, COALESCE(SUM(total),0) as m FROM facturas WHERE (fecha AT TIME ZONE 'America/Lima')::date = (NOW() AT TIME ZONE 'America/Lima')::date");
        stats.ventasHoy = Number(vh.m).toFixed(2);
        stats.ticketPromedio = vm.t > 0 ? (Number(vm.m) / vm.t).toFixed(2) : '0.00';
        const [[cl]] = await db.query("SELECT COUNT(*) as t FROM clientes");
        stats.clientesActivos = cl.t;
        const [tp] = await db.query("SELECT p.nombre, SUM(df.cantidad) as qty, SUM(df.subtotal) as monto FROM detalle_factura df JOIN productos p ON p.id=df.producto_id JOIN facturas f ON f.id=df.factura_id WHERE df.created_at >= NOW() - INTERVAL '30 days' GROUP BY df.producto_id, p.nombre ORDER BY qty DESC LIMIT 10");
        stats.topProductos = tp || [];
        if (tp.length > 0) stats.productoEstrella = tp[0].nombre;
    } catch (e) { console.error('Ranking stats error:', e.message); }
    res.render('ranking', { stats });
});

// Observabilidad panel (superadmin only)
app.use('/superadmin/observabilidad', requireAuth, requireRole('superadmin'), observabilidadRoutes);

// Cotizador (superadmin only) — must be before generic /superadmin mount
const cotizacionesRoutes = require('./routes/cotizaciones');
app.use('/superadmin/cotizador', requireAuth, requireRole('superadmin'), cotizacionesRoutes);
app.use('/api/superadmin/cotizador', requireAuth, requireRole('superadmin'), cotizacionesRoutes);

// Superadmin panel (superadmin role only - cross-tenant)
app.use('/superadmin', requireAuth, requireRole('superadmin'), superadminRoutes);
app.use('/api/superadmin', requireAuth, requireRole('superadmin'), superadminRoutes);

// Delivery integration (admin + webhooks)
const deliveryRoutes = require('./routes/delivery');
app.use('/api/delivery/webhook', deliveryRoutes); // Webhooks - no auth (called by Rappi/PedidosYa)
app.use('/delivery', requireAuth, requireRole('administrador'), deliveryRoutes);
app.use('/api/delivery', requireAuth, requireRole('administrador'), deliveryRoutes);

// Features (reservas, delivery, promos, fidelidad - admin)
app.use('/features', requireRole('administrador'), featuresRoutes);
app.use('/api/features', requireRole('administrador'), featuresRoutes);
// Menu digital publico (sin auth)
app.get('/menu', (req, res) => res.redirect('/features/menu'));

// Canales internos (todos los roles)
app.use('/canales', requireAuth, canalesRoutes);
app.use('/api/canales', requireAuth, canalesRoutes);

// TTS - Text to Speech (mascota)
app.use('/api/tts', requireAuth, ttsRoutes);

// Reportes PDF (admin)
app.use('/reportes', requireAuth, requireRole('administrador'), reportesRoutes);
app.use('/api/reportes', requireAuth, requireRole('administrador'), reportesRoutes);

// Administracion P&L (admin)
app.use('/administracion', requireRole('administrador'), administracionRoutes);
app.use('/api/administracion', requireRole('administrador'), administracionRoutes);

// Backups (admin + superadmin only)
app.use('/api/backups', requireAuth, requireRole(['administrador', 'superadmin']), backupsRoutes);
// Backups HTML view
app.get('/backups', requireAuth, requireRole(['administrador', 'superadmin']), (req, res) => {
    const svc = require('./services/backup');
    const tenantId = req.session?.user?.rol === 'superadmin' ? null : (req.tenantId || 1);
    const isSuperadmin = req.session?.user?.rol === 'superadmin';
    svc.listarBackups(tenantId, 30)
        .then(backups => res.render('backups', { backups, isSuperadmin }))
        .catch(e => { console.error(e); res.render('backups', { backups: [], isSuperadmin }); });
});

// Soporte (all authenticated users can create tickets; admin/superadmin can manage)
app.use('/soporte', requireAuth, soporteRoutes);
app.use('/api/soporte', requireAuth, soporteRoutes);

// Configuración y ventas (admin)
app.use('/configuracion', requireRole('administrador'), configuracionRoutes);
app.use('/config', requireAuth, configPwaRoutes);
app.use('/ventas', requireRole('administrador'), ventasRoutes);

// ── Slug rewrite: /:slug/* → /* (tenant path routing) ───────────────────
// Si el request es para un path de tenant (e.g., /chuleta/mesas),
// reescribe la URL y re-dispatcha para que las rutas existentes funcionen.
app.use((req, res, next) => {
    if (res.locals.isTenantPath && res.locals.tenantSlug && !res.locals._slugRewritten) {
        const slug = res.locals.tenantSlug;
        res.locals.basePath = `/${slug}`;
        req.url = req.url.replace(new RegExp(`^/${slug}`), '') || '/';
        res.locals._slugRewritten = true; // evitar loop infinito
        return app.handle(req, res, next);
    }
    next();
});

// Manejo de errores 404
app.use((req, res, next) => {
    console.log('404 - Ruta no encontrada:', req.url);
    if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
        res.status(404).json({ error: 'Ruta no encontrada' });
    } else {
        res.status(404).render('404');
    }
});

// Manejo de errores generales
app.use((err, req, res, next) => {
    console.error('Error en la aplicación:', err);

    if (req.xhr || (req.headers.accept && req.headers.accept.indexOf('json') > -1)) {
        res.status(500).json({
            error: 'Error interno del servidor',
            message: process.env.NODE_ENV === 'development' ? err.message : 'Error interno'
        });
    } else {
        res.status(500).render('error', {
            error: {
                message: err.message || 'Error interno del servidor',
                stack: err.stack || ''
            }
        });
    }
});

// Export app for Vercel serverless
module.exports = app;

// Puerto fijo: 1995
// - APP_PORT: variable específica de este sistema
// - PORT: configurado en .env (1995)
// - 1995: fallback por defecto
const PORT = Number(process.env.APP_PORT || process.env.PORT || 1995);

// Verificar la conexión a la base de datos antes de iniciar el servidor
async function startServer() {
    try {
        console.log('Intentando conectar a la base de datos...');
        const connection = await db.getConnection();
        connection.release();
        console.log('Conexión exitosa a la base de datos');

        // Iniciar el servidor solo si la conexión a la base de datos es exitosa.
        // Si el puerto está ocupado, probamos automáticamente el siguiente disponible.
        // Relacionado con: escenarios donde hay otros Node corriendo en la misma máquina.
        const host = '0.0.0.0';
        const maxIntentosPuerto = 10;

        function listenConFallback(puertoInicial, intentosRestantes) {
            return new Promise((resolve, reject) => {
                const puerto = Number(puertoInicial);
                const server = app.listen(puerto, host, () => {
                    console.log(`Servidor corriendo en http://localhost:${puerto} (LAN habilitada)`);
                    console.log('Rutas disponibles:');
                    console.log('- GET  /', '(Página principal)');
                    console.log('- POST /api/facturas', '(Generar factura)');
                    console.log('- GET  /api/facturas/:id/imprimir', '(Imprimir factura)');
                    resolve(server);
                });

                server.on('error', (error) => {
                    if (error && error.code === 'EADDRINUSE') {
                        if (intentosRestantes > 0) {
                            const siguiente = puerto + 1;
                            console.warn(`Puerto ${puerto} en uso. Probando ${siguiente}...`);
                            try { server.close(); } catch (_) { }
                            return resolve(listenConFallback(siguiente, intentosRestantes - 1));
                        }
                        return reject(new Error(`No hay puertos disponibles desde ${puerto} hasta ${puerto + maxIntentosPuerto}`));
                    }
                    reject(error);
                });
            });
        }

        const httpServer = await listenConFallback(PORT, maxIntentosPuerto);

        // Device Preview WebSocket sync relay
        // Todos los iframes se conectan aquí. Cuando uno manda un evento, se retransmite a todos los demás.
        try {
            const { WebSocketServer } = require('ws');
            const dpSync = new WebSocketServer({ server: httpServer, path: '/dp-sync' });
            const dpClients = new Set();
            dpSync.on('connection', ws => {
                dpClients.add(ws);
                ws.on('message', data => {
                    // Relay to all other clients
                    dpClients.forEach(c => { if (c !== ws && c.readyState === 1) c.send(data); });
                });
                ws.on('close', () => dpClients.delete(ws));
                ws.on('error', () => dpClients.delete(ws));
            });
            console.log('Device Preview sync WebSocket listo en /dp-sync');
        } catch (e) {
            console.warn('Device Preview sync WebSocket no disponible:', e.message);
        }

    } catch (err) {
        console.error('Error al conectar a la base de datos:', err);
        process.exit(1);
    }
}

// Manejar señales de terminación
process.on('SIGTERM', () => {
    console.log('Recibida señal SIGTERM. Cerrando servidor...');
    process.exit(0);
});

process.on('SIGINT', () => {
    console.log('Recibida señal SIGINT. Cerrando servidor...');
    process.exit(0);
});

// Solo arrancar servidor si se ejecuta directamente (no en Vercel)
if (require.main === module) {
    startServer();
} 