# 🤖 IA del Sistema — MiRest con IA

Resumen completo de la inteligencia artificial del proyecto. DalIA es la asistente principal; alrededor viven agentes especializados (Salva, Delfino) y un runtime de acciones ejecutables.

## Contenido

1. [**arquitectura.md**](./arquitectura.md) — Archivos clave, flujo técnico, proveedores LLM, base de datos.
2. [**dallia-personalidad.md**](./dallia-personalidad.md) — Identidad, system prompt, estilo, reglas de conversación.
3. [**tareas-y-acciones.md**](./tareas-y-acciones.md) — Qué puede responder, qué puede **ejecutar** (DalIA Actions), detectores de intención.
4. [**roles-y-permisos.md**](./roles-y-permisos.md) — Qué ve/no ve cada rol (administrador, mesero, cocinero, cajero).
5. [**agentes.md**](./agentes.md) — Salva (caja), Delfino (SOSTAC), y roadmap multi-agente.

## En una frase

> DalIA es una asistente conversacional peruana que conoce el negocio del usuario en tiempo real, responde en el idioma y tono del dueño, y puede **proponer + ejecutar acciones reales** (enviar pedido a proveedor, avisar vencimientos, resumen de cierre, recordatorio de caja, meta alcanzada) con aprobación del usuario.

## Entrada rápida al código

| Lo que buscas | Archivo |
|---|---|
| System prompt DalIA | `routes/chat.js:129-309` |
| Wrapper LLM (Claude/Kimi) | `lib/llm.js` |
| Runtime de acciones | `services/dallia-actions.js` |
| Handlers de acciones | `services/dallia-actions/*.js` |
| Contexto del negocio | `services/knowledge-base.js` |
| Chat UI (PWA) | `views/chat.ejs`, `views/dallia-chat.ejs` |
| Agente Salva (caja) | `routes/alertas-salva.js` + `chat.js:95-127` |
| Agente Delfino (SOSTAC) | `routes/sostac.js` + `views/sostac/` |
| Onboarding con DalIA | `routes/onboarding-dallia.js` |
