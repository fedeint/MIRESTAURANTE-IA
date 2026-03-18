const db = require('../db');

// Calcular IGV (18% Peru)
function calcularIGV(precioConIgv, igvPct = 18) {
    const factor = 1 + (igvPct / 100);
    const subtotal = Number(precioConIgv) / factor;
    const igv = Number(precioConIgv) - subtotal;
    return {
        subtotal: Math.round(subtotal * 100) / 100,
        igv: Math.round(igv * 100) / 100,
        total: Number(precioConIgv)
    };
}

// Validar RUC peruano (modulo 11)
function validarRUC(ruc) {
    if (!ruc || ruc.length !== 11) return false;
    if (!/^\d{11}$/.test(ruc)) return false;
    const factores = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
    let suma = 0;
    for (let i = 0; i < 10; i++) {
        suma += parseInt(ruc[i]) * factores[i];
    }
    const residuo = 11 - (suma % 11);
    const digito = residuo === 10 ? 0 : residuo === 11 ? 1 : residuo;
    return digito === parseInt(ruc[10]);
}

// Validar DNI peruano
function validarDNI(dni) {
    return dni && /^\d{8}$/.test(dni);
}

// Obtener siguiente correlativo
async function siguienteCorrelativo(tenantId, tipo) {
    const campo = tipo === 'factura' ? 'correlativo_factura'
        : tipo === 'nota_credito' ? 'correlativo_nota_credito'
        : 'correlativo_boleta';
    const campoSerie = tipo === 'factura' ? 'serie_factura'
        : tipo === 'nota_credito' ? 'serie_nota_credito'
        : 'serie_boleta';

    // Atomico: incrementar y retornar
    await db.query(`UPDATE config_sunat SET ${campo} = ${campo} + 1 WHERE tenant_id = ?`, [tenantId]);
    const [[config]] = await db.query(`SELECT ${campo} as correlativo, ${campoSerie} as serie FROM config_sunat WHERE tenant_id = ?`, [tenantId]);
    return { serie: config.serie, correlativo: config.correlativo };
}

// Emitir comprobante (preparar datos para OSE)
async function emitirComprobante(tenantId, facturaId, tipoDoc) {
    const [[config]] = await db.query('SELECT * FROM config_sunat WHERE tenant_id = ?', [tenantId]);
    if (!config) throw new Error('Configuracion SUNAT no encontrada');

    const [[factura]] = await db.query(`
        SELECT f.*, c.nombre as cliente_nombre, c.tipo_documento, c.numero_documento, c.razon_social, c.direccion, c.email
        FROM facturas f
        LEFT JOIN clientes c ON c.id = f.cliente_id
        WHERE f.id = ?
    `, [facturaId]);
    if (!factura) throw new Error('Factura no encontrada');

    // Determinar tipo de comprobante
    const tipo = tipoDoc || (factura.tipo_documento === 'RUC' ? 'factura' : 'boleta');

    // Siguiente correlativo
    const { serie, correlativo } = await siguienteCorrelativo(tenantId, tipo);

    // Calcular IGV
    const igvPct = Number(config.igv_porcentaje) || 18;
    const { subtotal, igv, total } = calcularIGV(Number(factura.total), igvPct);

    // Tipo documento cliente
    const clienteTipoDoc = factura.tipo_documento === 'RUC' ? '6'
        : factura.tipo_documento === 'DNI' ? '1'
        : factura.tipo_documento === 'CE' ? '4'
        : '0';

    // Guardar en facturas
    await db.query(
        `UPDATE facturas SET subtotal_sin_igv=?, igv=?, total_con_igv=?, tipo_comprobante=?, serie=?, correlativo=?, sunat_estado='pendiente' WHERE id=?`,
        [subtotal, igv, total, tipo, serie, correlativo, facturaId]
    );

    // Crear registro comprobante
    const [result] = await db.query(
        `INSERT INTO comprobantes_electronicos (tenant_id, factura_id, tipo, serie, correlativo, fecha_emision, cliente_tipo_doc, cliente_num_doc, cliente_razon_social, subtotal_sin_igv, igv, total_con_igv, estado)
         VALUES (?,?,?,?,?,NOW(),?,?,?,?,?,?,'pendiente') RETURNING id`,
        [tenantId, facturaId, tipo, serie, correlativo, clienteTipoDoc, factura.numero_documento || '00000000', factura.razon_social || factura.cliente_nombre || 'VARIOS', subtotal, igv, total]
    );

    const comprobanteId = result.insertId;

    // Enviar a OSE (Nubefact u otro)
    if (config.ose_token && config.ose_ruta) {
        try {
            const resp = await enviarAOSE(config, {
                tipo, serie, correlativo,
                cliente_tipo_doc: clienteTipoDoc,
                cliente_num_doc: factura.numero_documento || '00000000',
                cliente_razon_social: factura.razon_social || factura.cliente_nombre || 'VARIOS',
                subtotal, igv, total,
                ruc_emisor: config.ruc_emisor,
                razon_social_emisor: config.razon_social_emisor,
                items: [] // TODO: obtener detalle de factura
            });

            await db.query(
                `UPDATE comprobantes_electronicos SET estado='aceptado', codigo_sunat=?, mensaje_sunat=?, hash_cpe=?, enviado_sunat_at=NOW() WHERE id=?`,
                [resp.codigo || null, resp.mensaje || null, resp.hash || null, comprobanteId]
            );
            await db.query(`UPDATE facturas SET sunat_estado='aceptada' WHERE id=?`, [facturaId]);
        } catch (oseErr) {
            await db.query(
                `UPDATE comprobantes_electronicos SET estado='rechazado', mensaje_sunat=? WHERE id=?`,
                [oseErr.message, comprobanteId]
            );
        }
    }

    return { comprobante_id: comprobanteId, serie, correlativo, tipo, subtotal, igv, total };
}

// Enviar a OSE (Nubefact)
async function enviarAOSE(config, datos) {
    if (config.proveedor_ose === 'nubefact') {
        const url = config.produccion
            ? 'https://api.nubefact.com/api/v1/0e9d0c64-97f2-4fb7-b94e-364e95025db3'
            : (config.ose_ruta || 'https://api.nubefact.com/api/v1/0e9d0c64-97f2-4fb7-b94e-364e95025db3');

        const body = {
            operacion: 'generar_comprobante',
            tipo_de_comprobante: datos.tipo === 'factura' ? 1 : datos.tipo === 'boleta' ? 2 : 3,
            serie: datos.serie,
            numero: datos.correlativo,
            sunat_transaction: 1,
            cliente_tipo_de_documento: datos.cliente_tipo_doc,
            cliente_numero_de_documento: datos.cliente_num_doc,
            cliente_denominacion: datos.cliente_razon_social,
            cliente_direccion: '',
            moneda: 1, // PEN
            total_gravada: datos.subtotal,
            total_igv: datos.igv,
            total: datos.total,
            items: (datos.items || []).map((item, i) => ({
                unidad_de_medida: 'NIU',
                codigo: String(i + 1),
                descripcion: item.nombre || 'Producto',
                cantidad: item.cantidad || 1,
                valor_unitario: item.precio_sin_igv || 0,
                precio_unitario: item.precio || 0,
                subtotal: item.subtotal_sin_igv || 0,
                tipo_de_igv: 1,
                igv: item.igv || 0,
                total: item.total || 0,
            }))
        };

        const resp = await fetch(url, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${config.ose_token}` },
            body: JSON.stringify(body)
        });

        const data = await resp.json();
        if (!resp.ok || data.errors) {
            throw new Error(data.errors || data.message || 'Error OSE Nubefact');
        }
        return { codigo: data.codigo || '0', mensaje: data.mensaje || 'OK', hash: data.cadena_para_codigo_qr || '' };
    }

    throw new Error(`Proveedor OSE "${config.proveedor_ose}" no implementado`);
}

module.exports = { calcularIGV, validarRUC, validarDNI, siguienteCorrelativo, emitirComprobante };
