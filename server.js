require('dotenv').config();
const express = require('express');
const bodyParser = require('body-parser');
const path = require('path');
const fs = require('fs');
const app = express();
const db = require('./db');
const session = require('express-session');
const { attachUserToLocals, requireAuth, requireRole } = require('./middleware/auth');
const { attachTenant } = require('./middleware/tenant');
const { requireCajaAbierta } = require('./middleware/requireCaja');

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

// Aumentar el límite de tamaño del cuerpo de la petición
app.use(express.json({limit: '50mb'}));
app.use(express.urlencoded({ extended: true, limit: '50mb' }));

// Sesiones (login)
// Relacionado con:
// - routes/auth.js (POST /login, POST /logout)
// - middleware/auth.js (req.session.user)
// Nota: para uso local/offline. Si requieres persistir sesiones entre reinicios,
// se puede cambiar a un store en BD (no incluido aquí para mantener simple).
app.use(session({
    name: 'sr.sid',
    secret: process.env.SESSION_SECRET || (() => { console.warn('ADVERTENCIA: SESSION_SECRET no configurado en .env, usando valor por defecto inseguro'); return 'dev-only-insecure-default'; })(),
    resave: false,
    saveUninitialized: false,
    cookie: {
        httpOnly: true,
        sameSite: 'lax',
        maxAge: 1000 * 60 * 60 * 12 // 12 horas
    }
}));

// Tenant middleware (resuelve tenant_id por request)
app.use(attachTenant);

// Hacer disponible el usuario en EJS como "user"
app.use(attachUserToLocals);

// Make reqPath available in all views
app.use((req, res, next) => {
    res.locals.reqPath = req.path;
    next();
});

// Configuración de archivos estáticos
app.use('/static', express.static(path.join(__dirname, 'public')));
app.use(express.static(path.join(__dirname, 'public')));

// Vendor assets (para funcionar OFFLINE incluso empaquetado con pkg)
// Nota: estos paths deben existir en node_modules y estar incluidos en package.json -> pkg.assets
app.use('/vendor/bootstrap', express.static(path.join(__dirname, 'node_modules', 'bootstrap', 'dist')));
app.use('/vendor/jquery', express.static(path.join(__dirname, 'node_modules', 'jquery', 'dist')));
app.use('/vendor/sweetalert2', express.static(path.join(__dirname, 'node_modules', 'sweetalert2', 'dist')));
app.use('/vendor/select2', express.static(path.join(__dirname, 'node_modules', 'select2', 'dist')));
app.use('/vendor/select2-bootstrap-5-theme', express.static(path.join(__dirname, 'node_modules', 'select2-bootstrap-5-theme', 'dist')));
// bootstrap-icons usa fuentes (woff/woff2) -> servir carpeta font completa
app.use('/vendor/bootstrap-icons', express.static(path.join(__dirname, 'node_modules', 'bootstrap-icons', 'font')));

// HTTPS redirect en produccion
if (process.env.NODE_ENV === 'production') {
    app.use((req, res, next) => {
        if (req.headers['x-forwarded-proto'] !== 'https') {
            return res.redirect(301, `https://${req.headers.host}${req.url}`);
        }
        next();
    });
}

// CSRF protection para formularios (no para API JSON)
const csrf = require('csurf');
const csrfProtection = csrf({ cookie: false });
// Se aplica solo a formularios que lo necesiten, no globalmente
// Las APIs JSON estan protegidas por SOP + Content-Type check

// Headers de seguridad y CORS
app.use((req, res, next) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'SAMEORIGIN');
    res.setHeader('X-XSS-Protection', '1; mode=block');
    const allowedOrigin = process.env.CORS_ORIGIN || req.headers.origin || '*';
    res.setHeader('Access-Control-Allow-Origin', allowedOrigin);
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
const ventasRoutes = require('./routes/ventas');
const authRoutes = require('./routes/auth');
const usuariosRoutes = require('./routes/usuarios');
const chatRoutes = require('./routes/chat');
const socialApiRoutes = require('./routes/social-api');
const almacenRoutes = require('./routes/almacen');
const recetasRoutes = require('./routes/recetas');
const cajaRoutes = require('./routes/caja');
const sunatRoutes = require('./routes/sunat');
const administracionRoutes = require('./routes/administracion');
const canalesRoutes = require('./routes/canales');
const reportesRoutes = require('./routes/reportes');
const featuresRoutes = require('./routes/features');

// Auth routes (públicas): /login /logout /setup
app.use(authRoutes);

// Landing page (always public)
app.get('/landing', (req, res) => {
    res.render('landing');
});

// Ruta principal - Dashboard (requiere login)
app.get('/', requireAuth, async (req, res) => {
    const rol = String(req.session?.user?.rol || '').toLowerCase();
    if (rol === 'cocinero') return res.redirect('/cocina');
    if (rol === 'mesero') return res.redirect('/mesas');

    // Admin dashboard data
    const dashboard = { ventasHoy: 0, ventasMes: 0, mesasTotal: 0, mesasOcupadas: 0, productosVendidosHoy: 0, clientesTotal: 0, topProductos: [], userName: req.session?.user?.nombre || req.session?.user?.usuario || 'Admin' };
    try {
        const [[vh]] = await db.query("SELECT COUNT(*) as c, COALESCE(SUM(total),0) as m FROM facturas WHERE DATE(fecha)=CURDATE()");
        dashboard.ventasHoy = Number(vh.m).toFixed(2);
        dashboard.facturasHoy = vh.c;

        const [[vm]] = await db.query("SELECT COALESCE(SUM(total),0) as m FROM facturas WHERE fecha >= DATE_SUB(NOW(), INTERVAL 30 DAY)");
        dashboard.ventasMes = Number(vm.m).toFixed(2);

        const [[mt]] = await db.query("SELECT COUNT(*) as t FROM mesas");
        dashboard.mesasTotal = mt.t;
        const [[mo]] = await db.query("SELECT COUNT(*) as t FROM mesas WHERE estado='ocupada'");
        dashboard.mesasOcupadas = mo.t;

        const [[ph]] = await db.query("SELECT COALESCE(SUM(df.cantidad),0) as t FROM detalle_factura df JOIN facturas f ON f.id=df.factura_id WHERE DATE(f.fecha)=CURDATE()");
        dashboard.productosVendidosHoy = Number(ph.t);

        const [[cl]] = await db.query("SELECT COUNT(*) as t FROM clientes");
        dashboard.clientesTotal = cl.t;

        const [tp] = await db.query("SELECT p.nombre, SUM(df.cantidad) as qty FROM detalle_factura df JOIN productos p ON p.id=df.producto_id JOIN facturas f ON f.id=df.factura_id WHERE DATE(f.fecha)=CURDATE() GROUP BY df.producto_id ORDER BY qty DESC LIMIT 5");
        dashboard.topProductos = tp || [];
    } catch (e) { console.error('Dashboard error:', e.message); }

    res.render('dashboard', { dashboard });
});

// Facturacion rapida (la vista original index.ejs)
app.get('/facturacion', requireRole(['mesero', 'administrador']), (req, res) => {
    res.render('index');
});

// Usar las rutas
// Panel de usuarios (solo admin)
app.use('/usuarios', requireRole('administrador'), usuariosRoutes);
app.use('/api/usuarios', requireRole('administrador'), usuariosRoutes);

// Productos
app.use('/productos', requireRole('administrador'), productosRoutes); // panel admin
app.use('/api/productos', requireRole(['mesero', 'administrador']), productosRoutes); // búsqueda/armado pedido

// Clientes
app.use('/clientes', requireRole('administrador'), clientesRoutes);
app.use('/api/clientes', requireRole(['mesero', 'administrador']), clientesRoutes);

// Facturas (impresión/creación). Mesero necesita imprimir desde Mesas.
app.use('/facturas', requireRole('administrador'), facturasRoutes);
app.use('/api/facturas', requireRole(['mesero', 'administrador']), facturasRoutes);

// Mesas (mesero/admin)
app.use('/mesas', requireRole(['mesero', 'administrador']), requireCajaAbierta, mesasRoutes);
app.use('/api/mesas', requireRole(['mesero', 'administrador']), mesasRoutes);

// Cocina
// - Cocinero/Admin: puede preparar/marcar listo
// - Mesero: solo visualiza y marca "Entregado" en la pestaña de listos (la acción se hace vía /api/mesas/items/:id/estado con validación)
// Relacionado con: routes/cocina.js (middlewares por ruta) y routes/mesas.js (restricción servido)
app.use('/cocina', requireRole(['cocinero', 'mesero', 'administrador']), cocinaRoutes);
app.use('/api/cocina', requireRole(['cocinero', 'mesero', 'administrador']), cocinaRoutes);

// Almacen (admin)
app.use('/almacen', requireRole('administrador'), almacenRoutes);

// Recetas API (admin)
app.use('/api/recetas', requireRole('administrador'), recetasRoutes);

// SUNAT (admin)
app.use('/sunat', requireRole('administrador'), sunatRoutes);
app.use('/api/sunat', requireRole('administrador'), sunatRoutes);

// Caja (admin + cajero)
app.use('/caja', requireRole(['administrador', 'cajero']), cajaRoutes);
app.use('/api/caja', requireRole(['administrador', 'cajero']), cajaRoutes);

// Chat IA (admin)
app.use('/chat', requireRole('administrador'), chatRoutes);
app.use('/api/chat', requireRole('administrador'), chatRoutes);

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
        const [[vm]] = await db.query("SELECT COUNT(*) as t, COALESCE(SUM(total),0) as m FROM facturas WHERE fecha >= DATE_SUB(NOW(), INTERVAL 30 DAY)");
        stats.ventasMes = Number(vm.m).toFixed(2);
        const [[vh]] = await db.query("SELECT COUNT(*) as t, COALESCE(SUM(total),0) as m FROM facturas WHERE DATE(fecha)=CURDATE()");
        stats.ventasHoy = Number(vh.m).toFixed(2);
        stats.ticketPromedio = vm.t > 0 ? (Number(vm.m) / vm.t).toFixed(2) : '0.00';
        const [[cl]] = await db.query("SELECT COUNT(*) as t FROM clientes");
        stats.clientesActivos = cl.t;
        const [tp] = await db.query("SELECT p.nombre, SUM(df.cantidad) as qty, SUM(df.subtotal) as monto FROM detalle_factura df JOIN productos p ON p.id=df.producto_id WHERE df.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) GROUP BY df.producto_id ORDER BY qty DESC LIMIT 10");
        stats.topProductos = tp || [];
        if (tp.length > 0) stats.productoEstrella = tp[0].nombre;
    } catch (e) { console.error('Ranking stats error:', e.message); }
    res.render('ranking', { stats });
});

// Features (reservas, delivery, promos, fidelidad - admin)
app.use('/features', requireRole('administrador'), featuresRoutes);
app.use('/api/features', requireRole('administrador'), featuresRoutes);
// Menu digital publico (sin auth)
app.get('/menu', (req, res, next) => { req.tenantId = 1; next(); }, featuresRoutes.stack ? (req, res, next) => next() : (req, res) => res.redirect('/features/menu'));

// Canales internos (todos los roles)
app.use('/canales', requireAuth, canalesRoutes);
app.use('/api/canales', requireAuth, canalesRoutes);

// Reportes PDF (admin)
app.use('/api/reportes', requireRole('administrador'), reportesRoutes);

// Administracion P&L (admin)
app.use('/administracion', requireRole('administrador'), administracionRoutes);
app.use('/api/administracion', requireRole('administrador'), administracionRoutes);

// Configuración y ventas (admin)
app.use('/configuracion', requireRole('administrador'), configuracionRoutes);
app.use('/ventas', requireRole('administrador'), ventasRoutes);

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
                message: 'Error interno del servidor',
                stack: process.env.NODE_ENV === 'development' ? err.stack : ''
            }
        });
    }
});

// Puerto preferido:
// - APP_PORT: variable específica de este sistema (recomendada para evitar conflictos con otros proyectos)
// - PORT: compatibilidad con entornos existentes
// - 3002: fallback por defecto
const PORT = Number(process.env.APP_PORT || process.env.PORT || 3002);

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
                            try { server.close(); } catch (_) {}
                            return resolve(listenConFallback(siguiente, intentosRestantes - 1));
                        }
                        return reject(new Error(`No hay puertos disponibles desde ${puerto} hasta ${puerto + maxIntentosPuerto}`));
                    }
                    reject(error);
                });
            });
        }

        await listenConFallback(PORT, maxIntentosPuerto);

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

startServer(); 