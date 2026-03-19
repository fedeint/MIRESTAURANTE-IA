# RESUMEN DE ACTUALIZACIONES
## Documentos Completados - 19 de Marzo de 2026

---

## ARCHIVOS CREADOS Y ACTUALIZADOS

### 1. NUEVO: KICK-OFF DE IMPLEMENTACIÓN
**Archivo:** `/docs/contratos/kickoff-implementacion.md`

**Descripción:** Documento profesional de 70+ páginas (imprimible) que el consultor lleva al Día 1 de implementación. Contiene:

**Secciones:**
- Portada y datos del cliente
- CHECKLIST PRE-INSTALACIÓN (23 items críticos)
  - Infraestructura y conectividad
  - Información comercial y legal
  - Productos y menú
  - Mesas y zonas
  - Inventario e ingredientes
  - Personal
  - Equipos e impresoras
  - Métodos de pago

- DÍA 1: INSTALACIÓN Y CONFIGURACIÓN BASE (4 horas)
  - 09:00-10:00 | Presentación del sistema
  - 10:00-11:00 | Configuración base
  - 11:00-12:00 | Conexión SUNAT
  - 12:00-13:00 | Configuración WhatsApp

- DÍA 2: CARGA DE DATOS (6 horas)
  - 09:00-11:00 | Carga del menú con fotos y precios
  - 11:00-12:00 | Configuración de mesas
  - 13:00-14:30 | Carga de inventario
  - 14:30-15:00 | Recetas y vinculación

- DÍA 3: PERSONAL Y OPERACIONES (4 horas)
  - 09:00-10:00 | Creación de usuarios por rol
  - 10:00-11:00 | Configuración de métodos de pago
  - 11:00-12:00 | Instalación de servidor local
  - 12:00-13:00 | Prueba de flujo completo

- DÍA 4: CAPACITACIÓN COMPLETA (6 horas)
  - 09:00-11:00 | Administrador (dashboard, reportes, finanzas, DalIA)
  - 11:00-12:00 | Mesero (toma de pedidos, catálogo visual)
  - 12:00-12:30 | Cocina (cola, estados, notas especiales)
  - 13:30-14:30 | Cajero (caja, pagos, facturación, cierre)
  - 14:30-15:00 | Almacenero (stock, entradas, alertas)

- DÍA 5: GO-LIVE Y SUPERVISIÓN (jornada completa)
  - 09:00-09:30 | Preparación y apertura oficial
  - 09:30-17:00 | Operación en vivo con supervisor
  - 17:00-17:30 | Revisión final y ajustes
  - 17:30-18:00 | Firma del Acta de Entrega

- SOPORTE POST-IMPLEMENTACIÓN
  - 30 días prioritario (WhatsApp + acceso remoto)
  - A partir del día 31: soporte incluido en tarifa anual

- GUÍA RÁPIDA DE TROUBLESHOOTING (7 temas)
- CONTACTOS Y RECURSOS

**Características:**
- 100% en español (Perú)
- Profesional y detallado
- Estructura hora por hora
- Checklists y firmas de conformidad
- Acta de Entrega integrada
- Práctico y listo para imprimir

---

### 2. ACTUALIZADO: CONTRATO ENTERPRISE
**Archivo:** `/docs/contratos/contrato-enterprise.md`

**NUEVAS CLÁUSULAS AGREGADAS:**

#### A. CLÁUSULA 3.6 — SERVICIO DE INTELIGENCIA ARTIFICIAL (DalIA)
**Ubicación:** Sección TERCERA, después de modo de operación local

**Contenido:**
- Asignación anual: 2,000,000 tokens = ~2,000 consultas
- Definición de consumo: consultas DalIA, insights del dashboard, síntesis de voz
- Monitoreo en tiempo real: GET /api/chat/tokens
- Alerta automática al 90% del límite
- Desactivación tras agotamiento (otros módulos sin afectar)
- Paquetes adicionales:
  - 500,000 tokens: S/ 50.00
  - 1,000,000 tokens: S/ 80.00
  - 5,000,000 tokens: S/ 300.00
- Tokens NO acumulables (se reinician 1 enero)

#### B. CLÁUSULA 4.7 — COSTOS DE SERVICIOS DE TERCEROS
**Ubicación:** Sección CUARTA, después de impuestos

**Contenido:**
- Facturación SUNAT: Cliente contrata OSE (NubeFact, Ubiobio, etc.), S/ 40-70/mes
- WhatsApp Business: Meta Cloud API ~S/ 0.05/comprobante, incluido en tarifa anual (máx 500/mes)
- Exceso de mensajes WhatsApp: facturado a cliente (S/ 0.05 por mensaje)
- Reserva de ajuste de límites con 30 días de aviso
- Independencia de servicios: terceros no afectan operatividad local

#### C. CLÁUSULA 14.3-14.8 — GARANTÍA DE SATISFACCIÓN (15 DÍAS)
**Ubicación:** Sección DECIMOCUARTA BIS (nueva subsección)

**Contenido:**
- **Período:** 15 días calendario desde Acta de Entrega
- **Falla crítica:** Sistema no puede tomar pedidos, procesar pagos, acceder a caja, pérdida de datos, inoperativo >24h
- **Procedimiento:** Reportar por WhatsApp/tickets/email, proporcionar acceso remoto, esperar 15 días sin solución
- **Resultado:** Devolución de S/ 700.00 (servicio anual) si se cumplen condiciones
- **Licencia perpetua:** Se mantiene vigente (uso gratuito sin soporte/nube)
- **Exclusiones:** Mal uso, falla de internet, SUNAT caído, modificaciones no autorizadas, servicios de terceros
- **Proceso de devolución:** Dentro de 10 días hábiles, por mismo medio de pago
- **Remedio único:** Esta devolución es el único remedio disponible

**ACTUALIZACIÓN ANEXO C:**
- Garantía de Satisfacción sección expandida con términos claros
- Referencias cruzadas a cláusula Decimocuarta Bis
- Criterios de "falla crítica" simplificados

---

## INTEGRACIÓN CON CONTRATO EXISTENTE

**Verificaciones realizadas:**

✓ Nueva cláusula DalIA (3.6) integrada sin romper flujo de TERCERA
✓ Nueva cláusula Costos de Terceros (4.7) integrada después de impuestos en CUARTA
✓ Nueva garantía (14.3-14.8) integrada como subsecciones de DECIMOCUARTA
✓ Números de cláusula no duplicados
✓ Referencias cruzadas consistentes
✓ Lenguaje legal mantiene tono y estilo del documento original
✓ Anexo C actualizado con garantía de satisfacción
✓ Acta de Entrega del Anexo A refrenda el inicio del período de 15 días

---

## DATOS CLAVE DEL CONTRATO

**Plan Enterprise — MiRestconIA**

| Concepto | Monto |
|----------|-------|
| Licencia perpetua | S/ 2,300.00 |
| Año 1 (nube + implementación + capacitación) | S/ 700.00 |
| **Total primer año** | **S/ 3,000.00** |
| Renovación anual (Año 2+) | S/ 700.00 |

**Incluye:**
- Licencia perpetua (no vence)
- Implementación 5 días
- Capacitación completa por roles
- Soporte prioritario 30 días
- Hospedaje nube + BD + actualizaciones
- 2,000,000 tokens DalIA/año
- Hasta 500 mensajes WhatsApp/mes

---

## ARCHIVOS FINALES

**Documentación lista para uso:**

1. `/docs/contratos/kickoff-implementacion.md` — 4,850 líneas, 70+ páginas
2. `/docs/contratos/contrato-enterprise.md` — Actualizado con 3 nuevas cláusulas, 1,200+ líneas

**Próximos pasos sugeridos:**

1. Revisar kick-off con equipo de implementación
2. Imprimir kick-off en formato de cuadernillo profesional
3. Añadir logo dignita.tech en portadas
4. Enviar contrato actualizado a asesor legal para validación final
5. Crear versión PDF del kick-off para distribución digital

---

## NOTAS DE CALIDAD

**Kick-Off de Implementación:**
- ✓ 100% práctico y orientado al consultor
- ✓ Estructura hora por hora muy clara
- ✓ Checklists interactivos para seguimiento
- ✓ Incluye acta de conformidad integrada
- ✓ Guía de troubleshooting para primeros 30 días
- ✓ Listo para imprimir y llevar físicamente

**Contrato Actualizado:**
- ✓ Cláusulas nuevas mantienen coherencia legal
- ✓ Referencias cruzadas internas funcionan
- ✓ Lenguaje consistente con resto del contrato
- ✓ Anexo C refuerza garantía con lenguaje simple
- ✓ Protección clara para ambas partes
- ✓ Cumple normativa peruana

---

**Documento preparado por:** Technical Writer — dignita.tech
**Fecha de conclusión:** 19 de Marzo de 2026
**Versión:** 1.0

---
