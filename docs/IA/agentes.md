# Agentes especializados

Además de DalIA (gerente general), el sistema tiene agentes con foco específico que comparten el mismo motor LLM pero usan prompts y contextos distintos.

---

## 🛡️ Salva — Guardián de caja

**Rol**: vigila el dinero del restaurante y alerta sobre anomalías de caja.

**Dónde vive**:
- Prompt: `routes/chat.js:95-127` (`buildSalvaBlock`)
- Backend: `routes/alertas-salva.js`
- Se activa cuando se abre el chat desde `/caja` con `?agent=salva`

**Tono**: directo, protector, "como un contador de confianza".

**Prioridades de respuesta** (en orden):
1. Si caja cerrada → recordar abrirla antes de operar
2. Diferencias entre efectivo esperado vs real → alerta inmediata
3. Ventas por debajo de meta → sugerir acciones
4. Stock crítico que afecta ventas → mencionar
5. Todo bien → confirmar y sugerir siguiente paso

**Capacidades**:
- Analiza movimientos de caja en busca de inconsistencias
- Alerta sobre metas no alcanzadas
- Proporciona resúmenes: ingresos vs egresos, efectivo esperado vs real
- Sugiere acciones concretas ante problemas

---

## 🐬 Delfino — Brief SOSTAC

**Rol**: agente estratégico que guía al dueño a completar su brief SOSTAC (Situación, Objetivos, Estrategia, Tácticas, Acción, Control).

**Dónde vive**:
- Backend: `routes/sostac.js`
- Vistas: `views/sostac/*.ejs`
- Ruta pública: `/sostac/brief`

**Para qué**: recolecta datos estratégicos del negocio que luego alimentan a DalIA como contexto (tabla `sostac_briefs`).

---

## 🧭 DalIA Onboarding

**Rol**: guía el alta del restaurante la primera vez.

**Dónde vive**:
- Backend: `routes/onboarding-dallia.js`
- Vista: `views/onboarding-dallia.ejs`

**Calcula** automáticamente `modo_sistema` (ultra_simple, pequeño, mediano, grande) y qué módulos habilitar según número de personal y régimen tributario (informal, NRUS, RER, etc.). Ver `computarModo()` en el router.

---

## 🚀 Roadmap multi-agente (V2)

Según la memoria del proyecto (`project_agentes_ia_sostac`), la arquitectura futura es:

```
                 ┌────────────────┐
                 │  DalIA (CEO)   │  ← interfaz única con el dueño
                 │   gerente      │
                 └───────┬────────┘
                         │ delega
       ┌─────────┬───────┼────────┬────────────┐
       ▼         ▼       ▼        ▼            ▼
   ┌──────┐  ┌──────┐ ┌──────┐  ┌──────┐   ┌──────┐
   │Forge │  │Atlas │ │ Vega │  │Pulse │   │Salva │
   │produ-│  │ops   │ │finan-│  │mkt   │   │caja  │
   │cto   │  │      │ │zas   │  │      │   │ ✅   │
   └──────┘  └──────┘ └──────┘  └──────┘   └──────┘
```

- **Delfino** (SOSTAC) ya existe ✅
- **Salva** (caja) ya existe ✅
- **Forge / Atlas / Vega / Pulse** → pendientes, diseño en `el real analisi/`

Todos comparten el SOSTAC del negocio como "cerebro estratégico" común.

---

## 📝 Cómo agregar un agente nuevo

1. Definir su bloque de prompt en `routes/chat.js` (como `buildSalvaBlock`).
2. Detectar activación vía query param (`?agent=nombre`) o contexto (`from=/ruta`).
3. Inyectarlo al inicio del system prompt antes de la identidad DalIA base.
4. Si necesita acciones ejecutables → crear handler en `services/dallia-actions/`.
5. Si necesita datos específicos del negocio → extender `services/knowledge-base.js`.
