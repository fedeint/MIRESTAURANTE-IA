// services/dallia-actions/enviar-pedido-proveedor.js
// First DallIA Action: detects ingredients below minimum stock, drafts a
// per-proveedor WhatsApp message, and (on approval) sends it and creates
// a draft orden_compra.

'use strict';

const NAME = 'enviar_pedido_proveedor';

/**
 * Detect ingredients below minimum grouped by proveedor.
 */
async function detect(tenantId, { db }) {
    const [rows] = await db.query(`
        SELECT ai.id as ingrediente_id, ai.nombre as ingrediente_nombre, ai.unidad_medida,
               ai.stock_actual, ai.stock_minimo, ai.proveedor_id,
               p.nombre as proveedor_nombre, p.telefono as proveedor_telefono,
               p.contacto_nombre as proveedor_contacto
        FROM almacen_ingredientes ai
        LEFT JOIN proveedores p ON p.id = ai.proveedor_id AND p.deleted_at IS NULL
        WHERE ai.tenant_id=? AND ai.activo=true AND ai.stock_actual <= ai.stock_minimo
        ORDER BY ai.proveedor_id NULLS LAST, ai.nombre
    `, [tenantId]);

    const byProveedor = new Map();
    const sinProveedor = [];

    for (const row of rows) {
        const item = {
            ingrediente_id: row.ingrediente_id,
            nombre: row.ingrediente_nombre,
            unidad: row.unidad_medida,
            stock_actual: Number(row.stock_actual) || 0,
            stock_minimo: Number(row.stock_minimo) || 0,
            falta: Math.max(0, Number(row.stock_minimo) - Number(row.stock_actual))
        };

        if (!row.proveedor_id || !row.proveedor_telefono) {
            sinProveedor.push({
                ...item,
                razon: !row.proveedor_id ? 'sin proveedor asignado' : 'proveedor sin telefono'
            });
            continue;
        }

        if (!byProveedor.has(row.proveedor_id)) {
            byProveedor.set(row.proveedor_id, {
                proveedor_id: row.proveedor_id,
                proveedor_nombre: row.proveedor_nombre,
                proveedor_telefono: row.proveedor_telefono,
                proveedor_contacto: row.proveedor_contacto,
                items: []
            });
        }
        byProveedor.get(row.proveedor_id).items.push(item);
    }

    const proveedores = Array.from(byProveedor.values());
    const shouldPropose = proveedores.length > 0 || sinProveedor.length > 0;

    let message;
    if (!shouldPropose) {
        message = 'Todo tu stock está bien — no hay insumos bajo mínimo ahora mismo.';
    }

    return { proveedores, sinProveedor, shouldPropose, message };
}

/**
 * Get the tenant's restaurant name for the message body.
 */
async function getRestauranteName(tenantId, db) {
    try {
        const [rows] = await db.query('SELECT nombre FROM tenants WHERE id=?', [tenantId]);
        return rows?.[0]?.nombre || 'el restaurante';
    } catch {
        return 'el restaurante';
    }
}

/**
 * Draft a WhatsApp message per proveedor using the LLM, with a template fallback.
 */
async function draft(tenantId, detection, { db, llm }) {
    const restauranteName = await getRestauranteName(tenantId, db);
    const messages = [];

    for (const prov of detection.proveedores) {
        const itemsList = prov.items.map(i =>
            `- ${i.nombre}: faltan ${i.falta} ${i.unidad} (actual: ${i.stock_actual})`
        ).join('\n');

        let texto;
        try {
            const systemPrompt = `Eres DalIA, asistente de un restaurante peruano. Escribes mensajes WhatsApp cortos, amables y profesionales a proveedores. No uses emojis excesivos. Termina con "Gracias!".`;
            const userMessage = `Redacta un mensaje WhatsApp al proveedor "${prov.proveedor_contacto || prov.proveedor_nombre}" de parte del restaurante "${restauranteName}" pidiendo estos insumos:\n\n${itemsList}\n\nSolo el mensaje, sin introducciones ni explicaciones.`;
            texto = await llm.chatWithLLM(systemPrompt, userMessage, { maxTokens: 400 });
            texto = texto.trim();
        } catch (err) {
            texto = `Hola ${prov.proveedor_contacto || prov.proveedor_nombre}, soy ${restauranteName}.\n\nNecesitamos los siguientes insumos:\n${itemsList}\n\nPor favor confirma disponibilidad y precio.\n\nGracias!`;
        }

        messages.push({
            proveedor_id: prov.proveedor_id,
            proveedor_nombre: prov.proveedor_nombre,
            telefono: prov.proveedor_telefono,
            texto,
            items: prov.items
        });
    }

    return { messages, sinProveedor: detection.sinProveedor };
}

/**
 * Execute: send WhatsApp messages and create orden_compra records.
 * approvedDraft may be a JSON string (from DB) or an object.
 */
async function execute(tenantId, userId, approvedDraft, { db, whatsapp }) {
    // Handle case where draft_data comes back as a JSON string from the DB
    const draftData = typeof approvedDraft === 'string' ? JSON.parse(approvedDraft) : approvedDraft;
    const sent = [];
    const failed = [];

    for (const msg of draftData.messages) {
        let whatsappResult;
        try {
            whatsappResult = await whatsapp.sendText(msg.telefono, msg.texto);
        } catch (err) {
            whatsappResult = false;
        }

        if (!whatsappResult) {
            failed.push({
                proveedor_id: msg.proveedor_id,
                proveedor_nombre: msg.proveedor_nombre,
                razon: 'WhatsApp sendText returned false (ventana 24h cerrada, telefono invalido, o WhatsApp no configurado)'
            });
            continue;
        }

        try {
            const fechaOrden = new Date().toISOString().split('T')[0];
            const [ocRows] = await db.query(
                `INSERT INTO ordenes_compra (tenant_id, proveedor_id, fecha_orden, estado, subtotal, total, usuario_id, notas)
                 VALUES (?, ?, ?, 'borrador', 0, 0, ?, ?) RETURNING id`,
                [tenantId, msg.proveedor_id, fechaOrden, userId, 'Creada automaticamente por DallIA Actions (enviar_pedido_proveedor)']
            );
            const ordenId = ocRows?.[0]?.id;

            for (const item of msg.items) {
                await db.query(
                    `INSERT INTO orden_compra_items (orden_compra_id, ingrediente_id, cantidad_solicitada, precio_unitario, subtotal)
                     VALUES (?, ?, ?, 0, 0)`,
                    [ordenId, item.ingrediente_id, item.falta]
                );
            }

            sent.push({
                proveedor_id: msg.proveedor_id,
                proveedor_nombre: msg.proveedor_nombre,
                telefono: msg.telefono,
                orden_compra_id: ordenId,
                items_count: msg.items.length
            });
        } catch (err) {
            failed.push({
                proveedor_id: msg.proveedor_id,
                proveedor_nombre: msg.proveedor_nombre,
                razon: 'WhatsApp enviado pero fallo al crear orden_compra: ' + err.message
            });
        }
    }

    return { sent, failed };
}

module.exports = { name: NAME, description: 'Detecta insumos bajo minimo y propone enviar pedido WhatsApp al proveedor', detect, draft, execute };
