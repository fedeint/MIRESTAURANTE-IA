# Plan de Mejoras SaaS - dignita.tech
## Fecha: 18 Marzo 2026
## Instalación cliente: HOY 11:45-12:00

---

## PRIORIDAD 0: CRITICO PARA ONBOARDING HOY (antes de las 11:45)

### 0.1 Datos de demostración
- [ ] Subir 40 comidas peruanas con imágenes, precios y categorías
- [ ] Crear especias/insumos para 20 platos diferentes en almacén
- [ ] Crear recetas (vincular insumos con platos)
- [ ] Crear 40 mesas
- [ ] Crear usuarios por rol:
  - Mozo: acceso a Mesas, Cocina, Productos
  - Cocinero: acceso a Cocina
  - Cajero: acceso a Caja, Facturación, Ventas
  - Almacenero: acceso a Almacén, alertas
- [ ] Personalizar dashboard de DalIA por rol (saludo + tareas)

### 0.2 Fix velocidad mínima
- [ ] Verificar que caja funcione en producción (fix booleans)
- [ ] Verificar navegación completa sin errores en Vercel

---

## PRIORIDAD 1: SEMANA 1 (Post-instalación)

### 1.1 Modo Offline/Local
**Problema**: La luz se va ~15 veces al año. El restaurante necesita seguir operando.

**Solución investigada**: Progressive Web App (PWA) + Service Worker + IndexedDB local
- Service Worker cachea la app completa (HTML, CSS, JS, vistas)
- IndexedDB almacena pedidos, items, mesas mientras no hay internet
- Al volver la conexión: sincronización automática con Supabase
- Proyectos de referencia: PouchDB/CouchDB sync, Workbox de Google

**Implementación**:
- [ ] Service Worker con estrategia Cache-First para assets, Network-First para APIs
- [ ] IndexedDB para almacenar operaciones pendientes (pedidos, facturas, movimientos)
- [ ] Cola de sincronización: al detectar conexión, sube todo en orden
- [ ] Indicador visual: banner "Sin conexión - modo local" / "Sincronizando..."
- [ ] Conflictos: timestamp-based, última escritura gana + log de conflictos

### 1.2 Velocidad (Cloudflare + optimizaciones)
- [ ] Cloudflare CDN: cachear assets estáticos (CSS, JS, imágenes, fuentes)
- [ ] Cloudflare Workers: edge caching para páginas frecuentes
- [ ] Comprimir respuestas: gzip/brotli en Vercel (ya incluido)
- [ ] Lazy loading de imágenes de productos
- [ ] Minificar CSS/JS en producción
- [ ] Connection pooling optimizado (PgBouncer de Supabase)
- [ ] Reducir cold starts: keep-alive con cron job cada 5 min

### 1.3 Rediseño de Carta/Productos (vista mozo)
Basado en el ejemplo enviado:
- [ ] Grid de productos con imágenes grandes, nombre, categoría, precio
- [ ] Sidebar de categorías: Frecuentes & Populares, Platos de fondo, Bebidas, Postres, Otros
- [ ] Buscador de productos arriba
- [ ] Click en producto = agregar al pedido (borde verde + badge cantidad)
- [ ] Barra inferior sticky: "X productos agregados · Total S/XX.XX" + "Continuar con la orden"
- [ ] Sin perder: mover mesa, enviar cocina, facturar todo, dividir cuentas

---

## PRIORIDAD 2: SEMANA 2

### 2.1 SUNAT - Facturación Electrónica
**Investigar**:
- APIs de SUNAT (OSE/PSE) para boletas y facturas electrónicas
- Proyectos open source: github.com/thelounge/sunat-facturacion, nubefact API
- UBL 2.1 XML format para comprobantes
- Certificado digital (.pfx) del cliente

**Implementar**:
- [ ] Generar XML UBL 2.1 para boletas/facturas
- [ ] Firmar con certificado digital
- [ ] Enviar a SUNAT vía OSE (Nubefact, Efact, o directo)
- [ ] Recibir CDR (Constancia de Recepción)
- [ ] Almacenar comprobantes con serie y correlativo
- [ ] PDF/ticket con QR de validación SUNAT

### 2.2 WhatsApp - Envío de facturas
- [ ] Integración con WhatsApp Business API (Meta Cloud API)
- [ ] O alternativa: Twilio WhatsApp API
- [ ] Flujo: Facturar → generar PDF → enviar por WhatsApp al número del cliente
- [ ] Template de mensaje aprobado por Meta
- [ ] Link de verificación SUNAT en el mensaje

---

## PRIORIDAD 3: SEMANA 3-4

### 3.1 Panel Super-Admin SaaS
Dashboard para ti (Leonidas) donde puedas:
- [ ] CRUD de restaurantes/tenants (crear, activar, desactivar, cambiar plan)
- [ ] Ver métricas de todos los restaurantes (facturas, usuarios, mesas)
- [ ] Habilitar/deshabilitar módulos por tenant
- [ ] Gestionar suscripciones y planes (free/pro/enterprise)
- [ ] Onboarding automático: crear subdominio + primer admin + datos demo

### 3.2 Contabilidad del SaaS
- [ ] Control de costos: Supabase, Vercel, APIs (Anthropic, WhatsApp, SUNAT)
- [ ] Ingresos por tenant (suscripciones)
- [ ] P&L del SaaS
- [ ] Alertas de uso (límites de plan, consumo de APIs)
- [ ] Dashboard financiero con gráficos

### 3.3 Permisos granulares por rol
Cada rol ve un dashboard personalizado:

**Mozo**:
- DalIA saluda: "Hoy tienes 8 mesas asignadas. Recuerda sonreír!"
- Tareas: limpiar mesas, verificar pedidos pendientes, cobros pendientes
- Solo ve: Mesas, Cocina, Productos (vista catálogo)

**Cocinero**:
- DalIA saluda: "Hay 3 pedidos en cola. El más antiguo tiene 5 min"
- Tareas: revisar stock de ingredientes del día, priorizar pedidos
- Solo ve: Cocina

**Cajero**:
- DalIA saluda: "La caja lleva S/1,200 hoy. 15 facturas emitidas"
- Tareas: verificar cierre, arqueo, cuadrar efectivo
- Solo ve: Caja, Facturación, Ventas del día

**Almacenero**:
- DalIA saluda: "5 insumos bajo mínimo. Revisa antes del servicio"
- Tareas: registrar entradas, verificar proveedores, contar stock
- Solo ve: Almacén, alertas de compra

---

## ARQUITECTURA OFFLINE/ONLINE

```
┌─────────────────────────────────────────────┐
│              BROWSER (PWA)                   │
│  ┌─────────┐  ┌──────────┐  ┌────────────┐ │
│  │ Service  │  │ IndexedDB│  │ Sync Queue │ │
│  │ Worker   │  │ (local)  │  │ (pendiente)│ │
│  └────┬─────┘  └─────┬────┘  └─────┬──────┘ │
│       │              │              │        │
│       ▼              ▼              ▼        │
│  ┌─────────────────────────────────────────┐ │
│  │         SYNC MANAGER                     │ │
│  │  - Detecta conexión (online/offline)     │ │
│  │  - Cola FIFO de operaciones              │ │
│  │  - Retry con backoff exponencial         │ │
│  │  - Resolución de conflictos              │ │
│  └──────────────────┬──────────────────────┘ │
└─────────────────────┼───────────────────────┘
                      │ HTTPS
                      ▼
┌─────────────────────────────────────────────┐
│            VERCEL (Serverless)               │
│  ┌──────────┐  ┌───────────┐                │
│  │ Express  │  │ Cloudflare│                │
│  │ API      │──│ CDN/Cache │                │
│  └────┬─────┘  └───────────┘                │
│       │                                      │
│       ▼                                      │
│  ┌──────────────────────────────────────┐   │
│  │       SUPABASE (PostgreSQL)           │   │
│  │  - Datos persistentes                 │   │
│  │  - Row Level Security (multi-tenant)  │   │
│  │  - Real-time subscriptions            │   │
│  │  - Auth + Storage                     │   │
│  └──────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

---

## RESUMEN DE TIEMPOS

| Fase | Qué | Cuándo |
|------|-----|--------|
| P0 | Datos demo + fix producción | HOY |
| P1.1 | Modo offline (PWA + sync) | Semana 1 |
| P1.2 | Velocidad (CDN + optimización) | Semana 1 |
| P1.3 | Rediseño carta mozo | Semana 1 |
| P2.1 | SUNAT facturación electrónica | Semana 2 |
| P2.2 | WhatsApp facturas | Semana 2 |
| P3.1 | Panel Super-Admin | Semana 3 |
| P3.2 | Contabilidad SaaS | Semana 3-4 |
| P3.3 | Permisos granulares | Semana 3-4 |
