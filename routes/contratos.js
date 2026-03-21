const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { sendSigningLink } = require('../lib/mailer');

// GET /contratos - Pagina del generador de contratos
router.get('/', (req, res) => {
    res.render('contratos');
});

// GET /api/contratos/lista - Listar contratos
router.get('/lista', async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT id, nro_contrato, nombre_cliente, razon_social, dni, ruc, email, estado,
                    token, firmado_at, email_enviado_at, created_at
             FROM contratos WHERE tenant_id = ? ORDER BY created_at DESC`,
            [req.tenantId || 1]
        );
        res.json(rows);
    } catch (err) {
        console.error('Lista contratos error:', err.message);
        res.status(500).json({ error: 'Error al obtener contratos' });
    }
});

// POST /api/contratos/generar - Generar PDF del contrato
router.post('/generar', async (req, res) => {
    try {
    const { nombre_cliente, ruc, dni, razon_social, direccion, telefono, email, nombre_establecimiento, nombre_representante, cargo_representante, dni_representante } = req.body;

    if (!nombre_cliente || !dni) {
        return res.status(400).json({ error: 'Nombre y DNI son obligatorios' });
    }

    const hoy = new Date();
    const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    const fechaTexto = `${hoy.getDate()} de ${meses[hoy.getMonth()]} de ${hoy.getFullYear()}`;

    // Generate nro_contrato from DB sequence
    const [[seqRow]] = await db.query("SELECT nextval('contratos_nro_seq') as seq");
    const seqVal = seqRow.seq;
    const nroContrato = `CTR-${hoy.getFullYear()}${String(hoy.getMonth()+1).padStart(2,'0')}${String(hoy.getDate()).padStart(2,'0')}-${String(seqVal).padStart(4,'0')}`;

    const doc = new PDFDocument({ size: 'A4', margins: { top: 50, bottom: 50, left: 55, right: 55 }, bufferPages: true });

    // Collect PDF into buffer instead of piping to response
    const chunks = [];
    doc.on('data', c => chunks.push(c));
    doc.on('error', (err) => {
        console.error('PDFKit error:', err.message, err.stack);
        if (!res.headersSent) res.status(500).json({ error: 'Error generando PDF: ' + err.message });
    });
    doc.on('end', async () => {
        try {
            const pdfBuffer = Buffer.concat(chunks);
            const pdfHash = crypto.createHash('sha256').update(pdfBuffer).digest('hex');

            const [[contrato]] = await db.query(
                `INSERT INTO contratos (tenant_id, nro_contrato, nombre_cliente, razon_social, dni, ruc, email, telefono, direccion, nombre_establecimiento, nombre_representante, cargo_representante, dni_representante, pdf_original, pdf_hash, created_by)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
                 RETURNING id, token, nro_contrato`,
                [req.tenantId||1, nroContrato, nombre_cliente, razon_social||null, dni, ruc||null, email||null, telefono||null, direccion||null, nombre_establecimiento||null, nombre_representante||null, cargo_representante||null, dni_representante||null, pdfBuffer, pdfHash, req.session?.user?.id||null]
            );
            const baseUrl = `${req.protocol}://${req.get('host')}`;
            const link = `${baseUrl}/firmar/${contrato.token}`;

            let emailEnviado = false;
            if (email) {
                emailEnviado = await sendSigningLink({ to: email, nombreCliente: nombre_cliente, nroContrato: contrato.nro_contrato, link });
                if (emailEnviado) await db.query('UPDATE contratos SET email_enviado_at = NOW() WHERE id = ?', [contrato.id]);
            }
            res.json({ id: contrato.id, token: contrato.token, nro_contrato: contrato.nro_contrato, link, email_enviado: emailEnviado });
        } catch (err) {
            console.error('Error guardando contrato:', err.message, err.stack);
            if (!res.headersSent) res.status(500).json({ error: 'Error al guardar contrato: ' + err.message });
        }
    });

    const pw = doc.page.width - 110;
    const ml = 55;

    // --- Helpers ---
    function heading(text, size = 16) {
        doc.fontSize(size).font('Helvetica-Bold').fillColor('#1a1a2e').text(text, { align: 'center' });
    }
    function sectionTitle(text) {
        checkPage(40);
        doc.moveDown(0.6);
        doc.fontSize(11).font('Helvetica-Bold').fillColor('#FF6B35').text(text);
        doc.fillColor('#000');
        doc.moveDown(0.3);
    }
    function para(text) {
        doc.fontSize(9.5).font('Helvetica').fillColor('#222').text(text, { align: 'justify', lineGap: 1.5 });
    }
    function bold(text) {
        doc.fontSize(9.5).font('Helvetica-Bold').fillColor('#222').text(text);
    }
    function item(text) {
        doc.fontSize(9.5).font('Helvetica').fillColor('#222').text(`  •  ${text}`, { lineGap: 1 });
    }
    function checkPage(need = 60) {
        if (doc.y > 740 - need) doc.addPage();
    }
    function separator() {
        doc.moveDown(0.3);
        doc.moveTo(ml, doc.y).lineTo(ml + pw, doc.y).strokeColor('#e0e0e0').lineWidth(0.5).stroke();
        doc.moveDown(0.3);
    }

    // ===================================================
    // PORTADA
    // ===================================================
    doc.moveDown(4);
    doc.fontSize(10).font('Helvetica').fillColor('#666').text('dignita.tech', { align: 'center' });
    doc.moveDown(0.5);
    heading('CONTRATO DE LICENCIA DE SOFTWARE', 18);
    heading('Y SERVICIOS TECNOLOGICOS', 18);
    doc.moveDown(0.8);
    doc.moveTo(ml + 100, doc.y).lineTo(ml + pw - 100, doc.y).strokeColor('#FF6B35').lineWidth(2).stroke();
    doc.moveDown(0.8);
    heading('PLAN ENTERPRISE — MiRestconIA', 14);
    doc.fontSize(11).font('Helvetica').fillColor('#444').text('Sistema de Gestion para Restaurantes', { align: 'center' });
    doc.moveDown(3);

    doc.fontSize(10).font('Helvetica').fillColor('#333');
    doc.text(`Contrato N.° ${nroContrato}`, { align: 'center' });
    doc.text(`Fecha de suscripcion: Lima, ${fechaTexto}`, { align: 'center' });
    doc.moveDown(4);

    doc.fontSize(9).fillColor('#888').text('Documento generado por MiRestconIA — dignita.tech', { align: 'center' });

    // ===================================================
    // PARTES CONTRATANTES
    // ===================================================
    doc.addPage();
    sectionTitle('PARTES CONTRATANTES');

    bold('EL LICENCIANTE:');
    para('DIGNITA TECH S.A.C. (en adelante "dignita.tech" o "el Licenciante"), empresa peruana debidamente constituida bajo las leyes de la Republica del Peru, representada por el senor Leonidas Yauricasa, en su calidad de Representante Legal.');
    doc.moveDown(0.5);

    bold('EL CLIENTE (LICENCIATARIO):');
    const clienteNombre = razon_social || nombre_cliente;
    para(`${clienteNombre} (en adelante "el Cliente" o "el Licenciatario"), identificado(a) con DNI N.° ${dni}${ruc ? ', RUC N.° ' + ruc : ''}${direccion ? ', con domicilio en ' + direccion : ''}, Peru${nombre_representante ? '; representado(a) por ' + nombre_representante + (cargo_representante ? ', en su calidad de ' + cargo_representante : '') + (dni_representante ? ', identificado(a) con DNI N.° ' + dni_representante : '') : ''}.`);
    doc.moveDown(0.3);
    if (telefono) { doc.fontSize(9.5).font('Helvetica').text(`Telefono: ${telefono}`); }
    if (email) { doc.fontSize(9.5).font('Helvetica').text(`Email: ${email}`); }
    if (nombre_establecimiento) { doc.fontSize(9.5).font('Helvetica-Bold').text(`Establecimiento: ${nombre_establecimiento}`); }

    doc.moveDown(0.5);
    if (ruc) {
        bold('DECLARACION OBLIGATORIA — RUC VIGENTE:');
        para(`El Cliente declara expresamente contar con Registro Unico de Contribuyente (RUC) vigente expedido por la SUNAT, identificado como RUC N.° ${ruc}. El Cliente certifica que ha verificado la vigencia de su RUC ante SUNAT y que toda la informacion proporcionada en el presente Contrato es veridica y actualizada.`);
    }

    separator();
    para('Ambas partes, actuando de buena fe y en pleno ejercicio de su capacidad legal, acuerdan celebrar el presente Contrato de Licencia de Software y Servicios Tecnologicos, sujeto a los terminos y condiciones que a continuacion se detallan:');

    // ===================================================
    // CONSIDERANDOS
    // ===================================================
    sectionTitle('CONSIDERANDOS');
    para('PRIMERO. Que dignita.tech es una empresa tecnologica peruana especializada en el desarrollo de soluciones de software para el sector gastronomico, siendo titular del sistema denominado MiRestconIA, plataforma de gestion integral para restaurantes con inteligencia artificial integrada.');
    doc.moveDown(0.3);
    para(`SEGUNDO. Que el Cliente es propietario y/o administrador del establecimiento de restauracion denominado "${nombre_establecimiento || '(por definir)'}"${direccion ? ', ubicado en ' + direccion : ''}, y requiere de una solucion tecnologica integral para la gestion de sus operaciones.`);
    doc.moveDown(0.3);
    para('TERCERO. Que dignita.tech ha disenado el Plan Enterprise de MiRestconIA para satisfacer las necesidades operativas completas de establecimientos gastronomicos, incluyendo gestion de mesas, pedidos, inventario, caja, facturacion electronica SUNAT, y analisis con inteligencia artificial.');
    doc.moveDown(0.3);
    para('CUARTO. Que ambas partes tienen interes legitimo en formalizar los terminos bajo los cuales se otorgara la licencia de uso del software y se prestaran los servicios asociados de implementacion, capacitacion y mantenimiento.');

    // ===================================================
    // CLAUSULAS
    // ===================================================
    sectionTitle('CLAUSULA PRIMERA: DEFINICIONES');
    const definiciones = [
        ['Software / Sistema', 'La plataforma MiRestconIA desarrollada por dignita.tech, que incluye el sistema de gestion de restaurantes con todos sus modulos: administracion, mesas, cocina, caja, almacen, facturacion electronica, reportes e inteligencia artificial (DalIA).'],
        ['Licencia Perpetua', 'Derecho de uso indefinido del Software otorgado al Cliente, sin transferencia de propiedad intelectual, que persiste independientemente de la vigencia del servicio anual de mantenimiento.'],
        ['Servicio Anual de Mantenimiento', 'Conjunto de servicios recurrentes que incluye hospedaje en la nube, base de datos, actualizaciones de software, soporte tecnico y mejoras funcionales, facturables anualmente a partir del segundo ano.'],
        ['Implementacion', 'Proceso de instalacion, configuracion, carga de datos y puesta en marcha del Software en el establecimiento del Cliente, que se ejecuta en cinco (5) dias habiles segun el Plan de Implementacion detallado en el Anexo A.'],
        ['DalIA', 'Asistente de inteligencia artificial integrada en MiRestconIA, personalizada por rol de usuario, que proporciona informes, alertas, sugerencias operativas y analisis de negocio en lenguaje natural.'],
        ['SUNAT / NubeFact', 'La Superintendencia Nacional de Aduanas y de Administracion Tributaria del Peru, organismo al que el Sistema se conecta para la emision de comprobantes electronicos; y NubeFact como Operador de Servicios Electronicos (OSE) autorizado.'],
        ['Datos del Cliente', 'Toda informacion registrada en el Sistema por el Cliente o su personal.'],
    ];
    definiciones.forEach((d, i) => {
        checkPage(30);
        doc.fontSize(9.5).font('Helvetica-Bold').text(`1.${i+1}. ${d[0]}: `, { continued: true }).font('Helvetica').text(d[1], { align: 'justify' });
        doc.moveDown(0.2);
    });

    // === OBJETO ===
    sectionTitle('CLAUSULA SEGUNDA: OBJETO DEL CONTRATO');
    para('2.1. El presente Contrato tiene por objeto el otorgamiento, por parte de dignita.tech al Cliente, de una licencia de uso perpetua, no exclusiva, intransferible e indelegable del Software MiRestconIA, Plan Enterprise, para su uso en la Sede Principal del Cliente.');
    doc.moveDown(0.3);
    para('2.2. El objeto comprende ademas la prestacion de los siguientes servicios:');
    item('Implementacion y configuracion inicial del Sistema en la nube, ejecutada en cinco (5) dias habiles (Anexo A).');
    item('Capacitacion al personal del Cliente segun los perfiles de usuario descritos en el Anexo B.');
    item('Hospedaje del Software en infraestructura de nube durante el primer ano.');
    item('Soporte tecnico prioritario durante los primeros treinta (30) dias calendario.');
    item('Soporte tecnico continuo incluido en el Servicio Anual de Mantenimiento a partir del segundo ano.');

    // === ALCANCE ===
    sectionTitle('CLAUSULA TERCERA: ALCANCE Y DESCRIPCION DEL SOFTWARE');
    para('MiRestconIA es una plataforma web de gestion integral para restaurantes, accesible desde navegadores web en dispositivos de escritorio, tabletas y telefonos moviles. El sistema opera en modalidad de nube (cloud) y dispone de modo de servidor local para contingencias de conectividad.');
    doc.moveDown(0.3);
    bold('3.2. Modulos Incluidos en el Plan Enterprise:');
    doc.moveDown(0.2);

    const perfiles = [
        ['Administrador', 'Acceso completo a todos los modulos y configuraciones'],
        ['Mesero', 'Gestion de mesas, pedidos y catalogo de productos'],
        ['Cocinero', 'Cola de cocina y gestion de estados de preparacion'],
        ['Cajero', 'Facturacion, pagos, caja y reportes diarios'],
        ['Almacenero', 'Inventario, insumos, recepciones y alertas de stock']
    ];

    // Mini table for roles
    let ty = doc.y;
    checkPage(100);
    ty = doc.y;
    doc.rect(ml, ty, pw, 18).fill('#FF6B35');
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#fff');
    doc.text('Perfil', ml + 5, ty + 4, { width: 100 });
    doc.text('Descripcion', ml + 110, ty + 4, { width: pw - 115 });
    doc.fillColor('#000');
    ty += 18;
    perfiles.forEach((p, i) => {
        const rh = 16;
        if (i % 2 === 0) doc.rect(ml, ty, pw, rh).fill('#FFF8F0').fillColor('#000');
        doc.fontSize(8).font('Helvetica-Bold').text(p[0], ml + 5, ty + 4, { width: 100 });
        doc.font('Helvetica').text(p[1], ml + 110, ty + 4, { width: pw - 115 });
        ty += rh;
    });
    doc.y = ty + 5;

    doc.moveDown(0.3);
    bold('3.3. Integraciones Incluidas:');
    item('Facturacion electronica SUNAT via NubeFact (boletas y facturas)');
    item('Envio de comprobantes por WhatsApp Business');
    item('Asistente de inteligencia artificial DalIA (impulsado por Anthropic Claude)');
    item('Exportacion de reportes en formato PDF y Excel');
    item('Gestion de inventario con alertas de stock minimo y fechas de vencimiento');

    doc.moveDown(0.3);
    bold('3.4. Flujo Operativo Integrado (Mesas → Caja → Ventas → Administracion):');
    para('El sistema conecta el flujo completo del restaurante: desde la toma de pedidos en mesa, pasando por la gestion de caja con apertura/cierre diario, registro automatico de ventas con desglose por forma de pago (efectivo, tarjeta, transferencia), hasta la consolidacion en el modulo de administracion con reportes de P&L (Perdidas y Ganancias). Todos los movimientos de caja, ventas y gastos (incluyendo planilla) se unifican automaticamente para ofrecer una vision financiera real del negocio.');

    doc.moveDown(0.3);
    bold('3.5. Almacen con Alertas Inteligentes de Stock:');
    para('El modulo de almacen monitorea en tiempo real el inventario de insumos y productos. Cuando un producto alcanza su nivel minimo de stock, el sistema genera alertas automaticas visibles en el dashboard del almacenero y del administrador. Esto permite anticipar compras, evitar quiebres de stock y mantener la operacion sin interrupciones. Las alertas incluyen: stock bajo, stock critico y productos sin movimiento.');

    doc.moveDown(0.3);
    bold('3.6. Modo de Operacion Local:');
    para('El Sistema incluye una modalidad de servidor local que permite la continuidad operativa del restaurante ante interrupciones de conectividad a internet. Los datos generados en modo local se sincronizan automaticamente con la nube al restablecerse la conexion.');

    // === CONDICIONES ECONOMICAS ===
    sectionTitle('CLAUSULA CUARTA: CONDICIONES ECONOMICAS');
    bold('4.1. Estructura de Precios:');
    doc.moveDown(0.2);

    checkPage(80);
    ty = doc.y;
    const preciosData = [
        ['Licencia perpetua del Software (pago unico)', 'S/ 2,300.00'],
        ['Servicio de nube, base de datos y mantenimiento — Ano 1 (incluido)', 'S/ 700.00'],
        ['TOTAL PRIMER ANO (pago unico al inicio)', 'S/ 3,000.00']
    ];
    doc.rect(ml, ty, pw, 18).fill('#FF6B35');
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#fff');
    doc.text('Concepto', ml + 5, ty + 4, { width: pw - 110 });
    doc.text('Importe', ml + pw - 100, ty + 4, { width: 95, align: 'right' });
    doc.fillColor('#000');
    ty += 18;
    preciosData.forEach((p, i) => {
        const rh = 16;
        const isBold = i === preciosData.length - 1;
        if (i % 2 === 0) doc.rect(ml, ty, pw, rh).fill('#FFF8F0').fillColor('#000');
        doc.fontSize(8).font(isBold ? 'Helvetica-Bold' : 'Helvetica').text(p[0], ml + 5, ty + 4, { width: pw - 110 });
        doc.font(isBold ? 'Helvetica-Bold' : 'Helvetica').text(p[1], ml + pw - 100, ty + 4, { width: 95, align: 'right' });
        ty += rh;
    });
    doc.y = ty + 5;

    doc.moveDown(0.3);
    para('A partir del segundo ano, el Cliente abonara unicamente el Servicio Anual de Mantenimiento: S/ 700.00/ano.');
    doc.moveDown(0.3);

    bold('4.2. Servicio Anual de Mantenimiento (S/ 700.00/ano) incluye:');
    item('Hospedaje en la nube 24/7');
    item('Base de datos con copias de seguridad automaticas');
    item('Actualizaciones de Software y mejoras funcionales');
    item('Soporte tecnico continuo');
    item('Mantenimiento de integraciones (SUNAT, WhatsApp)');

    doc.moveDown(0.3);
    bold('4.3. Condiciones de Pago:');
    item('El monto total del primer ano (S/ 3,000.00) se abonara al momento de la firma del contrato.');
    item('Pagos del Servicio Anual: anualmente, con plazo de 15 dias calendario.');
    item('Medios de pago: transferencia bancaria, deposito en cuenta o pago electronico.');

    // === TOKENS DALIA ===
    sectionTitle('CLAUSULA QUINTA: SERVICIO DE INTELIGENCIA ARTIFICIAL (DalIA)');
    para('El Plan Enterprise incluye acceso completo al asistente de inteligencia artificial DalIA, personalizado por rol de usuario. El servicio funciona mediante un sistema de tokens:');
    doc.moveDown(0.2);
    item('Asignacion anual: 2,000,000 tokens (≈ 2,000 consultas)');
    item('Monitoreo en tiempo real desde Administrador → Gestion de Recursos → Tokens DalIA');
    item('Alerta automatica al 90% de consumo');
    item('Tokens no acumulables — se reinician el 1 de enero de cada ano');
    doc.moveDown(0.2);
    bold('Paquetes adicionales de tokens:');
    item('500,000 tokens: S/ 50.00');
    item('1,000,000 tokens: S/ 80.00');
    item('5,000,000 tokens: S/ 300.00');

    // === IMPLEMENTACION - TIMELINE ===
    sectionTitle('CLAUSULA SEXTA: IMPLEMENTACION Y PUESTA EN MARCHA');
    para('dignita.tech ejecutara el proceso de implementacion del Software en la Sede Principal del Cliente conforme al Plan de Implementacion de Cinco (5) Dias Habiles (Anexo A), incluido en el precio del primer ano sin costo adicional.');

    doc.moveDown(0.5);
    bold('TIMELINE DE IMPLEMENTACION — 5 DIAS HABILES');
    doc.moveDown(0.3);

    const timeline = [
        { dia: 'Dia 1', fase: 'Configuracion Inicial', detalle: 'Instalacion en nube, configuracion de marca, conexion SUNAT/NubeFact, creacion de cuenta admin, prueba de acceso desde dispositivos.' },
        { dia: 'Dia 2', fase: 'Carga de Datos', detalle: 'Carga del menu completo con fotos, configuracion de mesas por zonas, carga de inventario/insumos, configuracion de recetas.' },
        { dia: 'Dia 3', fase: 'Personal y Operaciones', detalle: 'Creacion de usuarios por rol, configuracion de WhatsApp Business, metodos de pago, apertura/cierre de caja, prueba de flujo completo, alertas de stock.' },
        { dia: 'Dia 4', fase: 'Capacitacion por Roles', detalle: 'Administrador (2h), Mesero (1h), Cocinero (30min), Cajero (1h). Todo el personal capacitado y con acceso verificado.' },
        { dia: 'Dia 5', fase: 'Apertura y Supervision', detalle: 'Apertura oficial en operacion real, supervision presencial/remota, resolucion de incidencias, firma del Acta de Entrega → inicio soporte prioritario 30 dias.' }
    ];

    checkPage(120);
    const colW = [50, 110, pw - 160];
    ty = doc.y;

    doc.rect(ml, ty, pw, 18).fill('#FF6B35');
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#fff');
    doc.text('Periodo', ml + 5, ty + 4, { width: colW[0] });
    doc.text('Fase', ml + colW[0] + 5, ty + 4, { width: colW[1] });
    doc.text('Detalle', ml + colW[0] + colW[1] + 5, ty + 4, { width: colW[2] });
    doc.fillColor('#000');
    ty += 18;

    timeline.forEach((t, i) => {
        const th = doc.heightOfString(t.detalle, { width: colW[2] - 10 });
        const rh = Math.max(28, th + 10);
        if (ty + rh > 740) { doc.addPage(); ty = 50; }
        if (i % 2 === 0) doc.rect(ml, ty, pw, rh).fill('#FFF8F0').fillColor('#000');
        doc.fontSize(8).font('Helvetica-Bold').text(t.dia, ml + 5, ty + 4, { width: colW[0] });
        doc.font('Helvetica-Bold').text(t.fase, ml + colW[0] + 5, ty + 4, { width: colW[1] });
        doc.font('Helvetica').text(t.detalle, ml + colW[0] + colW[1] + 5, ty + 4, { width: colW[2] - 10 });
        ty += rh;
    });
    doc.y = ty + 10;

    // === CAPACITACION ===
    sectionTitle('CLAUSULA SEPTIMA: CAPACITACION');
    para('dignita.tech proporcionara capacitacion al personal del Cliente conforme al programa (Dia 4 del Plan de Implementacion), sin costo adicional. El Cliente podra solicitar sesiones de recapacitacion adicionales para personal nuevo; la primera dentro del primer ano sera sin costo.');

    // === SLA ===
    sectionTitle('CLAUSULA OCTAVA: NIVEL DE SERVICIO (SLA)');
    para('dignita.tech garantiza un nivel de disponibilidad (uptime) del 99.5% mensual para la version en la nube del Software. Esto equivale a un maximo de aproximadamente 3 horas y 36 minutos de inactividad no programada por mes.');
    doc.moveDown(0.3);
    bold('Creditos por incumplimiento del SLA:');
    item('99.0% - 99.4%: 10% de credito');
    item('98.0% - 98.9%: 20% de credito');
    item('Menos de 98.0%: 30% de credito');
    doc.moveDown(0.3);
    bold('Copias de seguridad:');
    item('Copia diaria: retenida por 30 dias');
    item('Copia semanal: retenida por 90 dias');

    // === SOPORTE ===
    sectionTitle('CLAUSULA NOVENA: SOPORTE TECNICO');
    bold('Soporte Prioritario Post-Implementacion (primeros 30 dias):');
    item('Canal: WhatsApp y acceso remoto');
    item('Horario: Lunes a sabado de 8:00 a.m. a 8:00 p.m. (hora de Lima)');
    item('Tiempo de respuesta: Maximo 4 horas habiles');
    item('Sistema caido (critico): Maximo 2 horas');

    doc.moveDown(0.3);
    bold('Soporte incluido en el Servicio Anual (a partir del dia 31):');
    item('Critica (sistema inoperativo): Maximo 2 horas');
    item('Alta (modulo no disponible): Maximo 4 horas');
    item('Media (funcionalidad parcialmente afectada): Maximo 24 horas');
    item('Baja (consultas, ajustes menores): Maximo 48 horas');

    // === OBLIGACIONES ===
    sectionTitle('CLAUSULA DECIMA: OBLIGACIONES DE LAS PARTES');
    bold('Obligaciones de dignita.tech:');
    item('Otorgar la licencia de uso del Software conforme al presente Contrato.');
    item('Ejecutar el Plan de Implementacion de acuerdo al Anexo A.');
    item('Garantizar la disponibilidad del Software segun el SLA (99.5%).');
    item('Prestar soporte tecnico segun los terminos acordados.');
    item('Mantener la confidencialidad de los Datos del Cliente.');
    item('Entregar actualizaciones y nuevas versiones sin costo adicional.');
    item('Cumplir con la Ley N.° 29733 de Proteccion de Datos Personales.');

    doc.moveDown(0.3);
    bold('Obligaciones del Cliente:');
    item('Abonar puntualmente los montos acordados.');
    item('Proporcionar oportunamente la informacion requerida para la implementacion.');
    item('Utilizar el Software exclusivamente para los fines descritos.');
    item('Mantener la confidencialidad de las credenciales de acceso.');
    item('Notificar a dignita.tech ante cualquier incidencia de seguridad.');

    // === PROPIEDAD INTELECTUAL ===
    sectionTitle('CLAUSULA DECIMOPRIMERA: PROPIEDAD INTELECTUAL');
    para('El Software MiRestconIA, su codigo fuente, arquitectura, algoritmos, bases de datos, disenos de interfaz, documentacion tecnica, el asistente DalIA y cualquier componente asociado son y permanecen siendo propiedad exclusiva de dignita.tech, protegidos por las leyes de propiedad intelectual del Peru (Decreto Legislativo N.° 822).');
    doc.moveDown(0.3);
    para('La licencia es: Personal, No exclusiva, Intransferible y Perpetua. Los Datos del Cliente son propiedad exclusiva del Cliente. El Cliente tiene derecho irrestricto de exportar todos sus datos en formatos estandar (PDF, Excel, CSV) en cualquier momento.');

    // === CONFIDENCIALIDAD ===
    sectionTitle('CLAUSULA DECIMOSEGUNDA: CONFIDENCIALIDAD');
    para('Ambas partes se obligan a mantener en estricta confidencialidad toda informacion que reciban de la otra parte en el marco del presente Contrato. La obligacion de confidencialidad subsistira por un periodo de tres (3) anos contados desde la fecha de terminacion del presente Contrato.');

    // === GARANTIA ===
    sectionTitle('CLAUSULA DECIMOTERCERA: GARANTIA DE SATISFACCION');
    para('Si durante los primeros quince (15) dias habiles posteriores a la firma del Acta de Conformidad de Implementacion, el Cliente reporta una falla critica del Sistema y dignita.tech no proporciona una solucion definitiva dentro de dicho plazo, el Cliente tendra derecho a solicitar la devolucion integra del monto pagado por el Servicio Anual de Mantenimiento (S/ 700.00), manteniendo vigente la licencia perpetua del Software.');

    // === VIGENCIA ===
    sectionTitle('CLAUSULA DECIMOCUARTA: VIGENCIA Y TERMINACION');
    para('La licencia de uso del Software es perpetua y no tiene fecha de vencimiento. El Servicio Anual de Mantenimiento tiene una vigencia inicial de un (1) ano, renovandose automaticamente, salvo comunicacion escrita con 30 dias de anticipacion.');
    doc.moveDown(0.2);
    bold('Efectos de la no renovacion del Servicio Anual:');
    item('La licencia perpetua permanece vigente.');
    item('Se suspende el acceso a la nube y soporte.');
    item('El Cliente puede continuar usando el Software en modo local.');
    item('Los datos se retienen en la nube por 90 dias para exportacion.');

    // ===================================================
    // COSTOS DE SERVICIOS DE TERCEROS (NO INCLUIDOS)
    // ===================================================
    doc.addPage();
    heading('ANEXO: COSTOS DE SERVICIOS DE TERCEROS', 14);
    doc.moveDown(0.3);
    doc.moveTo(ml, doc.y).lineTo(ml + pw, doc.y).strokeColor('#FF6B35').lineWidth(2).stroke();
    doc.moveDown(0.5);

    para('IMPORTANTE: Los siguientes servicios de terceros NO estan incluidos en la licencia de MiRestconIA ni en el Servicio Anual de Mantenimiento. Son servicios externos contratados directamente entre el Cliente y el proveedor correspondiente, y su costo es responsabilidad exclusiva del Cliente.');
    doc.moveDown(0.5);

    // -- SUNAT / FACTURACION ELECTRONICA --
    sectionTitle('A. FACTURACION ELECTRONICA SUNAT — API NubeFact (PSE/OSE)');

    bold('Que es?');
    para('El sistema MiRestconIA se conecta a un Proveedor de Servicios Electronicos (PSE) u Operador de Servicios Electronicos (OSE) autorizado por SUNAT para la emision de comprobantes electronicos (boletas y facturas). El proveedor recomendado es NubeFact, aunque el Cliente puede elegir otro proveedor compatible (Ubiobio, Elapago, etc.).');
    doc.moveDown(0.3);

    bold('Como funciona?');
    item('MiRestconIA genera el comprobante electronico (XML) con los datos de la venta.');
    item('El XML se envia automaticamente al PSE/OSE (NubeFact) via API.');
    item('NubeFact valida, firma digitalmente y envia el comprobante a SUNAT.');
    item('SUNAT responde con el CDR (Constancia de Recepcion) confirmando la validez.');
    item('El comprobante queda registrado en el sistema y disponible para el cliente final.');
    item('Todo el proceso es automatico — el cajero solo presiona "Cobrar".');
    doc.moveDown(0.3);

    bold('Cuanto cuesta? — Tabla de precios por volumen:');
    doc.moveDown(0.3);

    // Tabla SUNAT
    checkPage(140);
    ty = doc.y;
    const sunatPlanes = [
        ['Basico (hasta 100 comprobantes/mes)', 'S/ 29.00 - S/ 39.00', 'S/ 348.00 - S/ 468.00'],
        ['Estandar (hasta 500 comprobantes/mes)', 'S/ 49.00 - S/ 59.00', 'S/ 588.00 - S/ 708.00'],
        ['Profesional (hasta 1,000 comprobantes/mes)', 'S/ 69.00 - S/ 89.00', 'S/ 828.00 - S/ 1,068.00'],
        ['Enterprise (ilimitado)', 'S/ 99.00 - S/ 149.00', 'S/ 1,188.00 - S/ 1,788.00']
    ];
    const sunatCols = [pw * 0.45, pw * 0.28, pw * 0.27];

    doc.rect(ml, ty, pw, 18).fill('#FF6B35');
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#fff');
    doc.text('Plan NubeFact (referencial)', ml + 5, ty + 4, { width: sunatCols[0] });
    doc.text('Costo Mensual', ml + sunatCols[0] + 5, ty + 4, { width: sunatCols[1], align: 'center' });
    doc.text('Costo Anual', ml + sunatCols[0] + sunatCols[1] + 5, ty + 4, { width: sunatCols[2], align: 'center' });
    doc.fillColor('#000');
    ty += 18;

    sunatPlanes.forEach((p, i) => {
        const rh = 18;
        if (i % 2 === 0) doc.rect(ml, ty, pw, rh).fill('#FFF8F0').fillColor('#000');
        doc.fontSize(8).font('Helvetica').text(p[0], ml + 5, ty + 4, { width: sunatCols[0] });
        doc.text(p[1], ml + sunatCols[0] + 5, ty + 4, { width: sunatCols[1], align: 'center' });
        doc.text(p[2], ml + sunatCols[0] + sunatCols[1] + 5, ty + 4, { width: sunatCols[2], align: 'center' });
        ty += rh;
    });
    doc.y = ty + 8;

    doc.moveDown(0.2);
    doc.fontSize(8).font('Helvetica').fillColor('#666').text('* Los precios de NubeFact son referenciales y pueden variar. Consultar directamente con el proveedor. Precios no incluyen IGV.', { align: 'center' });
    doc.fillColor('#000');
    doc.moveDown(0.3);

    bold('Obligaciones del Cliente respecto a SUNAT:');
    item('Contratar directamente el servicio del PSE/OSE de su eleccion.');
    item('Mantener vigente su RUC, certificado digital y token de autenticacion.');
    item('Cumplir con todas sus obligaciones tributarias ante SUNAT.');
    item('Comunicar a dignita.tech cualquier cambio en su condicion tributaria.');
    doc.moveDown(0.3);
    para('dignita.tech NO es responsable de sanciones tributarias impuestas al Cliente por incumplimiento de sus obligaciones ante SUNAT, aun cuando tengan algun vinculo con el uso del Sistema.');

    // -- WHATSAPP BUSINESS API --
    doc.moveDown(1);
    sectionTitle('B. ENVIO DE COMPROBANTES POR WHATSAPP — API de Meta Cloud');

    bold('Que es?');
    para('MiRestconIA permite enviar automaticamente boletas y facturas electronicas a los clientes del restaurante a traves de WhatsApp Business, utilizando la infraestructura de Meta Cloud API. Esto NO es WhatsApp regular — es la API oficial de WhatsApp Business para empresas.');
    doc.moveDown(0.3);

    bold('Como funciona?');
    item('Al generar un comprobante, el cajero puede enviar la boleta/factura por WhatsApp con un clic.');
    item('El sistema genera el PDF del comprobante y lo envia al numero del cliente via API de Meta.');
    item('El cliente recibe el comprobante directamente en su WhatsApp.');
    item('Se registra el envio en el sistema para trazabilidad.');
    doc.moveDown(0.3);

    bold('Cuanto cuesta? — Modelo de precios por volumen de mensajes:');
    doc.moveDown(0.3);

    checkPage(160);
    ty = doc.y;
    const whatsappData = [
        ['Primeros 500 mensajes/mes', 'Incluido sin costo*', 'Incluido sin costo*', 'Asumido por dignita.tech'],
        ['501 - 1,000 mensajes/mes', 'S/ 0.05 por mensaje', '≈ S/ 25.00 - S/ 50.00', 'Cliente paga excedente'],
        ['1,001 - 3,000 mensajes/mes', 'S/ 0.05 por mensaje', '≈ S/ 50.00 - S/ 150.00', 'Cliente paga excedente'],
        ['3,001 - 5,000 mensajes/mes', 'S/ 0.04 por mensaje', '≈ S/ 120.00 - S/ 200.00', 'Cliente paga excedente'],
        ['Mas de 5,000 mensajes/mes', 'Tarifa negociable', 'Segun acuerdo', 'Contactar a dignita.tech']
    ];
    const waCols = [pw * 0.28, pw * 0.22, pw * 0.25, pw * 0.25];

    doc.rect(ml, ty, pw, 18).fill('#25D366');
    doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#fff');
    doc.text('Volumen', ml + 5, ty + 4, { width: waCols[0] });
    doc.text('Costo por Mensaje', ml + waCols[0] + 3, ty + 4, { width: waCols[1], align: 'center' });
    doc.text('Estimado Mensual', ml + waCols[0] + waCols[1] + 3, ty + 4, { width: waCols[2], align: 'center' });
    doc.text('Responsable', ml + waCols[0] + waCols[1] + waCols[2] + 3, ty + 4, { width: waCols[3], align: 'center' });
    doc.fillColor('#000');
    ty += 18;

    whatsappData.forEach((p, i) => {
        const rh = 18;
        if (i % 2 === 0) doc.rect(ml, ty, pw, rh).fill('#F0FFF4').fillColor('#000');
        doc.fontSize(7.5).font(i === 0 ? 'Helvetica-Bold' : 'Helvetica');
        doc.text(p[0], ml + 5, ty + 4, { width: waCols[0] });
        doc.text(p[1], ml + waCols[0] + 3, ty + 4, { width: waCols[1], align: 'center' });
        doc.text(p[2], ml + waCols[0] + waCols[1] + 3, ty + 4, { width: waCols[2], align: 'center' });
        doc.fontSize(7).text(p[3], ml + waCols[0] + waCols[1] + waCols[2] + 3, ty + 4, { width: waCols[3], align: 'center' });
        ty += rh;
    });
    doc.y = ty + 8;

    doc.moveDown(0.2);
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#25D366').text('* dignita.tech asume el costo de los primeros 500 mensajes/mes por sede como parte del Servicio Anual de Mantenimiento.', { align: 'center' });
    doc.fillColor('#000');
    doc.moveDown(0.3);

    bold('Condiciones del servicio de WhatsApp:');
    item('El limite de 500 mensajes gratuitos aplica por sede y por mes calendario.');
    item('Los mensajes excedentes seran facturados mensualmente al Cliente por dignita.tech.');
    item('dignita.tech se reserva el derecho de modificar el limite de "uso razonable" con 30 dias de aviso previo, en caso de cambios en la politica de precios de Meta.');
    item('El uso abusivo o automatizado (spam) del servicio de WhatsApp queda estrictamente prohibido.');
    doc.moveDown(0.3);

    bold('Requisitos del Cliente:');
    item('Contar con un numero de WhatsApp Business verificado.');
    item('Proporcionar el numero a dignita.tech durante la implementacion (Dia 3).');
    item('No usar el canal para fines distintos al envio de comprobantes electronicos.');

    // -- RESUMEN DE COSTOS TERCEROS --
    doc.moveDown(1);
    sectionTitle('C. RESUMEN DE COSTOS DE TERCEROS — ESTIMACION MENSUAL');
    doc.moveDown(0.3);

    checkPage(120);
    ty = doc.y;
    const resumenData = [
        ['Restaurante pequeno (≈100 ventas/mes)', 'S/ 29 - S/ 39', 'Incluido', 'S/ 29 - S/ 39'],
        ['Restaurante mediano (≈300-500 ventas/mes)', 'S/ 49 - S/ 59', 'Incluido', 'S/ 49 - S/ 59'],
        ['Restaurante grande (≈500-1,000 ventas/mes)', 'S/ 69 - S/ 89', 'S/ 0 - S/ 25', 'S/ 69 - S/ 114'],
        ['Alto volumen (>1,000 ventas/mes)', 'S/ 99 - S/ 149', 'S/ 25 - S/ 100', 'S/ 124 - S/ 249']
    ];
    const resCols = [pw * 0.36, pw * 0.22, pw * 0.20, pw * 0.22];

    doc.rect(ml, ty, pw, 18).fill('#1a1a2e');
    doc.fontSize(7.5).font('Helvetica-Bold').fillColor('#fff');
    doc.text('Perfil de Negocio', ml + 5, ty + 4, { width: resCols[0] });
    doc.text('SUNAT (PSE)', ml + resCols[0] + 3, ty + 4, { width: resCols[1], align: 'center' });
    doc.text('WhatsApp', ml + resCols[0] + resCols[1] + 3, ty + 4, { width: resCols[2], align: 'center' });
    doc.text('Total Mensual', ml + resCols[0] + resCols[1] + resCols[2] + 3, ty + 4, { width: resCols[3], align: 'center' });
    doc.fillColor('#000');
    ty += 18;

    resumenData.forEach((p, i) => {
        const rh = 18;
        if (i % 2 === 0) doc.rect(ml, ty, pw, rh).fill('#F8F8FF').fillColor('#000');
        doc.fontSize(7.5).font('Helvetica').text(p[0], ml + 5, ty + 4, { width: resCols[0] });
        doc.text(p[1], ml + resCols[0] + 3, ty + 4, { width: resCols[1], align: 'center' });
        doc.text(p[2], ml + resCols[0] + resCols[1] + 3, ty + 4, { width: resCols[2], align: 'center' });
        doc.font('Helvetica-Bold').text(p[3], ml + resCols[0] + resCols[1] + resCols[2] + 3, ty + 4, { width: resCols[3], align: 'center' });
        ty += rh;
    });
    doc.y = ty + 8;

    doc.moveDown(0.3);
    doc.fontSize(8).font('Helvetica').fillColor('#666').text('* Todos los precios son referenciales, no incluyen IGV (18%), y pueden variar segun el proveedor elegido y las politicas vigentes de Meta y SUNAT.', { align: 'center' });
    doc.fillColor('#000');
    doc.moveDown(0.5);

    bold('Independencia de servicios:');
    para('Los costos de servicios de terceros (PSE/OSE, Meta/WhatsApp, SUNAT) son completamente independientes de la licencia MiRestconIA y no afectan su operatividad. El Sistema funciona con todas sus funcionalidades aun sin estos servicios activos — simplemente no se emitiran comprobantes electronicos ni se enviaran por WhatsApp hasta que el Cliente los active.');

    // === LEY APLICABLE (renumerada) ===
    sectionTitle('CLAUSULA DECIMOSEXTA: LEY APLICABLE Y RESOLUCION DE CONTROVERSIAS');
    para('El presente Contrato se rige por las leyes de la Republica del Peru. Las controversias se resolveran mediante negociacion directa (15 dias) y, de no resolverse, mediante arbitraje en el Centro de Arbitraje de la Camara de Comercio de Lima.');

    // === DISPOSICIONES GENERALES ===
    sectionTitle('CLAUSULA DECIMOSEPTIMA: DISPOSICIONES GENERALES');
    para('El presente Contrato, junto con sus Anexos, constituye el acuerdo integral entre las partes. Cualquier modificacion debera constar por escrito y ser suscrita por ambas partes.');

    // ===================================================
    // FIRMAS
    // ===================================================
    checkPage(160);
    doc.moveDown(2);
    separator();
    doc.moveDown(0.5);

    bold('CLAUSULA FINAL: DECLARACION DE VOLUNTAD');
    doc.moveDown(0.3);
    para('Las partes declaran haber leido, comprendido y aceptado voluntariamente todas y cada una de las clausulas del presente Contrato, manifestando que no existe vicio alguno que afecte su consentimiento.');

    doc.moveDown(2);

    const firmaY = doc.y;
    const midX = ml + pw / 2;

    // Embed firma-dignita.png on the LEFT side (dignita.tech side)
    const firmaPath = path.join(__dirname, '..', 'public', 'uploads', 'firma-dignita.png');
    if (fs.existsSync(firmaPath)) {
        doc.image(firmaPath, ml + 40, firmaY - 60, { width: 130 });
    }

    // Lineas de firma
    doc.moveTo(ml + 10, firmaY).lineTo(ml + 200, firmaY).strokeColor('#333').lineWidth(0.8).stroke();
    doc.moveTo(midX + 10, firmaY).lineTo(midX + 200, firmaY).stroke();

    doc.fontSize(9).font('Helvetica-Bold').fillColor('#222');
    doc.text('POR DIGNITA.TECH (EL LICENCIANTE)', ml + 10, firmaY + 5, { width: 190, align: 'center' });
    doc.text('POR EL CLIENTE (EL LICENCIATARIO)', midX + 10, firmaY + 5, { width: 190, align: 'center' });

    doc.fontSize(8).font('Helvetica').fillColor('#555');
    doc.text('Leonidas Yauricasa', ml + 10, firmaY + 20, { width: 190, align: 'center' });
    doc.text('Representante Legal', ml + 10, firmaY + 30, { width: 190, align: 'center' });
    doc.text('DIGNITA TECH S.A.C.', ml + 10, firmaY + 40, { width: 190, align: 'center' });

    doc.text(nombre_cliente, midX + 10, firmaY + 20, { width: 190, align: 'center' });
    if (dni) doc.text(`DNI: ${dni}`, midX + 10, firmaY + 30, { width: 190, align: 'center' });
    if (ruc) doc.text(`RUC: ${ruc}`, midX + 10, firmaY + 40, { width: 190, align: 'center' });
    if (razon_social) doc.text(razon_social, midX + 10, firmaY + 50, { width: 190, align: 'center' });

    doc.moveDown(5);
    doc.fontSize(7).fillColor('#999').text(`Documento generado el ${fechaTexto} — MiRestconIA por dignita.tech`, { align: 'center' });
    doc.text('Documento firmado en dos (2) ejemplares originales de igual tenor y valor.', { align: 'center' });

    doc.end();
    } catch (err) {
        console.error('Error generando contrato:', err.message, err.stack);
        if (!res.headersSent) res.status(500).json({ error: 'Error al generar contrato: ' + err.message });
    }
});

// POST /api/contratos/:id/reenviar - Reenviar email de firma
router.post('/:id/reenviar', async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT id, token, nro_contrato, nombre_cliente, email, estado FROM contratos WHERE id = ? AND tenant_id = ?',
            [req.params.id, req.tenantId || 1]
        );
        if (!rows.length) return res.status(404).json({ error: 'Contrato no encontrado' });
        const c = rows[0];
        if (!c.email) return res.status(400).json({ error: 'El cliente no tiene email registrado' });
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const link = `${baseUrl}/firmar/${c.token}`;
        const ok = await sendSigningLink({ to: c.email, nombreCliente: c.nombre_cliente, nroContrato: c.nro_contrato, link });
        if (ok) await db.query('UPDATE contratos SET email_enviado_at = NOW() WHERE id = ?', [c.id]);
        res.json({ ok, message: ok ? 'Email reenviado' : 'Error al enviar email' });
    } catch (err) {
        console.error('Reenviar error:', err.message);
        res.status(500).json({ error: 'Error al reenviar' });
    }
});

// GET /api/contratos/:id/descargar/:tipo - Descargar PDF original o firmado
router.get('/:id/descargar/:tipo', async (req, res) => {
    try {
        const col = req.params.tipo === 'firmado' ? 'pdf_firmado' : 'pdf_original';
        const [rows] = await db.query(
            `SELECT ${col}, nro_contrato, nombre_cliente FROM contratos WHERE id = ? AND tenant_id = ?`,
            [req.params.id, req.tenantId || 1]
        );
        if (!rows.length || !rows[0][col]) return res.status(404).json({ error: 'PDF no encontrado' });
        const c = rows[0];
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="Contrato_${c.nro_contrato}_${req.params.tipo}.pdf"`);
        res.send(c[col]);
    } catch (err) {
        console.error('Descargar error:', err.message);
        res.status(500).json({ error: 'Error al descargar' });
    }
});

module.exports = router;
