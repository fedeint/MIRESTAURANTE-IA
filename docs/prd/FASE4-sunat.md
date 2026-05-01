# PRD: Fase 4 - Facturacion Electronica SUNAT
**Fecha**: 17 Marzo 2026 | **Estado**: COMPLETADO

---

## Tablas (migracion 005)
- `comprobantes_electronicos` - Boleta/factura/nota credito, XML, hash, QR, estado SUNAT
- `notas_credito` - Devoluciones y anulaciones
- `config_sunat` - RUC, series, OSE token, IGV %, produccion
- `facturas` - Campos: subtotal_sin_igv, igv, total_con_igv, tipo_comprobante, serie, correlativo, sunat_estado
- `clientes` - Campos: tipo_documento, numero_documento, email, razon_social

## Servicio services/sunat.js
- `calcularIGV()` - Descompone precio con IGV incluido (Peru: total/1.18)
- `validarRUC()` - Algoritmo modulo 11 (11 digitos)
- `validarDNI()` - 8 digitos
- `siguienteCorrelativo()` - Atomico por tipo
- `emitirComprobante()` - Flujo completo: calcula IGV → siguiente correlativo → guarda → envia a OSE
- `enviarAOSE()` - Integracion Nubefact (API REST)

## APIs routes/sunat.js
- GET `/sunat` - Vista config + historial comprobantes
- POST `/api/sunat/config` - Guardar config SUNAT
- POST `/api/sunat/emitir/:facturaId` - Emitir comprobante
- GET `/api/sunat/calcular-igv?total=X` - Calcular IGV
- GET `/api/sunat/validar-ruc/:ruc` - Validar RUC
- GET `/api/sunat/validar-dni/:dni` - Validar DNI
- GET `/api/sunat/comprobantes` - Historial con filtros

## Vista views/sunat.ejs
- Formulario config: RUC, series, OSE, IGV, produccion
- Tabla comprobantes con badges de estado

## Archivos
- `migrations/005_sunat.js`
- `services/sunat.js`
- `routes/sunat.js`
- `views/sunat.ejs`
- `server.js`
