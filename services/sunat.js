const db = require('../db');

// Calcular IGV (18% Peru) a partir de un precio que ya incluye IGV
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

// Calcular IGV de un precio unitario (con IGV) y retornar desglose
function calcularIGVItem(precioConIgv, cantidad, igvPct = 18) {
    const factor = 1 + (igvPct / 100);
    const valorUnitario = Math.round((Number(precioConIgv) / factor) * 100) / 100;
    const subtotalSinIgv = Math.round(valorUnitario * Number(cantidad) * 100) / 100;
    const totalConIgv = Math.round(Number(precioConIgv) * Number(cantidad) * 100) / 100;
    const igvAmount = Math.round((totalConIgv - subtotalSinIgv) * 100) / 100;
    return {
        valor_unitario: valorUnitario,
        subtotal_sin_igv: subtotalSinIgv,
        igv_amount: igvAmount,
        total: totalConIgv
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

// Formatear fecha a DD-MM-YYYY que exige NubeFact
function formatFechaNubefact(date) {
    const d = date instanceof Date ? date : new Date(date);
    const dd = String(d.getDate()).padStart(2, '0');
    const mm = String(d.getMonth() + 1).padStart(2, '0');
    const yyyy = d.getFullYear();
    return `${dd}-${mm}-${yyyy}`;
}

// Obtener siguiente correlativo (operacion atomica)
async function siguienteCorrelativo(tenantId, tipo) {
    const campo = tipo === 'factura' ? 'correlativo_factura'
        : tipo === 'nota_credito' ? 'correlativo_nota_credito'
        : 'correlativo_boleta';
    const campoSerie = tipo === 'factura' ? 'serie_factura'
        : tipo === 'nota_credito' ? 'serie_nota_credito'
        : 'serie_boleta';

    await db.query(
        `UPDATE config_sunat SET ${campo} = ${campo} + 1 WHERE tenant_id = ?`,
        [tenantId]
    );
    const [[config]] = await db.query(
        `SELECT ${campo} as correlativo, ${campoSerie} as serie FROM config_sunat WHERE tenant_id = ?`,
        [tenantId]
    );
    return { serie: config.serie, correlativo: config.correlativo };
}

// Obtener items del detalle de factura y mapearlos al formato NubeFact
async function obtenerItemsFactura(facturaId, igvPct) {
    const [detalles] = await db.query(`
        SELECT
            df.cantidad,
            df.precio_unitario,
            df.subtotal,
            p.codigo   AS producto_codigo,
            p.nombre   AS producto_nombre
        FROM detalle_factura df
        LEFT JOIN productos p ON p.id = df.producto_id
        WHERE df.factura_id = ?
        ORDER BY df.id ASC
    `, [facturaId]);

    if (!detalles || detalles.length === 0) {
        return { items: [], total_gravada: 0, total_igv: 0, total: 0 };
    }

    let totalGravada = 0;
    let totalIgv = 0;
    let totalGeneral = 0;

    const items = detalles.map((det, idx) => {
        const { valor_unitario, subtotal_sin_igv, igv_amount, total } =
            calcularIGVItem(det.precio_unitario, det.cantidad, igvPct);

        totalGravada += subtotal_sin_igv;
        totalIgv += igv_amount;
        totalGeneral += total;

        return {
            unidad_de_medida: 'NIU',
            codigo: det.producto_codigo || String(idx + 1).padStart(3, '0'),
            descripcion: det.producto_nombre || 'Producto',
            cantidad: Number(det.cantidad),
            valor_unitario: valor_unitario,
            precio_unitario: Number(det.precio_unitario),
            subtotal: subtotal_sin_igv,
            tipo_de_igv: 1,             // Gravado - Operacion Onerosa
            igv: igv_amount,
            total: total,
            anticipo_regularizacion: false
        };
    });

    // Redondear totales acumulados a 2 decimales
    totalGravada = Math.round(totalGravada * 100) / 100;
    totalIgv = Math.round(totalIgv * 100) / 100;
    totalGeneral = Math.round(totalGeneral * 100) / 100;

    return { items, total_gravada: totalGravada, total_igv: totalIgv, total: totalGeneral };
}

// Emitir comprobante: prepara datos, persiste y envia al OSE
async function emitirComprobante(tenantId, facturaId, tipoDoc) {
    const [[config]] = await db.query(
        'SELECT * FROM config_sunat WHERE tenant_id = ?',
        [tenantId]
    );
    if (!config) throw new Error('Configuracion SUNAT no encontrada');

    const [[factura]] = await db.query(`
        SELECT f.*, c.nombre AS cliente_nombre, c.tipo_documento, c.numero_documento,
               c.razon_social, c.direccion AS cliente_direccion, c.email
        FROM facturas f
        LEFT JOIN clientes c ON c.id = f.cliente_id
        WHERE f.id = ?
    `, [facturaId]);
    if (!factura) throw new Error('Factura no encontrada');

    // Determinar tipo de comprobante
    const tipo = tipoDoc || (factura.tipo_documento === 'RUC' ? 'factura' : 'boleta');

    // Siguiente correlativo
    const { serie, correlativo } = await siguienteCorrelativo(tenantId, tipo);

    // IGV configurado
    const igvPct = Number(config.igv_porcentaje) || 18;

    // Obtener items del detalle de la factura con calculo de IGV por linea
    const { items, total_gravada, total_igv, total } =
        await obtenerItemsFactura(facturaId, igvPct);

    // Tipo documento cliente para SUNAT/NubeFact (entero)
    const clienteTipoDocNum = factura.tipo_documento === 'RUC' ? 6
        : factura.tipo_documento === 'DNI' ? 1
        : factura.tipo_documento === 'CE'  ? 4
        : 0;

    // Nombre/razon social del cliente
    const clienteDenominacion = factura.razon_social || factura.cliente_nombre || 'VARIOS';
    const clienteNumDoc = factura.numero_documento || '00000000';

    const fechaEmision = new Date();
    const fechaEmisionStr = formatFechaNubefact(fechaEmision);

    // Persistir en facturas (columnas SUNAT)
    await db.query(
        `UPDATE facturas
         SET subtotal_sin_igv=?, igv=?, total_con_igv=?, tipo_comprobante=?,
             serie=?, correlativo=?, sunat_estado='pendiente'
         WHERE id=?`,
        [total_gravada, total_igv, total, tipo, serie, correlativo, facturaId]
    );

    // Crear registro en comprobantes_electronicos
    const [result] = await db.query(
        `INSERT INTO comprobantes_electronicos
         (tenant_id, factura_id, tipo, serie, correlativo, fecha_emision,
          cliente_tipo_doc, cliente_num_doc, cliente_razon_social,
          subtotal_sin_igv, igv, total_con_igv, estado)
         VALUES (?,?,?,?,?,NOW(),?,?,?,?,?,?,'pendiente') RETURNING id`,
        [
            tenantId, facturaId, tipo, serie, correlativo,
            String(clienteTipoDocNum), clienteNumDoc, clienteDenominacion,
            total_gravada, total_igv, total
        ]
    );

    const comprobanteId = result.insertId;

    // Enviar al OSE si hay token configurado
    if (config.ose_token && config.ose_ruta) {
        try {
            const resp = await enviarAOSE(config, {
                tipo,
                serie,
                correlativo,
                cliente_tipo_doc: clienteTipoDocNum,
                cliente_num_doc: clienteNumDoc,
                cliente_razon_social: clienteDenominacion,
                cliente_direccion: factura.cliente_direccion || '',
                fecha_emision: fechaEmisionStr,
                total_gravada,
                total_igv,
                total,
                items
            });

            await db.query(
                `UPDATE comprobantes_electronicos
                 SET estado='aceptado', codigo_sunat=?, mensaje_sunat=?,
                     hash_cpe=?, pdf_url=?, enviado_sunat_at=NOW()
                 WHERE id=?`,
                [
                    resp.codigo || null,
                    resp.mensaje || null,
                    resp.hash || null,
                    resp.pdf_url || null,
                    comprobanteId
                ]
            );
            await db.query(
                `UPDATE facturas SET sunat_estado='aceptada' WHERE id=?`,
                [facturaId]
            );
        } catch (oseErr) {
            await db.query(
                `UPDATE comprobantes_electronicos
                 SET estado='rechazado', mensaje_sunat=?
                 WHERE id=?`,
                [oseErr.message, comprobanteId]
            );
            await db.query(
                `UPDATE facturas SET sunat_estado='rechazada' WHERE id=?`,
                [facturaId]
            );
        }
    }

    return {
        comprobante_id: comprobanteId,
        serie,
        correlativo,
        tipo,
        total_gravada,
        total_igv,
        total,
        items_count: items.length
    };
}

// Enviar al OSE NubeFact
async function enviarAOSE(config, datos) {
    if (config.proveedor_ose === 'nubefact') {
        // En produccion usar URL de produccion; en pruebas usar la URL configurada en ose_ruta
        const url = config.produccion
            ? 'https://api.nubefact.com/api/v1/0e9d0c64-97f2-4fb7-b94e-364e95025db3'
            : (config.ose_ruta || 'https://api.nubefact.com/api/v1/0e9d0c64-97f2-4fb7-b94e-364e95025db3');

        // tipo_de_comprobante: 1=Factura, 2=Boleta, 3=Nota Credito, 4=Nota Debito
        const tipoComprobante = datos.tipo === 'factura' ? 1
            : datos.tipo === 'boleta' ? 2
            : datos.tipo === 'nota_credito' ? 3
            : 2;

        const body = {
            operacion: 'generar_comprobante',
            tipo_de_comprobante: tipoComprobante,
            serie: datos.serie,
            numero: datos.correlativo,
            sunat_transaction: 1,
            cliente_tipo_de_documento: datos.cliente_tipo_doc,    // entero: 1=DNI, 6=RUC
            cliente_numero_de_documento: datos.cliente_num_doc,
            cliente_denominacion: datos.cliente_razon_social,
            cliente_direccion: datos.cliente_direccion || '',
            fecha_de_emision: datos.fecha_emision,                 // DD-MM-YYYY
            moneda: 1,                                             // 1=PEN (Soles)
            total_gravada: datos.total_gravada,
            total_igv: datos.total_igv,
            total: datos.total,
            items: datos.items.map(item => ({
                unidad_de_medida: item.unidad_de_medida || 'NIU',
                codigo: item.codigo,
                descripcion: item.descripcion,
                cantidad: item.cantidad,
                valor_unitario: item.valor_unitario,               // precio sin IGV
                precio_unitario: item.precio_unitario,             // precio con IGV
                subtotal: item.subtotal,                           // subtotal sin IGV
                tipo_de_igv: item.tipo_de_igv,                    // 1=Gravado Op. Onerosa
                igv: item.igv,
                total: item.total,
                anticipo_regularizacion: item.anticipo_regularizacion || false
            }))
        };

        let rawData;
        try {
            const resp = await fetch(url, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${config.ose_token}`
                },
                body: JSON.stringify(body)
            });

            rawData = await resp.json();

            if (!resp.ok || rawData.errors) {
                const errMsg = (typeof rawData.errors === 'string')
                    ? rawData.errors
                    : (rawData.message || JSON.stringify(rawData.errors) || 'Error OSE NubeFact');
                throw new Error(errMsg);
            }
        } catch (fetchErr) {
            // Si el error no viene de la respuesta HTTP sino de red/parse, relanzar
            if (!rawData) throw fetchErr;
            throw fetchErr;
        }

        return {
            codigo: rawData.codigo || rawData.aceptada_por_sunat ? '0' : null,
            mensaje: rawData.mensaje || rawData.sunat_description || 'OK',
            hash: rawData.cadena_para_codigo_qr || rawData.hash_cpe || '',
            pdf_url: rawData.enlace_del_pdf || rawData.pdf_url || null
        };
    }

    throw new Error(`Proveedor OSE "${config.proveedor_ose}" no implementado`);
}

module.exports = {
    calcularIGV,
    validarRUC,
    validarDNI,
    siguienteCorrelativo,
    emitirComprobante,
    obtenerItemsFactura,
    formatFechaNubefact
};
