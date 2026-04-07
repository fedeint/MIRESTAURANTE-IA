const express = require('express');
const router = express.Router();
const PDFDocument = require('pdfkit');
const crypto = require('crypto');
const path = require('path');
const fs = require('fs');
const db = require('../db');
const { sendNdaSigningLink } = require('../lib/mailer');

// GET /nda-equipo - Pagina del generador de NDA
router.get('/', (req, res) => {
    res.render('nda-equipo');
});

// GET /api/nda-equipo/lista - Listar NDAs
router.get('/lista', async (req, res) => {
    try {
        const [rows] = await db.query(
            `SELECT id, nro_nda, nombre_completo, cargo, dni, email, estado,
                    token, firmado_at, email_enviado_at, created_at
             FROM nda_equipo WHERE tenant_id = ? ORDER BY created_at DESC`,
            [req.tenantId || 1]
        );
        res.json(rows);
    } catch (err) {
        console.error('Lista NDA error:', err.message);
        res.status(500).json({ error: 'Error al obtener NDAs' });
    }
});

// POST /api/nda-equipo/generar - Generar PDF del NDA
router.post('/generar', async (req, res) => {
    try {
    const { nombre_completo, dni, email, telefono, cargo, area } = req.body;

    if (!nombre_completo || !dni) {
        return res.status(400).json({ error: 'Nombre y DNI son obligatorios' });
    }

    const hoy = new Date();
    const meses = ['enero','febrero','marzo','abril','mayo','junio','julio','agosto','septiembre','octubre','noviembre','diciembre'];
    const fechaTexto = `${hoy.getDate()} de ${meses[hoy.getMonth()]} de ${hoy.getFullYear()}`;

    // Generate nro_nda from DB sequence
    const [[seqRow]] = await db.query("SELECT nextval('nda_equipo_nro_seq') as seq");
    const seqVal = seqRow.seq;
    const nroNda = `NDA-${hoy.getFullYear()}${String(hoy.getMonth()+1).padStart(2,'0')}${String(hoy.getDate()).padStart(2,'0')}-${String(seqVal).padStart(4,'0')}`;

    const doc = new PDFDocument({ size: 'A4', margins: { top: 50, bottom: 50, left: 55, right: 55 }, bufferPages: true });

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

            const [[nda]] = await db.query(
                `INSERT INTO nda_equipo (tenant_id, nro_nda, nombre_completo, dni, email, telefono, cargo, area, pdf_original, pdf_hash, created_by, firma_page, firma_y)
                 VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
                 RETURNING id, token, nro_nda`,
                [req.tenantId||1, nroNda, nombre_completo, dni, email||null, telefono||null, cargo||null, area||null, pdfBuffer, pdfHash, req.session?.user?.id||null, firmaPage, firmaYForDb]
            );
            const baseUrl = `${req.protocol}://${req.get('host')}`;
            const link = `${baseUrl}/firmar/${nda.token}`;

            let emailEnviado = false;
            let emailReason = 'Sin email del miembro';
            if (email) {
                const result = await sendNdaSigningLink({ to: email, nombreCompleto: nombre_completo, nroNda: nda.nro_nda, link });
                emailEnviado = result.sent;
                emailReason = result.sent ? 'Enviado' : result.reason;
                if (emailEnviado) await db.query('UPDATE nda_equipo SET email_enviado_at = NOW() WHERE id = ?', [nda.id]);
            }
            res.json({ id: nda.id, token: nda.token, nro_nda: nda.nro_nda, link, email_enviado: emailEnviado, email_reason: emailReason });
        } catch (err) {
            console.error('Error guardando NDA:', err.message, err.stack);
            if (!res.headersSent) res.status(500).json({ error: 'Error al guardar NDA: ' + err.message });
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
    function numberedItem(num, text) {
        doc.fontSize(9.5).font('Helvetica').fillColor('#222').text(`  ${num}.  ${text}`, { lineGap: 1, align: 'justify' });
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
    heading('ACUERDO DE CONFIDENCIALIDAD', 18);
    heading('(Non-Disclosure Agreement — NDA)', 13);
    doc.moveDown(0.5);
    heading('UNILATERAL — PARA EQUIPO DE TRABAJO', 11);
    doc.moveDown(0.8);
    doc.moveTo(ml + 100, doc.y).lineTo(ml + pw - 100, doc.y).strokeColor('#FF6B35').lineWidth(2).stroke();
    doc.moveDown(0.8);
    heading('DIGNITA.TECH', 14);
    doc.fontSize(11).font('Helvetica').fillColor('#444').text('Proteccion de Informacion Confidencial', { align: 'center' });
    doc.moveDown(3);

    doc.fontSize(10).font('Helvetica').fillColor('#333');
    doc.text(`NDA N.° ${nroNda}`, { align: 'center' });
    doc.text(`Fecha de suscripcion: Lima, ${fechaTexto}`, { align: 'center' });
    doc.moveDown(4);

    doc.fontSize(9).fillColor('#888').text('Documento generado por MiRestconIA — dignita.tech', { align: 'center' });

    // ===================================================
    // PREAMBULO
    // ===================================================
    doc.addPage();
    para('Conste por el presente documento, el Acuerdo de Confidencialidad (en adelante, el "ACUERDO"), que se celebra de conformidad con lo establecido en la legislacion peruana vigente, en particular el Decreto Legislativo N° 823 (Ley de Propiedad Industrial), la Ley N° 29733 (Ley de Proteccion de Datos Personales) y demas normas aplicables, entre las siguientes partes:');

    // ===================================================
    // PARTE DIVULGANTE
    // ===================================================
    doc.moveDown(0.5);
    sectionTitle('PARTE DIVULGANTE');
    bold('Razon Social: DIGNITA.TECH');
    doc.moveDown(0.2);
    para('RUC: 20609709201');
    para('Representante Legal: Leonidas Yuri Yauri Villanueva');
    para('DNI: 73181738');
    doc.moveDown(0.3);
    para('En adelante, la "PARTE DIVULGANTE" o "LA EMPRESA".');

    // ===================================================
    // PARTE RECEPTORA
    // ===================================================
    doc.moveDown(0.5);
    sectionTitle('PARTE RECEPTORA');
    bold(`Nombre completo: ${nombre_completo}`);
    doc.moveDown(0.2);
    para(`DNI / Documento de Identidad: ${dni}`);
    para(`Cargo / Posicion: ${cargo || 'Miembro del Equipo'}`);
    if (area) para(`Area / Departamento: ${area}`);
    if (email) para(`Correo electronico: ${email}`);
    if (telefono) para(`Telefono: ${telefono}`);
    doc.moveDown(0.3);
    para('En adelante, la "PARTE RECEPTORA".');

    separator();

    // ===================================================
    // CLAUSULA PRIMERA: OBJETO
    // ===================================================
    sectionTitle('CLAUSULA PRIMERA: OBJETO');
    para('El presente Acuerdo tiene por objeto establecer los terminos y condiciones bajo los cuales LA PARTE RECEPTORA se compromete a mantener la confidencialidad de toda Informacion Confidencial a la que tenga acceso con motivo de su relacion laboral o de practicas profesionales en LA EMPRESA.');

    // ===================================================
    // CLAUSULA SEGUNDA: DEFINICION DE INFORMACION CONFIDENCIAL
    // ===================================================
    sectionTitle('CLAUSULA SEGUNDA: DEFINICION DE INFORMACION CONFIDENCIAL');
    para('Se entiende por "Informacion Confidencial" toda informacion, en cualquier formato o soporte (escrito, digital, verbal, visual u otro), que LA EMPRESA revele, proporcione o a la que LA PARTE RECEPTORA tenga acceso, incluyendo de manera enunciativa pero no limitativa:');
    doc.moveDown(0.3);

    numberedItem('a', 'Codigo fuente, algoritmos, arquitectura de software, bases de datos, disenos de sistemas y documentacion tecnica.');
    doc.moveDown(0.2);
    numberedItem('b', 'Modelos de negocio, estrategias comerciales, planes de marketing, informacion financiera y proyecciones economicas.');
    doc.moveDown(0.2);
    numberedItem('c', 'Datos personales de clientes, proveedores, colaboradores y cualquier tercero vinculado a LA EMPRESA.');
    doc.moveDown(0.2);
    numberedItem('d', 'Credenciales de acceso, claves API, configuraciones de servidores y cualquier informacion de seguridad informatica.');
    doc.moveDown(0.2);
    numberedItem('e', 'Metodologias de trabajo, procesos internos, herramientas propietarias y know-how tecnico.');
    doc.moveDown(0.2);
    numberedItem('f', 'Informacion de propiedad intelectual, incluyendo invenciones, marcas, nombres comerciales, disenos y cualquier creacion protegida.');
    doc.moveDown(0.2);
    numberedItem('g', 'Cualquier otra informacion que LA EMPRESA designe como confidencial, ya sea de forma expresa o que por su naturaleza deba entenderse como tal.');

    // ===================================================
    // CLAUSULA TERCERA: OBLIGACIONES DE LA PARTE RECEPTORA
    // ===================================================
    sectionTitle('CLAUSULA TERCERA: OBLIGACIONES DE LA PARTE RECEPTORA');
    para('LA PARTE RECEPTORA se obliga a:');
    doc.moveDown(0.3);

    numberedItem('1', 'Mantener en estricta reserva y confidencialidad toda la Informacion Confidencial, utilizando el mismo grado de cuidado que emplearia para proteger su propia informacion confidencial, pero en ningun caso con un estandar inferior al razonable.');
    doc.moveDown(0.2);
    numberedItem('2', 'No divulgar, publicar, transferir, copiar, reproducir ni comunicar la Informacion Confidencial a terceros, ya sea de forma directa o indirecta, sin la autorizacion previa y por escrito de LA EMPRESA.');
    doc.moveDown(0.2);
    numberedItem('3', 'Utilizar la Informacion Confidencial unicamente para los fines relacionados con las funciones asignadas por LA EMPRESA.');
    doc.moveDown(0.2);
    numberedItem('4', 'No almacenar Informacion Confidencial en dispositivos personales, cuentas de almacenamiento en la nube personales, o cualquier medio no autorizado expresamente por LA EMPRESA.');
    doc.moveDown(0.2);
    numberedItem('5', 'No publicar, compartir o hacer referencia a codigo fuente, capturas de pantalla, documentacion o cualquier material de LA EMPRESA en repositorios publicos, redes sociales, portafolios personales o plataformas de terceros sin autorizacion escrita previa.');
    doc.moveDown(0.2);
    numberedItem('6', 'Notificar inmediatamente a LA EMPRESA de cualquier uso no autorizado, perdida o divulgacion accidental de la Informacion Confidencial.');
    doc.moveDown(0.2);
    numberedItem('7', 'Devolver o destruir toda la Informacion Confidencial, incluyendo copias en cualquier formato, al termino de la relacion laboral o cuando LA EMPRESA lo solicite, lo que ocurra primero.');

    // ===================================================
    // CLAUSULA CUARTA: PROPIEDAD INTELECTUAL
    // ===================================================
    sectionTitle('CLAUSULA CUARTA: PROPIEDAD INTELECTUAL');
    para('Todo trabajo, desarrollo, codigo, diseno, documentacion, invencion, mejora o creacion de cualquier naturaleza que LA PARTE RECEPTORA realice durante y con ocasion de su relacion con LA EMPRESA sera de propiedad exclusiva de LA EMPRESA.');
    doc.moveDown(0.3);
    para('LA PARTE RECEPTORA renuncia expresamente a cualquier derecho patrimonial sobre dichas creaciones y se compromete a colaborar con LA EMPRESA en los tramites necesarios para el registro y proteccion de la propiedad intelectual que corresponda.');

    // ===================================================
    // CLAUSULA QUINTA: EXCEPCIONES
    // ===================================================
    sectionTitle('CLAUSULA QUINTA: EXCEPCIONES');
    para('No se considerara Informacion Confidencial aquella que:');
    doc.moveDown(0.3);

    numberedItem('a', 'Sea o se convierta en informacion de dominio publico sin que medie incumplimiento del presente Acuerdo.');
    doc.moveDown(0.2);
    numberedItem('b', 'Haya sido conocida por LA PARTE RECEPTORA con anterioridad a su divulgacion por LA EMPRESA, segun pueda demostrarse documentalmente.');
    doc.moveDown(0.2);
    numberedItem('c', 'Sea recibida legitimamente de un tercero sin obligacion de confidencialidad.');
    doc.moveDown(0.2);
    numberedItem('d', 'Deba ser revelada por mandato legal o requerimiento de autoridad competente, en cuyo caso LA PARTE RECEPTORA debera notificar previamente a LA EMPRESA.');

    // ===================================================
    // CLAUSULA SEXTA: VIGENCIA
    // ===================================================
    sectionTitle('CLAUSULA SEXTA: VIGENCIA');
    para('Las obligaciones de confidencialidad establecidas en el presente Acuerdo tendran una vigencia de cinco (5) anos contados a partir de la fecha de suscripcion del presente documento, independientemente de que la relacion laboral o las practicas profesionales finalicen antes de dicho plazo.');

    // ===================================================
    // CLAUSULA SEPTIMA: INCUMPLIMIENTO Y PENALIDADES
    // ===================================================
    sectionTitle('CLAUSULA SEPTIMA: INCUMPLIMIENTO Y PENALIDADES');
    para('El incumplimiento de cualquiera de las obligaciones establecidas en el presente Acuerdo facultara a LA EMPRESA a:');
    doc.moveDown(0.3);

    numberedItem('1', 'Dar por terminada la relacion laboral o las practicas profesionales de forma inmediata.');
    doc.moveDown(0.2);
    numberedItem('2', 'Iniciar las acciones legales civiles y/o penales que correspondan conforme a la legislacion peruana vigente.');
    doc.moveDown(0.2);
    numberedItem('3', 'Exigir el pago de una indemnizacion por los danos y perjuicios ocasionados, sin perjuicio de las demas acciones que le asistan por derecho.');

    // ===================================================
    // CLAUSULA OCTAVA: LEGISLACION APLICABLE Y JURISDICCION
    // ===================================================
    sectionTitle('CLAUSULA OCTAVA: LEGISLACION APLICABLE Y JURISDICCION');
    para('El presente Acuerdo se rige por las leyes de la Republica del Peru. Para la resolucion de cualquier controversia derivada del presente Acuerdo, las partes se someten a la jurisdiccion de los juzgados y tribunales competentes del distrito judicial correspondiente al domicilio de LA EMPRESA, renunciando expresamente a cualquier otro fuero que pudiera corresponderles.');

    // ===================================================
    // CLAUSULA NOVENA: DECLARACIONES
    // ===================================================
    sectionTitle('CLAUSULA NOVENA: DECLARACIONES');
    para('LA PARTE RECEPTORA declara haber leido integramente el presente Acuerdo, comprender su alcance y contenido, y suscribirlo de manera libre y voluntaria, sin que medie coaccion, error, dolo o cualquier otro vicio que invalide su consentimiento.');

    // ===================================================
    // FIRMAS
    // ===================================================
    checkPage(160);
    doc.moveDown(2);
    separator();
    doc.moveDown(0.5);

    bold('FIRMAS');
    doc.moveDown(0.3);
    para(`Fecha de suscripcion: Lima, ${fechaTexto}`);

    doc.moveDown(4);

    const firmaY = doc.y;
    const midX = ml + pw / 2;

    // Embed firma-dignita.png centered over the line, overlapping above and below
    const firmaPath = path.join(__dirname, '..', 'public', 'uploads', 'firma-dignita.png');
    if (fs.existsSync(firmaPath)) {
        doc.image(firmaPath, ml + 30, firmaY - 45, { fit: [150, 65] });
    }

    // Reset cursor to line position (image may have moved doc.y)
    doc.y = firmaY;

    // Save signature line position for firmar.js
    const firmaPage = doc.bufferedPageRange().count;
    const firmaYForDb = firmaY;

    // Lineas de firma
    doc.moveTo(ml + 10, firmaY).lineTo(ml + 200, firmaY).strokeColor('#333').lineWidth(0.8).stroke();
    doc.moveTo(midX + 10, firmaY).lineTo(midX + 200, firmaY).stroke();

    doc.fontSize(9).font('Helvetica-Bold').fillColor('#222');
    doc.text('POR LA EMPRESA (PARTE DIVULGANTE)', ml + 10, firmaY + 5, { width: 190, align: 'center' });
    doc.text('PARTE RECEPTORA', midX + 10, firmaY + 5, { width: 190, align: 'center' });

    doc.fontSize(8).font('Helvetica').fillColor('#555');
    doc.text('Leonidas Yuri Yauri Villanueva', ml + 10, firmaY + 20, { width: 190, align: 'center' });
    doc.text('DNI: 73181738', ml + 10, firmaY + 30, { width: 190, align: 'center' });
    doc.text('Representante Legal', ml + 10, firmaY + 40, { width: 190, align: 'center' });
    doc.text('DIGNITA.TECH', ml + 10, firmaY + 50, { width: 190, align: 'center' });

    doc.text(nombre_completo, midX + 10, firmaY + 20, { width: 190, align: 'center' });
    doc.text(`DNI: ${dni}`, midX + 10, firmaY + 30, { width: 190, align: 'center' });
    if (cargo) doc.text(cargo, midX + 10, firmaY + 40, { width: 190, align: 'center' });

    doc.moveDown(5);
    doc.fontSize(7).fillColor('#999').text(`Documento generado el ${fechaTexto} — MiRestconIA por dignita.tech`, { align: 'center' });
    doc.text('Documento firmado en dos (2) ejemplares originales de igual tenor y valor.', { align: 'center' });

    doc.end();
    } catch (err) {
        console.error('Error generando NDA:', err.message, err.stack);
        if (!res.headersSent) res.status(500).json({ error: 'Error al generar NDA: ' + err.message });
    }
});

// POST /api/nda-equipo/:id/reenviar - Reenviar email de firma
router.post('/:id/reenviar', async (req, res) => {
    try {
        const [rows] = await db.query(
            'SELECT id, token, nro_nda, nombre_completo, email, estado FROM nda_equipo WHERE id = ? AND tenant_id = ?',
            [req.params.id, req.tenantId || 1]
        );
        if (!rows.length) return res.status(404).json({ error: 'NDA no encontrado' });
        const c = rows[0];
        if (!c.email) return res.status(400).json({ error: 'El miembro no tiene email registrado' });
        const baseUrl = `${req.protocol}://${req.get('host')}`;
        const link = `${baseUrl}/firmar/${c.token}`;
        const ok = await sendNdaSigningLink({ to: c.email, nombreCompleto: c.nombre_completo, nroNda: c.nro_nda, link });
        if (ok.sent) await db.query('UPDATE nda_equipo SET email_enviado_at = NOW() WHERE id = ?', [c.id]);
        res.json({ ok: ok.sent, message: ok.sent ? 'Email reenviado' : 'Error al enviar email' });
    } catch (err) {
        console.error('Reenviar NDA error:', err.message);
        res.status(500).json({ error: 'Error al reenviar' });
    }
});

// GET /api/nda-equipo/:id/descargar/:tipo - Descargar PDF original o firmado
router.get('/:id/descargar/:tipo', async (req, res) => {
    try {
        const col = req.params.tipo === 'firmado' ? 'pdf_firmado' : 'pdf_original';
        const [rows] = await db.query(
            `SELECT ${col}, nro_nda, nombre_completo FROM nda_equipo WHERE id = ? AND tenant_id = ?`,
            [req.params.id, req.tenantId || 1]
        );
        if (!rows.length || !rows[0][col]) return res.status(404).json({ error: 'PDF no encontrado' });
        const c = rows[0];
        res.setHeader('Content-Type', 'application/pdf');
        res.setHeader('Content-Disposition', `attachment; filename="NDA_${c.nro_nda}_${req.params.tipo}.pdf"`);
        res.send(c[col]);
    } catch (err) {
        console.error('Descargar NDA error:', err.message);
        res.status(500).json({ error: 'Error al descargar' });
    }
});

module.exports = router;
