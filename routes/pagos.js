/**
 * routes/pagos.js
 * Izipay payment gateway integration for dignita.tech restaurant SaaS.
 *
 * Izipay (izipay.pe) is a Peruvian payment processor.
 * They use the Krypton JS SDK (micuentaweb.pe) to render a secure payment popup.
 *
 * SETUP (when you have real credentials from Izipay):
 *   1. Log in to https://secure.micuentaweb.pe/merchant (merchant back-office).
 *   2. Get your "Public Key" (kr-public-key) and "HMAC-SHA-256 password" (to sign requests).
 *   3. Set them in .env:
 *        IZIPAY_PUBLIC_KEY=~~your-public-key~~
 *        IZIPAY_HMAC_KEY=~~your-hmac-sha256-key~~
 *        IZIPAY_SHOP_ID=~~your-shop-id~~
 *   4. Uncomment the real formToken creation logic in POST /crear-sesion.
 *
 * Routes (all PUBLIC - no auth required so landing page can use them):
 *   POST /api/pagos/crear-sesion      Create a Krypton formToken for a plan
 *   POST /api/pagos/izipay-success    Browser redirect after successful payment
 *   POST /api/pagos/izipay-webhook    IPN (Instant Payment Notification) from Izipay
 *   GET  /api/pagos/planes            Return plan definitions (used by landing page)
 */

const express = require('express');
const router  = express.Router();
const crypto  = require('crypto');

// ── Plan catalog ──────────────────────────────────────────────────────────────
const PLANES = {
    free: {
        id:          'free',
        nombre:      'Free',
        precio:      0,
        moneda:      'PEN',
        descripcion: 'Para empezar sin costo',
        features: [
            'Hasta 2 usuarios',
            'Hasta 50 facturas/mes',
            'Gestion de mesas basica',
            'Panel de cocina',
            'Soporte por email'
        ],
        destacado: false
    },
    pro: {
        id:          'pro',
        nombre:      'Pro',
        precio:      150000,          // centimos de sol (S/ 1,500.00)
        moneda:      'PEN',
        descripcion: 'Para restaurantes en crecimiento',
        features: [
            'Usuarios ilimitados',
            'Facturas ilimitadas',
            'DalIA (2M tokens/año)',
            'Exportacion Excel / PDF',
            'Multi-dispositivo LAN',
            'Gestion de almacen',
            'Redes sociales integradas',
            'Soporte prioritario'
        ],
        destacado: true
    },
    enterprise: {
        id:          'enterprise',
        nombre:      'Enterprise',
        precio:      300000,          // centimos de sol (S/ 3,000.00)
        moneda:      'PEN',
        descripcion: 'Para cadenas y franquicias',
        features: [
            'Todo lo de Pro',
            'Multi-local (hasta 5 sedes)',
            'DalIA sin limite de tokens',
            'Integracion SUNAT / OSE',
            'API publica (webhooks)',
            'Onboarding presencial',
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

// ── POST /api/pagos/crear-sesion ──────────────────────────────────────────────
/**
 * Creates a Krypton formToken by calling Izipay's Charge/CreatePayment REST API.
 *
 * Expected body: { planId: 'pro' | 'enterprise', email: string, razonSocial?: string }
 *
 * When IZIPAY_SHOP_ID + IZIPAY_HMAC_KEY are NOT set in .env, we return a
 * placeholder response so the frontend can show the UI without crashing.
 */
router.post('/crear-sesion', async (req, res) => {
    const { planId, email, razonSocial } = req.body;

    if (!planId || !PLANES[planId]) {
        return res.status(400).json({ error: 'Plan no valido. Opciones: free, pro, enterprise' });
    }

    const plan = PLANES[planId];

    if (plan.precio === 0) {
        // Free plan: no payment needed — redirect to /setup directly
        return res.json({ free: true, redirect: '/setup?plan=free' });
    }

    const shopId  = process.env.IZIPAY_SHOP_ID;
    const hmacKey = process.env.IZIPAY_HMAC_KEY;

    // ── Placeholder mode (no credentials configured yet) ──────────────────────
    if (!shopId || !hmacKey) {
        console.warn('[pagos] Izipay credentials not configured — returning placeholder formToken');
        return res.json({
            placeholder: true,
            message: 'Credenciales de Izipay no configuradas. Configura IZIPAY_SHOP_ID e IZIPAY_HMAC_KEY en .env',
            plan: { id: plan.id, nombre: plan.nombre, precio: plan.precio / 100 }
        });
    }

    // ── Real Izipay integration ───────────────────────────────────────────────
    // Docs: https://secure.micuentaweb.pe/doc/es-PE/rest/V4.0/api/playground/Charge/CreatePayment/
    try {
        const orderId = `DIGNITA-${plan.id.toUpperCase()}-${Date.now()}`;

        const payload = {
            amount:      plan.precio,
            currency:    plan.moneda,
            orderId,
            customer: {
                email:      email     || 'cliente@dignita.tech',
                reference:  razonSocial || 'Nuevo cliente'
            },
            metadata: {
                plan:     plan.id,
                sistema:  'dignita.tech'
            }
        };

        // Basic Auth for Krypton REST: shopId:hmacKey base64-encoded
        const basicAuth = Buffer.from(`${shopId}:${hmacKey}`).toString('base64');

        const izipayResp = await fetch(
            'https://api.micuentaweb.pe/api-payment/V4/Charge/CreatePayment',
            {
                method: 'POST',
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
                error:   'Error al crear sesion de pago con Izipay',
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
        res.status(500).json({ error: 'Error interno al crear sesion de pago' });
    }
});

// ── POST /api/pagos/izipay-success ────────────────────────────────────────────
/**
 * Krypton redirects the browser here after a successful payment (kr-post-url-success).
 * Izipay POSTs the payment result as form fields.
 * We verify the HMAC signature, then redirect to /setup with the plan.
 */
router.post('/izipay-success', async (req, res) => {
    const hmacKey = process.env.IZIPAY_HMAC_KEY;

    // If credentials not configured, just redirect to setup
    if (!hmacKey) {
        console.warn('[pagos] izipay-success called without IZIPAY_HMAC_KEY — redirecting to setup');
        return res.redirect('/setup?plan=pro&pago=ok&demo=1');
    }

    try {
        // Krypton sends: kr-answer, kr-hash, kr-hash-algorithm, kr-hash-key, etc.
        const krAnswer    = req.body['kr-answer']    || '';
        const krHash      = req.body['kr-hash']      || '';
        const krAlgorithm = req.body['kr-hash-algorithm'] || 'sha256_hmac';

        // Verify HMAC-SHA256 signature
        const computedHash = crypto
            .createHmac('sha256', hmacKey)
            .update(krAnswer)
            .digest('hex');

        if (computedHash !== krHash) {
            console.error('[pagos] HMAC verification failed — possible tampering');
            return res.status(400).send('Firma de pago invalida. Contacta a soporte.');
        }

        const answer = JSON.parse(krAnswer);
        const planId = answer?.metadata?.plan || 'pro';

        console.log(`[pagos] Pago exitoso: plan=${planId} orderId=${answer?.orderDetails?.orderId}`);

        // TODO: registrar la suscripcion en tenant_suscripciones
        // const email = answer?.customer?.email;
        // await crearSuscripcion(email, planId);

        res.redirect(`/setup?plan=${planId}&pago=ok`);

    } catch (err) {
        console.error('[pagos] izipay-success error:', err);
        res.redirect('/setup?plan=pro&pago=error');
    }
});

// ── POST /api/pagos/izipay-webhook ────────────────────────────────────────────
/**
 * IPN (Instant Payment Notification) - Izipay calls this endpoint from their servers
 * to notify about payment status changes (paid, refunded, cancelled, etc.).
 *
 * IMPORTANT: This endpoint must be publicly accessible (not behind auth middleware).
 * Register the webhook URL in Izipay back-office:
 *   https://secure.micuentaweb.pe/merchant → Configuracion → Reglas de notificacion
 *   URL: https://tu-dominio.com/api/pagos/izipay-webhook
 */
router.post('/izipay-webhook', async (req, res) => {
    const hmacKey = process.env.IZIPAY_HMAC_KEY;

    if (!hmacKey) {
        // Accept and ignore if not configured (avoid 500 errors during setup)
        return res.json({ status: 'ignored', reason: 'IZIPAY_HMAC_KEY not set' });
    }

    try {
        const krAnswer = req.body['kr-answer'] || '';
        const krHash   = req.body['kr-hash']   || '';

        const computedHash = crypto
            .createHmac('sha256', hmacKey)
            .update(krAnswer)
            .digest('hex');

        if (computedHash !== krHash) {
            console.error('[pagos] Webhook HMAC mismatch — ignoring');
            return res.status(400).json({ error: 'Invalid signature' });
        }

        const answer      = JSON.parse(krAnswer);
        const status      = answer?.orderStatus;      // e.g. "PAID"
        const orderId     = answer?.orderDetails?.orderId;
        const planId      = answer?.metadata?.plan;
        const clientEmail = answer?.customer?.email;

        console.log(`[pagos] Webhook: orderId=${orderId} status=${status} plan=${planId} email=${clientEmail}`);

        // TODO: handle payment lifecycle events
        // if (status === 'PAID') { await activarSuscripcion(clientEmail, planId); }
        // if (status === 'CANCELLED') { await cancelarSuscripcion(clientEmail); }

        // Izipay expects a 200 OK with OK in the body to acknowledge receipt
        res.send('OK');

    } catch (err) {
        console.error('[pagos] Webhook error:', err);
        // Return 200 so Izipay doesn't retry endlessly
        res.send('OK');
    }
});

module.exports = router;
