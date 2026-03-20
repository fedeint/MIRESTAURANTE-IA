const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');

// GET /contratos - Página del generador de contratos
router.get('/', (req, res) => {
    res.render('contratos');
});

// POST /api/contratos/generar - Generar PDF del contrato
router.post('/generar', (req, res) => {
    const { nombre_cliente, ruc, dni, razon_social, direccion, telefono, email, nombre_establecimiento, nombre_representante, cargo_representante, dni_representante } = req.body;

    if (!nombre_cliente || !dni) {
        return res.status(400).json({ error: 'Nombre y DNI son obligatorios' });
    }

    const hoy = new Date();
    const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    const fechaTexto = `${hoy.getDate()} de ${meses[hoy.getMonth()]} de ${hoy.getFullYear()}`;

    const nroContrato = `CTR-${hoy.getFullYear()}${String(hoy.getMonth()+1).padStart(2,'0')}${String(hoy.getDate()).padStart(2,'0')}-${String(Math.floor(Math.random()*9000)+1000)}`;

    const doc = new PDFDocument({ size: 'A4', margins: { top: 50, bottom: 50, left: 55, right: 55 }, bufferPages: true });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Contrato_Enterprise_${(razon_social || nombre_cliente).replace(/\s+/g, '_')}_${hoy.toISOString().split('T')[0]}.pdf"`);
    doc.pipe(res);

    const pw = doc.page.width - 110;
    const ml = 55;

    // ─── Helpers ───
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

    // ═══════════════════════════════════════════════════
    // PORTADA
    // ═══════════════════════════════════════════════════
    doc.moveDown(4);
    doc.fontSize(10).font('Helvetica').fillColor('#666').text('dignita.tech', { align: 'center' });
    doc.moveDown(0.5);
    heading('CONTRATO DE LICENCIA DE SOFTWARE', 18);
    heading('Y SERVICIOS TECNOLÓGICOS', 18);
    doc.moveDown(0.8);
    doc.moveTo(ml + 100, doc.y).lineTo(ml + pw - 100, doc.y).strokeColor('#FF6B35').lineWidth(2).stroke();
    doc.moveDown(0.8);
    heading('PLAN ENTERPRISE — MiRestconIA', 14);
    doc.fontSize(11).font('Helvetica').fillColor('#444').text('Sistema de Gestión para Restaurantes', { align: 'center' });
    doc.moveDown(3);

    doc.fontSize(10).font('Helvetica').fillColor('#333');
    doc.text(`Contrato N.° ${nroContrato}`, { align: 'center' });
    doc.text(`Fecha de suscripción: Lima, ${fechaTexto}`, { align: 'center' });
    doc.moveDown(4);

    doc.fontSize(9).fillColor('#888').text('Documento generado por MiRestconIA — dignita.tech', { align: 'center' });

    // ═══════════════════════════════════════════════════
    // PARTES CONTRATANTES
    // ═══════════════════════════════════════════════════
    doc.addPage();
    sectionTitle('PARTES CONTRATANTES');

    bold('EL LICENCIANTE:');
    para('DIGNITA TECH E.I.R.L. (en adelante "dignita.tech" o "el Licenciante"), empresa peruana debidamente constituida bajo las leyes de la República del Perú, representada por el señor Leonidas Yauricasa, en su calidad de Representante Legal.');
    doc.moveDown(0.5);

    bold('EL CLIENTE (LICENCIATARIO):');
    const clienteNombre = razon_social || nombre_cliente;
    para(`${clienteNombre} (en adelante "el Cliente" o "el Licenciatario"), identificado(a) con DNI N.° ${dni}${ruc ? ', RUC N.° ' + ruc : ''}${direccion ? ', con domicilio en ' + direccion : ''}, Perú${nombre_representante ? '; representado(a) por ' + nombre_representante + (cargo_representante ? ', en su calidad de ' + cargo_representante : '') + (dni_representante ? ', identificado(a) con DNI N.° ' + dni_representante : '') : ''}.`);
    doc.moveDown(0.3);
    if (telefono) { doc.fontSize(9.5).font('Helvetica').text(`Teléfono: ${telefono}`); }
    if (email) { doc.fontSize(9.5).font('Helvetica').text(`Email: ${email}`); }
    if (nombre_establecimiento) { doc.fontSize(9.5).font('Helvetica-Bold').text(`Establecimiento: ${nombre_establecimiento}`); }

    doc.moveDown(0.5);
    if (ruc) {
        bold('DECLARACIÓN OBLIGATORIA — RUC VIGENTE:');
        para(`El Cliente declara expresamente contar con Registro Único de Contribuyente (RUC) vigente expedido por la SUNAT, identificado como RUC N.° ${ruc}. El Cliente certifica que ha verificado la vigencia de su RUC ante SUNAT y que toda la información proporcionada en el presente Contrato es verídica y actualizada.`);
    }

    separator();
    para('Ambas partes, actuando de buena fe y en pleno ejercicio de su capacidad legal, acuerdan celebrar el presente Contrato de Licencia de Software y Servicios Tecnológicos, sujeto a los términos y condiciones que a continuación se detallan:');

    // ═══════════════════════════════════════════════════
    // CONSIDERANDOS
    // ═══════════════════════════════════════════════════
    sectionTitle('CONSIDERANDOS');
    para('PRIMERO. Que dignita.tech es una empresa tecnológica peruana especializada en el desarrollo de soluciones de software para el sector gastronómico, siendo titular del sistema denominado MiRestconIA, plataforma de gestión integral para restaurantes con inteligencia artificial integrada.');
    doc.moveDown(0.3);
    para(`SEGUNDO. Que el Cliente es propietario y/o administrador del establecimiento de restauración denominado "${nombre_establecimiento || '(por definir)'}"${direccion ? ', ubicado en ' + direccion : ''}, y requiere de una solución tecnológica integral para la gestión de sus operaciones.`);
    doc.moveDown(0.3);
    para('TERCERO. Que dignita.tech ha diseñado el Plan Enterprise de MiRestconIA para satisfacer las necesidades operativas completas de establecimientos gastronómicos, incluyendo gestión de mesas, pedidos, inventario, caja, facturación electrónica SUNAT, y análisis con inteligencia artificial.');
    doc.moveDown(0.3);
    para('CUARTO. Que ambas partes tienen interés legítimo en formalizar los términos bajo los cuales se otorgará la licencia de uso del software y se prestarán los servicios asociados de implementación, capacitación y mantenimiento.');

    // ═══════════════════════════════════════════════════
    // CLÁUSULAS
    // ═══════════════════════════════════════════════════
    sectionTitle('CLÁUSULA PRIMERA: DEFINICIONES');
    const definiciones = [
        ['Software / Sistema', 'La plataforma MiRestconIA desarrollada por dignita.tech, que incluye el sistema de gestión de restaurantes con todos sus módulos: administración, mesas, cocina, caja, almacén, facturación electrónica, reportes e inteligencia artificial (DalIA).'],
        ['Licencia Perpetua', 'Derecho de uso indefinido del Software otorgado al Cliente, sin transferencia de propiedad intelectual, que persiste independientemente de la vigencia del servicio anual de mantenimiento.'],
        ['Servicio Anual de Mantenimiento', 'Conjunto de servicios recurrentes que incluye hospedaje en la nube, base de datos, actualizaciones de software, soporte técnico y mejoras funcionales, facturables anualmente a partir del segundo año.'],
        ['Implementación', 'Proceso de instalación, configuración, carga de datos y puesta en marcha del Software en el establecimiento del Cliente, que se ejecuta en cinco (5) días hábiles según el Plan de Implementación detallado en el Anexo A.'],
        ['DalIA', 'Asistente de inteligencia artificial integrada en MiRestconIA, personalizada por rol de usuario, que proporciona informes, alertas, sugerencias operativas y análisis de negocio en lenguaje natural.'],
        ['SUNAT / NubeFact', 'La Superintendencia Nacional de Aduanas y de Administración Tributaria del Perú, organismo al que el Sistema se conecta para la emisión de comprobantes electrónicos; y NubeFact como Operador de Servicios Electrónicos (OSE) autorizado.'],
        ['Datos del Cliente', 'Toda información registrada en el Sistema por el Cliente o su personal.'],
    ];
    definiciones.forEach((d, i) => {
        checkPage(30);
        doc.fontSize(9.5).font('Helvetica-Bold').text(`1.${i+1}. ${d[0]}: `, { continued: true }).font('Helvetica').text(d[1], { align: 'justify' });
        doc.moveDown(0.2);
    });

    // ═══ OBJETO ═══
    sectionTitle('CLÁUSULA SEGUNDA: OBJETO DEL CONTRATO');
    para('2.1. El presente Contrato tiene por objeto el otorgamiento, por parte de dignita.tech al Cliente, de una licencia de uso perpetua, no exclusiva, intransferible e indelegable del Software MiRestconIA, Plan Enterprise, para su uso en la Sede Principal del Cliente.');
    doc.moveDown(0.3);
    para('2.2. El objeto comprende además la prestación de los siguientes servicios:');
    item('Implementación y configuración inicial del Sistema en la nube, ejecutada en cinco (5) días hábiles (Anexo A).');
    item('Capacitación al personal del Cliente según los perfiles de usuario descritos en el Anexo B.');
    item('Hospedaje del Software en infraestructura de nube durante el primer año.');
    item('Soporte técnico prioritario durante los primeros treinta (30) días calendario.');
    item('Soporte técnico continuo incluido en el Servicio Anual de Mantenimiento a partir del segundo año.');

    // ═══ ALCANCE ═══
    sectionTitle('CLÁUSULA TERCERA: ALCANCE Y DESCRIPCIÓN DEL SOFTWARE');
    para('MiRestconIA es una plataforma web de gestión integral para restaurantes, accesible desde navegadores web en dispositivos de escritorio, tabletas y teléfonos móviles. El sistema opera en modalidad de nube (cloud) y dispone de modo de servidor local para contingencias de conectividad.');
    doc.moveDown(0.3);
    bold('3.2. Módulos Incluidos en el Plan Enterprise:');
    doc.moveDown(0.2);

    const perfiles = [
        ['Administrador', 'Acceso completo a todos los módulos y configuraciones'],
        ['Mesero', 'Gestión de mesas, pedidos y catálogo de productos'],
        ['Cocinero', 'Cola de cocina y gestión de estados de preparación'],
        ['Cajero', 'Facturación, pagos, caja y reportes diarios'],
        ['Almacenero', 'Inventario, insumos, recepciones y alertas de stock']
    ];

    // Mini table for roles
    let ty = doc.y;
    checkPage(100);
    ty = doc.y;
    doc.rect(ml, ty, pw, 18).fill('#FF6B35');
    doc.fontSize(8).font('Helvetica-Bold').fillColor('#fff');
    doc.text('Perfil', ml + 5, ty + 4, { width: 100 });
    doc.text('Descripción', ml + 110, ty + 4, { width: pw - 115 });
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
    item('Facturación electrónica SUNAT vía NubeFact (boletas y facturas)');
    item('Envío de comprobantes por WhatsApp Business');
    item('Asistente de inteligencia artificial DalIA (impulsado por Anthropic Claude)');
    item('Exportación de reportes en formato PDF y Excel');
    item('Gestión de inventario con alertas de stock mínimo y fechas de vencimiento');

    doc.moveDown(0.3);
    bold('3.4. Flujo Operativo Integrado (Mesas → Caja → Ventas → Administración):');
    para('El sistema conecta el flujo completo del restaurante: desde la toma de pedidos en mesa, pasando por la gestión de caja con apertura/cierre diario, registro automático de ventas con desglose por forma de pago (efectivo, tarjeta, transferencia), hasta la consolidación en el módulo de administración con reportes de P&L (Pérdidas y Ganancias). Todos los movimientos de caja, ventas y gastos (incluyendo planilla) se unifican automáticamente para ofrecer una visión financiera real del negocio.');

    doc.moveDown(0.3);
    bold('3.5. Almacén con Alertas Inteligentes de Stock:');
    para('El módulo de almacén monitorea en tiempo real el inventario de insumos y productos. Cuando un producto alcanza su nivel mínimo de stock, el sistema genera alertas automáticas visibles en el dashboard del almacenero y del administrador. Esto permite anticipar compras, evitar quiebres de stock y mantener la operación sin interrupciones. Las alertas incluyen: stock bajo, stock crítico y productos sin movimiento.');

    doc.moveDown(0.3);
    bold('3.6. Modo de Operación Local:');
    para('El Sistema incluye una modalidad de servidor local que permite la continuidad operativa del restaurante ante interrupciones de conectividad a internet. Los datos generados en modo local se sincronizan automáticamente con la nube al restablecerse la conexión.');

    // ═══ CONDICIONES ECONÓMICAS ═══
    sectionTitle('CLÁUSULA CUARTA: CONDICIONES ECONÓMICAS');
    bold('4.1. Estructura de Precios:');
    doc.moveDown(0.2);

    checkPage(80);
    ty = doc.y;
    const preciosData = [
        ['Licencia perpetua del Software (pago único)', 'S/ 2,300.00'],
        ['Servicio de nube, base de datos y mantenimiento — Año 1 (incluido)', 'S/ 700.00'],
        ['TOTAL PRIMER AÑO (pago único al inicio)', 'S/ 3,000.00']
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
    para('A partir del segundo año, el Cliente abonará únicamente el Servicio Anual de Mantenimiento: S/ 700.00/año.');
    doc.moveDown(0.3);

    bold('4.2. Servicio Anual de Mantenimiento (S/ 700.00/año) incluye:');
    item('Hospedaje en la nube 24/7');
    item('Base de datos con copias de seguridad automáticas');
    item('Actualizaciones de Software y mejoras funcionales');
    item('Soporte técnico continuo');
    item('Mantenimiento de integraciones (SUNAT, WhatsApp)');

    doc.moveDown(0.3);
    bold('4.3. Condiciones de Pago:');
    item('El monto total del primer año (S/ 3,000.00) se abonará al momento de la firma del contrato.');
    item('Pagos del Servicio Anual: anualmente, con plazo de 15 días calendario.');
    item('Medios de pago: transferencia bancaria, depósito en cuenta o pago electrónico.');

    // ═══ TOKENS DALIA ═══
    sectionTitle('CLÁUSULA QUINTA: SERVICIO DE INTELIGENCIA ARTIFICIAL (DalIA)');
    para('El Plan Enterprise incluye acceso completo al asistente de inteligencia artificial DalIA, personalizado por rol de usuario. El servicio funciona mediante un sistema de tokens:');
    doc.moveDown(0.2);
    item('Asignación anual: 2,000,000 tokens (≈ 2,000 consultas)');
    item('Monitoreo en tiempo real desde Administrador → Gestión de Recursos → Tokens DalIA');
    item('Alerta automática al 90% de consumo');
    item('Tokens no acumulables — se reinician el 1 de enero de cada año');
    doc.moveDown(0.2);
    bold('Paquetes adicionales de tokens:');
    item('500,000 tokens: S/ 50.00');
    item('1,000,000 tokens: S/ 80.00');
    item('5,000,000 tokens: S/ 300.00');

    // ═══ IMPLEMENTACIÓN - TIMELINE ═══
    sectionTitle('CLÁUSULA SEXTA: IMPLEMENTACIÓN Y PUESTA EN MARCHA');
    para('dignita.tech ejecutará el proceso de implementación del Software en la Sede Principal del Cliente conforme al Plan de Implementación de Cinco (5) Días Hábiles (Anexo A), incluido en el precio del primer año sin costo adicional.');

    doc.moveDown(0.5);
    bold('TIMELINE DE IMPLEMENTACIÓN — 5 DÍAS HÁBILES');
    doc.moveDown(0.3);

    const timeline = [
        { dia: 'Día 1', fase: 'Configuración Inicial', detalle: 'Instalación en nube, configuración de marca, conexión SUNAT/NubeFact, creación de cuenta admin, prueba de acceso desde dispositivos.' },
        { dia: 'Día 2', fase: 'Carga de Datos', detalle: 'Carga del menú completo con fotos, configuración de mesas por zonas, carga de inventario/insumos, configuración de recetas.' },
        { dia: 'Día 3', fase: 'Personal y Operaciones', detalle: 'Creación de usuarios por rol, configuración de WhatsApp Business, métodos de pago, apertura/cierre de caja, prueba de flujo completo, alertas de stock.' },
        { dia: 'Día 4', fase: 'Capacitación por Roles', detalle: 'Administrador (2h), Mesero (1h), Cocinero (30min), Cajero (1h). Todo el personal capacitado y con acceso verificado.' },
        { dia: 'Día 5', fase: 'Apertura y Supervisión', detalle: 'Apertura oficial en operación real, supervisión presencial/remota, resolución de incidencias, firma del Acta de Entrega → inicio soporte prioritario 30 días.' }
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

    // ═══ CAPACITACIÓN ═══
    sectionTitle('CLÁUSULA SÉPTIMA: CAPACITACIÓN');
    para('dignita.tech proporcionará capacitación al personal del Cliente conforme al programa (Día 4 del Plan de Implementación), sin costo adicional. El Cliente podrá solicitar sesiones de recapacitación adicionales para personal nuevo; la primera dentro del primer año será sin costo.');

    // ═══ SLA ═══
    sectionTitle('CLÁUSULA OCTAVA: NIVEL DE SERVICIO (SLA)');
    para('dignita.tech garantiza un nivel de disponibilidad (uptime) del 99.5% mensual para la versión en la nube del Software. Esto equivale a un máximo de aproximadamente 3 horas y 36 minutos de inactividad no programada por mes.');
    doc.moveDown(0.3);
    bold('Créditos por incumplimiento del SLA:');
    item('99.0% - 99.4%: 10% de crédito');
    item('98.0% - 98.9%: 20% de crédito');
    item('Menos de 98.0%: 30% de crédito');
    doc.moveDown(0.3);
    bold('Copias de seguridad:');
    item('Copia diaria: retenida por 30 días');
    item('Copia semanal: retenida por 90 días');

    // ═══ SOPORTE ═══
    sectionTitle('CLÁUSULA NOVENA: SOPORTE TÉCNICO');
    bold('Soporte Prioritario Post-Implementación (primeros 30 días):');
    item('Canal: WhatsApp y acceso remoto');
    item('Horario: Lunes a sábado de 8:00 a.m. a 8:00 p.m. (hora de Lima)');
    item('Tiempo de respuesta: Máximo 4 horas hábiles');
    item('Sistema caído (crítico): Máximo 2 horas');

    doc.moveDown(0.3);
    bold('Soporte incluido en el Servicio Anual (a partir del día 31):');
    item('Crítica (sistema inoperativo): Máximo 2 horas');
    item('Alta (módulo no disponible): Máximo 4 horas');
    item('Media (funcionalidad parcialmente afectada): Máximo 24 horas');
    item('Baja (consultas, ajustes menores): Máximo 48 horas');

    // ═══ OBLIGACIONES ═══
    sectionTitle('CLÁUSULA DÉCIMA: OBLIGACIONES DE LAS PARTES');
    bold('Obligaciones de dignita.tech:');
    item('Otorgar la licencia de uso del Software conforme al presente Contrato.');
    item('Ejecutar el Plan de Implementación de acuerdo al Anexo A.');
    item('Garantizar la disponibilidad del Software según el SLA (99.5%).');
    item('Prestar soporte técnico según los términos acordados.');
    item('Mantener la confidencialidad de los Datos del Cliente.');
    item('Entregar actualizaciones y nuevas versiones sin costo adicional.');
    item('Cumplir con la Ley N.° 29733 de Protección de Datos Personales.');

    doc.moveDown(0.3);
    bold('Obligaciones del Cliente:');
    item('Abonar puntualmente los montos acordados.');
    item('Proporcionar oportunamente la información requerida para la implementación.');
    item('Utilizar el Software exclusivamente para los fines descritos.');
    item('Mantener la confidencialidad de las credenciales de acceso.');
    item('Notificar a dignita.tech ante cualquier incidencia de seguridad.');

    // ═══ PROPIEDAD INTELECTUAL ═══
    sectionTitle('CLÁUSULA DECIMOPRIMERA: PROPIEDAD INTELECTUAL');
    para('El Software MiRestconIA, su código fuente, arquitectura, algoritmos, bases de datos, diseños de interfaz, documentación técnica, el asistente DalIA y cualquier componente asociado son y permanecen siendo propiedad exclusiva de dignita.tech, protegidos por las leyes de propiedad intelectual del Perú (Decreto Legislativo N.° 822).');
    doc.moveDown(0.3);
    para('La licencia es: Personal, No exclusiva, Intransferible y Perpetua. Los Datos del Cliente son propiedad exclusiva del Cliente. El Cliente tiene derecho irrestricto de exportar todos sus datos en formatos estándar (PDF, Excel, CSV) en cualquier momento.');

    // ═══ CONFIDENCIALIDAD ═══
    sectionTitle('CLÁUSULA DECIMOSEGUNDA: CONFIDENCIALIDAD');
    para('Ambas partes se obligan a mantener en estricta confidencialidad toda información que reciban de la otra parte en el marco del presente Contrato. La obligación de confidencialidad subsistirá por un periodo de tres (3) años contados desde la fecha de terminación del presente Contrato.');

    // ═══ GARANTÍA ═══
    sectionTitle('CLÁUSULA DECIMOTERCERA: GARANTÍA DE SATISFACCIÓN');
    para('Si durante los primeros quince (15) días hábiles posteriores a la firma del Acta de Conformidad de Implementación, el Cliente reporta una falla crítica del Sistema y dignita.tech no proporciona una solución definitiva dentro de dicho plazo, el Cliente tendrá derecho a solicitar la devolución íntegra del monto pagado por el Servicio Anual de Mantenimiento (S/ 700.00), manteniendo vigente la licencia perpetua del Software.');

    // ═══ VIGENCIA ═══
    sectionTitle('CLÁUSULA DECIMOCUARTA: VIGENCIA Y TERMINACIÓN');
    para('La licencia de uso del Software es perpetua y no tiene fecha de vencimiento. El Servicio Anual de Mantenimiento tiene una vigencia inicial de un (1) año, renovándose automáticamente, salvo comunicación escrita con 30 días de anticipación.');
    doc.moveDown(0.2);
    bold('Efectos de la no renovación del Servicio Anual:');
    item('La licencia perpetua permanece vigente.');
    item('Se suspende el acceso a la nube y soporte.');
    item('El Cliente puede continuar usando el Software en modo local.');
    item('Los datos se retienen en la nube por 90 días para exportación.');

    // ═══ FACTURACIÓN SUNAT ═══
    sectionTitle('CLÁUSULA DECIMOQUINTA: FACTURACIÓN ELECTRÓNICA Y CUMPLIMIENTO TRIBUTARIO');
    para('El Software incluye módulo de facturación electrónica integrado con SUNAT a través de NubeFact. El Cliente es responsable de mantener vigente su certificado digital, cumplir con sus obligaciones tributarias, y verificar los comprobantes emitidos. Los costos del servicio de NubeFact (≈ S/ 40-70 mensuales) son responsabilidad del Cliente.');

    // ═══ LEY APLICABLE ═══
    sectionTitle('CLÁUSULA DECIMOSEXTA: LEY APLICABLE Y RESOLUCIÓN DE CONTROVERSIAS');
    para('El presente Contrato se rige por las leyes de la República del Perú. Las controversias se resolverán mediante negociación directa (15 días) y, de no resolverse, mediante arbitraje en el Centro de Arbitraje de la Cámara de Comercio de Lima.');

    // ═══ DISPOSICIONES GENERALES ═══
    sectionTitle('CLÁUSULA DECIMOSÉPTIMA: DISPOSICIONES GENERALES');
    para('El presente Contrato, junto con sus Anexos, constituye el acuerdo integral entre las partes. Cualquier modificación deberá constar por escrito y ser suscrita por ambas partes.');

    // ═══════════════════════════════════════════════════
    // FIRMAS
    // ═══════════════════════════════════════════════════
    checkPage(160);
    doc.moveDown(2);
    separator();
    doc.moveDown(0.5);

    bold('CLÁUSULA FINAL: DECLARACIÓN DE VOLUNTAD');
    doc.moveDown(0.3);
    para('Las partes declaran haber leído, comprendido y aceptado voluntariamente todas y cada una de las cláusulas del presente Contrato, manifestando que no existe vicio alguno que afecte su consentimiento.');

    doc.moveDown(2);

    const firmaY = doc.y;
    const midX = ml + pw / 2;

    // Líneas de firma
    doc.moveTo(ml + 10, firmaY).lineTo(ml + 200, firmaY).strokeColor('#333').lineWidth(0.8).stroke();
    doc.moveTo(midX + 10, firmaY).lineTo(midX + 200, firmaY).stroke();

    doc.fontSize(9).font('Helvetica-Bold').fillColor('#222');
    doc.text('POR DIGNITA.TECH (EL LICENCIANTE)', ml + 10, firmaY + 5, { width: 190, align: 'center' });
    doc.text('POR EL CLIENTE (EL LICENCIATARIO)', midX + 10, firmaY + 5, { width: 190, align: 'center' });

    doc.fontSize(8).font('Helvetica').fillColor('#555');
    doc.text('Leonidas Yauricasa', ml + 10, firmaY + 20, { width: 190, align: 'center' });
    doc.text('Representante Legal', ml + 10, firmaY + 30, { width: 190, align: 'center' });
    doc.text('DIGNITA TECH E.I.R.L.', ml + 10, firmaY + 40, { width: 190, align: 'center' });

    doc.text(nombre_cliente, midX + 10, firmaY + 20, { width: 190, align: 'center' });
    if (dni) doc.text(`DNI: ${dni}`, midX + 10, firmaY + 30, { width: 190, align: 'center' });
    if (ruc) doc.text(`RUC: ${ruc}`, midX + 10, firmaY + 40, { width: 190, align: 'center' });
    if (razon_social) doc.text(razon_social, midX + 10, firmaY + 50, { width: 190, align: 'center' });

    doc.moveDown(5);
    doc.fontSize(7).fillColor('#999').text(`Documento generado el ${fechaTexto} — MiRestconIA por dignita.tech`, { align: 'center' });
    doc.text('Documento firmado en dos (2) ejemplares originales de igual tenor y valor.', { align: 'center' });

    doc.end();
});

module.exports = router;
