/**
 * routes/pagos.js
 * Izipay payment gateway integration for MiRest con IA SaaS.
 *
 * Izipay (izipay.pe) uses the Krypton JS SDK (micuentaweb.pe).
 *
 * ENV vars required:
 *   IZIPAY_SHOP_ID      - Shop identifier (e.g. 41576398)
 *   IZIPAY_PUBLIC_KEY    - Client JS key (e.g. 41576398:testpublickey_...)
 *   IZIPAY_SERVER_KEY    - Server password for REST API Basic Auth
 *   IZIPAY_HMAC_KEY      - HMAC-SHA-256 key for signature verification
 *
 * Routes (PUBLIC - no auth required):
 *   GET  /api/pagos/planes           Return plan catalog
 *   POST /api/pagos/crear-sesion     Create Krypton formToken
 *   POST /api/pagos/izipay-success   Browser redirect after payment
 *   POST /api/pagos/izipay-webhook   IPN from Izipay servers
 */

const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');

// ── Plan catalog ──────────────────────────────────────────────────────────────
const PLANES = {
    gratis: {
        id:          'gratis',
        nombre:      'Prueba Gratis',
        precio:      0,
        moneda:      'PEN',
        periodo:     'trial',
        descripcion: '5 dias sin tarjeta, 15 dias con tarjeta',
        features: [
            '5 dias gratis sin tarjeta',
            '15 dias gratis con tarjeta',
            'Todas las funciones incluidas',
            'Sin compromiso',
            'Soporte por email'
        ],
        destacado: false,
        trial_dias_sin_tarjeta: 5,
        trial_dias_con_tarjeta: 15
    },
    mensual: {
        id:          'mensual',
        nombre:      'Mensual',
        precio:      15000,              // centimos (S/ 150.00)
        moneda:      'PEN',
        periodo:     'mensual',
        descripcion: 'Pago mes a mes, cancela cuando quieras',
        features: [
            'Usuarios ilimitados',
            'Facturas ilimitadas',
            'DalIA asistente IA',
            'Gestion de almacen',
            'Panel de cocina en vivo',
            'Exportacion Excel / PDF',
            'Multi-dispositivo LAN',
            'Soporte prioritario'
        ],
        destacado: false
    },
    anual: {
        id:          'anual',
        nombre:      'Anual',
        precio:      150000,             // centimos (S/ 1,500.00)
        moneda:      'PEN',
        periodo:     'anual',
        descripcion: 'Ahorra S/ 300 vs mensual',
        features: [
            'Todo lo del plan Mensual',
            'Ahorro de 2 meses gratis',
            'DalIA con tokens extendidos',
            'Redes sociales integradas',
            'Soporte prioritario 24/7'
        ],
        destacado: true
    },
    '2anos': {
        id:          '2anos',
        nombre:      '2 Anos',
        precio:      250000,             // centimos (S/ 2,500.00)
        moneda:      'PEN',
        periodo:     '2anos',
        descripcion: 'Incluye almacenamiento extra',
        features: [
            'Todo lo del plan Anual',
            'Almacenamiento extendido',
            'DalIA sin limite de tokens',
            'Integracion SUNAT / OSE',
            'Onboarding personalizado'
        ],
        destacado: false
    },
    vida: {
        id:          'vida',
        nombre:      'De por Vida',
        precio:      320000,             // centimos (S/ 3,200.00)
        moneda:      'PEN',
        periodo:     'vida',
        descripcion: 'Pago unico, acceso para siempre',
        features: [
            'Todo lo del plan 2 Anos',
            'Acceso de por vida',
            'Actualizaciones incluidas',
            'Multi-local (hasta 5 sedes)',
            'API publica (webhooks)',
            'SLA 99.9% uptime',
            'Gerente de cuenta dedicado'
        ],
        destacado: false
    }
};

// ── GET /api/pagos/planes ─────────────────────────────────────────────────────
router.get('/planes', (req, res) => {
    res.json(Object.values(PLANES));
});

// ── GET /checkout ─────────────────────────────────────────────────────────────
// Server-side rendered checkout page with Krypton embedded form
router.get('/checkout', async (req, res) => {
    const { planId, email } = req.query;

    if (!planId || !PLANES[planId]) {
        return res.redirect('/landing#precios');
    }

    const plan = PLANES[planId];

    if (plan.precio === 0) {
        return res.redirect('/setup?plan=gratis');
    }

    const shopId    = (process.env.IZIPAY_SHOP_ID || '').trim();
    const serverKey = (process.env.IZIPAY_SERVER_KEY || '').trim();
    const publicKey = (process.env.IZIPAY_PUBLIC_KEY || '').trim();

    if (!shopId || !serverKey) {
        return res.render('checkout', {
            error: 'Pasarela de pago no configurada',
            plan, formToken: null, publicKey: null
        });
    }

    try {
        const orderId = `MIREST-${plan.id.toUpperCase()}-${Date.now()}`;

        const payload = {
            amount:   plan.precio,
            currency: plan.moneda,
            orderId,
            customer: {
                email: email || 'cliente@mirestconia.com'
            },
            metadata: {
                plan:    plan.id,
                periodo: plan.periodo,
                sistema: 'MiRest con IA'
            }
        };

        const basicAuth = Buffer.from(`${shopId}:${serverKey}`).toString('base64');

        const izipayResp = await fetch(
            'https://api.micuentaweb.pe/api-payment/V4/Charge/CreatePayment',
            {
                method:  'POST',
                headers: {
                    'Content-Type':  'application/json',
                    'Authorization': `Basic ${basicAuth}`
                },
                body: JSON.stringify(payload)
            }
        );

        const data = await izipayResp.json();

        if (!izipayResp.ok || data.status !== 'SUCCESS') {
            return res.render('checkout', {
                error: data?.answer?.errorMessage || 'Error al crear sesion de pago',
                plan, formToken: null, publicKey: null
            });
        }

        res.render('checkout', {
            error: null,
            plan,
            formToken: data.answer.formToken,
            publicKey
        });

    } catch (err) {
        console.error('[pagos] checkout error:', err);
        res.render('checkout', {
            error: 'Error interno: ' + err.message,
            plan, formToken: null, publicKey: null
        });
    }
});

// ── POST /api/pagos/crear-sesion ──────────────────────────────────────────────
router.post('/crear-sesion', async (req, res) => {
    const { planId, email, razonSocial } = req.body;

    if (!planId || !PLANES[planId]) {
        return res.status(400).json({
            error: 'Plan no valido',
            opciones: Object.keys(PLANES)
        });
    }

    const plan = PLANES[planId];

    // Free plan: no payment needed
    if (plan.precio === 0) {
        return res.json({ free: true, redirect: '/setup?plan=gratis' });
    }

    const shopId    = (process.env.IZIPAY_SHOP_ID || '').trim();
    const serverKey = (process.env.IZIPAY_SERVER_KEY || '').trim();

    if (!shopId || !serverKey) {
        console.warn('[pagos] Izipay credentials not configured');
        return res.status(503).json({
            error: 'Pasarela de pago no configurada. Contacta al administrador.'
        });
    }

    try {
        const orderId = `MIREST-${plan.id.toUpperCase()}-${Date.now()}`;

        const payload = {
            amount:   plan.precio,
            currency: plan.moneda,
            orderId,
            customer: {
                email:     email || 'cliente@mirestconia.com',
                reference: razonSocial || 'Nuevo cliente'
            },
            metadata: {
                plan:    plan.id,
                periodo: plan.periodo,
                sistema: 'MiRest con IA'
            }
        };

        // Izipay REST API uses Basic Auth: shopId:serverPassword
        const basicAuth = Buffer.from(`${shopId}:${serverKey}`).toString('base64');

        const izipayResp = await fetch(
            'https://api.micuentaweb.pe/api-payment/V4/Charge/CreatePayment',
            {
                method:  'POST',
                headers: {
                    'Content-Type':  'application/json',
                    'Authorization': `Basic ${basicAuth}`
                },
                body: JSON.stringify(payload)
            }
        );

        const data = await izipayResp.json();

        if (!izipayResp.ok || data.status !== 'SUCCESS') {
            console.error('[pagos] Izipay CreatePayment error:', data);
            return res.status(502).json({
                error:   'Error al crear sesion de pago',
                details: data?.answer?.errorMessage || 'Error desconocido'
            });
        }

        res.json({
            formToken: data.answer?.formToken,
            publicKey: process.env.IZIPAY_PUBLIC_KEY,
            plan:      { id: plan.id, nombre: plan.nombre, precio: plan.precio / 100 }
        });

    } catch (err) {
        console.error('[pagos] crear-sesion error:', err);
        res.status(500).json({
            error: 'Error interno al crear sesion de pago',
            details: err.message
        });
    }
});

// ── POST /api/pagos/izipay-success ────────────────────────────────────────────
router.post('/izipay-success', async (req, res) => {
    const hmacKey = process.env.IZIPAY_HMAC_KEY;

    if (!hmacKey) {
        return res.redirect('/setup?plan=gratis&pago=ok&demo=1');
    }

    try {
        const krAnswer = req.body['kr-answer'] || '';
        const krHash   = req.body['kr-hash']   || '';

        // Verify HMAC-SHA256 signature
        const computedHash = crypto
            .createHmac('sha256', hmacKey)
            .update(krAnswer)
            .digest('hex');

        if (computedHash !== krHash) {
            console.error('[pagos] HMAC verification failed');
            return res.status(400).send('Firma de pago invalida. Contacta a soporte.');
        }

        const answer = JSON.parse(krAnswer);
        const planId = answer?.metadata?.plan || 'mensual';
        const status = answer?.orderStatus;

        console.log(`[pagos] Pago exitoso: plan=${planId} status=${status} orderId=${answer?.orderDetails?.orderId}`);

        // TODO: registrar suscripcion en tenant_suscripciones
        // await db.query('INSERT INTO tenant_suscripciones ...');

        res.redirect(`/setup?plan=${planId}&pago=ok`);

    } catch (err) {
        console.error('[pagos] izipay-success error:', err);
        res.redirect('/setup?pago=error');
    }
});

// ── POST /api/pagos/izipay-webhook ────────────────────────────────────────────
router.post('/izipay-webhook', async (req, res) => {
    const hmacKey = process.env.IZIPAY_HMAC_KEY;

    if (!hmacKey) {
        return res.json({ status: 'ignored', reason: 'HMAC key not configured' });
    }

    try {
        const krAnswer = req.body['kr-answer'] || '';
        const krHash   = req.body['kr-hash']   || '';

        const computedHash = crypto
            .createHmac('sha256', hmacKey)
            .update(krAnswer)
            .digest('hex');

        if (computedHash !== krHash) {
            console.error('[pagos] Webhook HMAC mismatch');
            return res.status(400).json({ error: 'Invalid signature' });
        }

        const answer      = JSON.parse(krAnswer);
        const status      = answer?.orderStatus;
        const orderId     = answer?.orderDetails?.orderId;
        const planId      = answer?.metadata?.plan;
        const clientEmail = answer?.customer?.email;

        console.log(`[pagos] Webhook: orderId=${orderId} status=${status} plan=${planId} email=${clientEmail}`);

        // TODO: activate/cancel subscriptions based on status
        // if (status === 'PAID') { await activarSuscripcion(clientEmail, planId); }
        // if (status === 'CANCELLED') { await cancelarSuscripcion(clientEmail); }

        res.send('OK');

    } catch (err) {
        console.error('[pagos] Webhook error:', err);
        res.send('OK');
    }
});

module.exports = router;
