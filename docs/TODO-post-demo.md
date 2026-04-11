# TODO Post-Demo — MiRestcon IA

Demo completada: 2026-04-11 13:00
Scope de la demo: PWA operativo completo (cocina, caja, mesas, pedidos, más, chat, wizard)

---

## Impresora térmica (stub → real)

- `services/printer.js` está en modo stub (solo loguea)
- Implementar driver ESC/POS real vía USB o red (Bixolon, Epson TM-series)
- Agregar columna `tenants.impresora_cocina_activa BOOLEAN` para habilitar por tenant
- Referencia: `routes/cocina.js` → `printer.printKitchenTicket()`

---

## Automatizaciones DalIA (30 de 100 planeadas)

- Solo las automatizaciones básicas están activas para la demo
- 70 restantes documentadas en `services/dallia-actions/` — scaffold listo
- Prioridad post-demo: alertas proactivas de meta diaria, reposición automática de stock, resumen nocturno por WhatsApp

---

## Módulos placeholder en Más → implementar

| Módulo | Ruta actual | Prioridad |
|--------|------------|-----------|
| Proveedores Hub | `/proximamente?feature=Proveedores-Hub` | Alta |
| Finanzas Pro | `/proximamente?feature=Finanzas` | Alta |
| Pronósticos | `/proximamente?feature=Pronosticos` | Media |
| Memoria DalIA | `/proximamente?feature=MemoriaDalIA` | Media |
| Plantillas mensajes | `/proximamente?feature=PlantillasMensajes` | Media |
| Metas | `/proximamente?feature=Metas` | Media |
| Impresora térmica config | `/proximamente?feature=ImpresoraTermica` | Media |
| Cursos | `/proximamente?feature=Cursos` | Baja |
| Landing Page | `/proximamente?feature=Landing` | Baja |
| Influencer IA | `/proximamente?feature=InfluencerIA` | Baja |
| Flyers IA | `/proximamente?feature=FlyersIA` | Baja |
| Modo Nocturno | `/proximamente?feature=ModoNocturno` | Baja |
| Apps compatibles | `/proximamente?feature=AppsCompatibles` | Baja |
| APIs externas | `/proximamente?feature=APIsExternas` | Baja |

---

## Agente Salva (notificaciones proactivas de caja)

- La card "DalIA cuida tu dinero" en Caja PWA ya enlaza a `/chat?agent=salva&contexto=caja`
- El backend no diferencia `agent=salva` todavía — DalIA responde igual para todos los agentes
- Post-demo: inyectar contexto de caja en el system prompt cuando `agent=salva`
- 3 variantes de DalIA pendientes de implementar: Chat Mejorado (`34uYf`), Voice Orb (`XsmSo`), Voice Inline (`MgNv7`)

---

## Agentes IA especializados (diagrama `el real analisi/`)

Agentes planificados en el diagrama Delfino/Forge/Atlas/Vega/Pulse/Horizonte/Arsenal/CDDO:
- **Delfino** — SOSTAC brief ya implementado (`routes/sostac.js`) ✅
- **Forge** — generación de contenido (flyers, posts)
- **Atlas** — análisis geográfico y competencia
- **Vega** — predicciones de demanda
- **Pulse** — monitoreo en tiempo real
- **Horizonte** — planificación estratégica
- **Arsenal** — gestión de herramientas y automatizaciones
- **CDDO** — orquestador central de agentes

---

## DalIA Memoria y contexto persistente

- Historial actual: últimos 30 mensajes por tenant en `dallia_mensajes`
- Post-demo: memoria semántica con embeddings (vectorstore por tenant)
- Contexto de negocio inyectado automáticamente (ventas del día, stock crítico, metas)

---

## CSP hardening (V2)

- `scriptSrcAttr: 'unsafe-inline'` está activo temporalmente
- Migrar vistas con `onclick=` inline a `addEventListener` (boveda, cocina, etc.)
- Activar `frameguard` en producción
- Migrar `csurf` → `csrf-csrf`

---

## CSRF protección de formularios

- `csurf` está deprecated (prototype pollution vuln)
- Reemplazar por `csrf-csrf` en todas las rutas POST de formularios
- Ver sección de seguridad en `CLAUDE.md`

---

## Brute force lockout → Redis

- Sistema de lockout actual usa in-memory Map en `routes/auth.js`
- En producción con múltiples instancias Vercel, el Map no es compartido
- Migrar a Redis (Upstash o similar) para lockout cross-instance

---

## Setup Wizard — persistencia en DB

- Actualmente usa `localStorage` para tracking de tour completado
- Post-demo: conectar con `tenants.setup_completado` (columna ya existe vía `add_setup_progress.sql`)
- Agregar redirect middleware en login: si admin móvil y `!setup_completado` → `/setup-pwa`

---

## Impresora + Descuento — pruebas de integración

- `POST /mesa/descuento/validar` no tiene tests automatizados
- Agregar a test suite junto con el flujo completo de cobro con descuento
- Agregar tests para `services/printer.js` cuando se implemente el driver real

---

## Visual regression tests (post-demo)

- Comparar screenshots de producción contra nodeIds del `UI.DELSISTEMA.pen`
- Nodos pendientes de verificar: `aIXUc` (Cocina), `0U42d` (Caja), `34uYf` (Chat)
- Herramienta: `mcp__pencil__get_screenshot` + Playwright side-by-side diff
