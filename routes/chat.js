const express = require('express');
const router = express.Router();
const db = require('../db');

// GET /chat - Render chat view
router.get('/', (req, res) => {
    res.render('chat');
});

// System prompt builder
function buildSystemPrompt(contexto) {
    return `Eres el asistente de IA del restaurante "dignita.tech". Ayudas al administrador con preguntas sobre el negocio, productos, ventas, clientes y operaciones.

Responde en español, de forma concisa y util. Usa los datos reales del negocio que se te proporcionan.

DATOS ACTUALES DEL NEGOCIO:
${contexto}

Si no tienes datos suficientes para responder algo especifico, dilo claramente. Puedes dar sugerencias y recomendaciones basadas en los datos disponibles.`;
}

// Build conversation messages from history
function buildMessages(historial, mensaje) {
    const messages = [];
    if (Array.isArray(historial)) {
        historial.slice(-20).forEach(m => {
            messages.push({
                role: m.role === 'assistant' ? 'assistant' : 'user',
                content: String(m.content || '')
            });
        });
    }
    messages.push({ role: 'user', content: String(mensaje).trim() });
    return messages;
}

// ---- KIMI (Moonshot) provider ----
async function chatWithKimi(apiKey, systemPrompt, messages) {
    const body = {
        model: 'kimi-k2',
        max_tokens: 1024,
        messages: [
            { role: 'system', content: systemPrompt },
            ...messages
        ]
    };

    const resp = await fetch('https://api.moonshot.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${apiKey}`
        },
        body: JSON.stringify(body)
    });

    const data = await resp.json();
    if (!resp.ok) {
        throw new Error(data?.error?.message || data?.message || `Kimi API error ${resp.status}`);
    }

    return data.choices?.[0]?.message?.content || '';
}

// ---- Anthropic (Claude) provider ----
async function chatWithClaude(apiKey, systemPrompt, messages) {
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey });

    const response = await client.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 1024,
        system: systemPrompt,
        messages
    });

    return response.content
        .filter(b => b.type === 'text')
        .map(b => b.text)
        .join('\n');
}

// POST /api/chat - Send message to AI
// Priority: KIMI_API_KEY > ANTHROPIC_API_KEY
router.post('/', async (req, res) => {
    const kimiKey = process.env.KIMI_API_KEY;
    const anthropicKey = process.env.ANTHROPIC_API_KEY;

    if (!kimiKey && !anthropicKey) {
        return res.status(500).json({ error: 'Configura KIMI_API_KEY o ANTHROPIC_API_KEY en .env' });
    }

    const { mensaje, historial } = req.body;
    if (!mensaje || !String(mensaje).trim()) {
        return res.status(400).json({ error: 'Mensaje requerido' });
    }

    try {
        const contexto = await obtenerContextoNegocio();
        const systemPrompt = buildSystemPrompt(contexto);
        const messages = buildMessages(historial, mensaje);

        let respuesta;
        if (kimiKey) {
            respuesta = await chatWithKimi(kimiKey, systemPrompt, messages);
        } else {
            respuesta = await chatWithClaude(anthropicKey, systemPrompt, messages);
        }

        res.json({ respuesta, provider: kimiKey ? 'kimi' : 'claude' });
    } catch (error) {
        console.error('Error en chat IA:', error);
        const msg = error?.message || 'Error al comunicarse con la IA';
        res.status(500).json({ error: msg });
    }
});

async function obtenerContextoNegocio() {
    const partes = [];

    try {
        // Products summary
        const [productos] = await db.query('SELECT COUNT(*) as total FROM productos');
        const [topProductos] = await db.query('SELECT nombre, precio_unidad FROM productos ORDER BY nombre LIMIT 15');
        partes.push(`PRODUCTOS: ${productos[0].total} en total.`);
        if (topProductos.length > 0) {
            partes.push('Lista de productos: ' + topProductos.map(p => `${p.nombre} (S/${p.precio_unidad})`).join(', '));
        }
    } catch (e) { /* tabla no existe */ }

    try {
        // Clients summary
        const [clientes] = await db.query('SELECT COUNT(*) as total FROM clientes');
        partes.push(`CLIENTES: ${clientes[0].total} registrados.`);
    } catch (e) {}

    try {
        // Sales summary (last 30 days)
        const [ventas] = await db.query(`
            SELECT COUNT(*) as total, COALESCE(SUM(total), 0) as monto
            FROM facturas
            WHERE fecha >= DATE_SUB(NOW(), INTERVAL 30 DAY)
        `);
        partes.push(`VENTAS (ultimos 30 dias): ${ventas[0].total} facturas, monto total S/${Number(ventas[0].monto).toFixed(2)}`);
    } catch (e) {}

    try {
        // Sales by payment method
        const [metodos] = await db.query(`
            SELECT forma_pago, COUNT(*) as cantidad, SUM(total) as monto
            FROM facturas
            WHERE fecha >= DATE_SUB(NOW(), INTERVAL 30 DAY)
            GROUP BY forma_pago
        `);
        if (metodos.length > 0) {
            partes.push('Ventas por metodo: ' + metodos.map(m => `${m.forma_pago}: ${m.cantidad} ventas (S/${Number(m.monto).toFixed(2)})`).join(', '));
        }
    } catch (e) {}

    try {
        // Tables
        const [mesas] = await db.query('SELECT COUNT(*) as total FROM mesas');
        const [ocupadas] = await db.query("SELECT COUNT(*) as total FROM mesas WHERE estado = 'ocupada'");
        partes.push(`MESAS: ${mesas[0].total} total, ${ocupadas[0].total} ocupadas ahora.`);
    } catch (e) {}

    try {
        // Today's sales
        const [hoy] = await db.query(`
            SELECT COUNT(*) as total, COALESCE(SUM(total), 0) as monto
            FROM facturas
            WHERE DATE(fecha) = CURDATE()
        `);
        partes.push(`VENTAS HOY: ${hoy[0].total} facturas, S/${Number(hoy[0].monto).toFixed(2)}`);
    } catch (e) {}

    try {
        // Top selling products
        const [topVentas] = await db.query(`
            SELECT p.nombre, SUM(df.cantidad) as total_vendido, SUM(df.subtotal) as total_monto
            FROM detalle_facturas df
            JOIN productos p ON p.id = df.producto_id
            WHERE df.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
            GROUP BY df.producto_id
            ORDER BY total_vendido DESC
            LIMIT 10
        `);
        if (topVentas.length > 0) {
            partes.push('PRODUCTOS MAS VENDIDOS (30 dias): ' + topVentas.map(p => `${p.nombre}: ${p.total_vendido} unidades (S/${Number(p.total_monto).toFixed(2)})`).join(', '));
        }
    } catch (e) {}

    try {
        // Users
        const [usuarios] = await db.query('SELECT usuario, rol FROM usuarios WHERE activo = 1');
        if (usuarios.length > 0) {
            partes.push('USUARIOS ACTIVOS: ' + usuarios.map(u => `${u.usuario} (${u.rol})`).join(', '));
        }
    } catch (e) {}

    try {
        // Config
        const [config] = await db.query('SELECT nombre_negocio, direccion, telefono FROM configuracion_impresion LIMIT 1');
        if (config.length > 0 && config[0].nombre_negocio) {
            partes.push(`NEGOCIO: ${config[0].nombre_negocio}, Dir: ${config[0].direccion || 'N/A'}, Tel: ${config[0].telefono || 'N/A'}`);
        }
    } catch (e) {}

    return partes.join('\n') || 'No hay datos del negocio disponibles aun.';
}

module.exports = router;
