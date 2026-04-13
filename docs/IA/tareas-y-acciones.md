# Qué puede hacer DalIA

DalIA tiene **dos capas de capacidades**:

1. **Responder** — preguntas conversacionales sobre el negocio y el sistema.
2. **Ejecutar acciones reales** (DalIA Actions) — detecta intención → propone un borrador → el usuario aprueba → se ejecuta.

---

## 1. Respuestas conversacionales

Preguntas típicas que puede responder (con datos reales del negocio):

### Ventas y finanzas (solo admin/cajero)
- "¿Cuánto vendimos hoy / esta semana?"
- "¿Cuál es el producto estrella?"
- "¿Cuántas facturas hicimos?"
- "Ticket promedio del mes"
- "Desglose por método de pago"

### Operaciones
- "¿Qué mesas están ocupadas?"
- "¿Cómo está la cocina?"
- "Pedidos atrasados"
- "Qué ingredientes están por vencer"
- "Stock bajo mínimo"

### Guía del sistema
- "¿Cómo abro una mesa?"
- "¿Cómo facturo?"
- "¿Cómo agrego un producto?"
- "¿Cómo cierro caja?"

### Consejos de gestión
- "¿Qué hago para empezar el día?"
- "¿Cómo mejoro mis ventas?"
- "Rutina de cierre"

### Detección de categoría (`detectarCategoria` en `chat.js:61-80`)
Clasifica automáticamente: `propinas`, `legal`, `personal`, `inventario`, `entrega`, `mantenimiento`, `fidelidad`, `ventas`, `general`.

---

## 2. Acciones ejecutables (DalIA Actions)

Runtime: `services/dallia-actions.js`. Cada handler implementa `{ detect, draft, execute }`.

### 🔄 Ciclo de vida

```
detect()  → ¿hay algo que proponer?
  └── sí → draft() arma borrador → estado 'propuesta' en dallia_actions_log
       └── usuario aprueba → execute() → estado 'ejecutada' / 'fallida'
       └── usuario rechaza → estado 'rechazada'
```

### Acciones registradas

Ubicación: `services/dallia-actions/`

| Acción | Archivo | Qué hace |
|---|---|---|
| `enviar_pedido_proveedor` | `enviar-pedido-proveedor.js` | Detecta ingredientes bajo mínimo, agrupa por proveedor, arma mensaje WhatsApp y crea orden de compra draft |
| `vencimiento_ingredientes` | `vencimiento-ingredientes.js` | Alerta sobre insumos próximos a vencer |
| `resumen_cierre_dia` | `resumen-cierre-dia.js` | Genera resumen de ventas, gastos, caja del día |
| `recordatorio_cerrar_caja` | `recordatorio-cerrar-caja.js` | Avisa si la caja quedó abierta al final del servicio |
| `meta_alcanzada` | `meta-alcanzada.js` | Detecta cumplimiento de meta de ventas y celebra |

### Detectores de intención (en `chat.js:20-58`)

Cuando el usuario escribe algo que matchea, el chat dispara la acción correspondiente:

| Función | Palabras clave |
|---|---|
| `detectStockIntent` | "revisa stock", "falta", "pedido", "compras", "insumos" (≥2 matches o frase exacta) |
| `detectVencimientoIntent` | "venc", "caducidad", "expira", "caduca", "vencimiento" |
| `detectResumenDiaIntent` | "resumen del día", "cierre del día", "cómo me fue", "cuánto vendí" |
| `detectCerrarCajaIntent` | "caja abierta", "cerrar caja", "olvidé cerrar" |
| `detectMetaAlcanzadaIntent` | "meta", "objetivo", "alcancé la meta", "cumplí la meta" |

### Permisos

Solo `administrador` y `superadmin` pueden disparar DalIA Actions. Meseros/cocineros reciben el flujo conversacional normal.

---

## 3. Analytics (PostHog)

Todo queda trazado en `lib/posthog-events.js`:

- `capturarChatAbierto` — se abre el chat
- `capturarPreguntaEnviada` — categoría + texto
- `capturarRespuestaGenerada` — tokens, modelo, latencia
- `capturarErrorDallIA` — fallos del LLM
- `capturarAlertaTokens` — cuota casi agotada

---

## 4. Roadmap de tareas (V2)

Según memoria del proyecto (`project_agentes_ia_sostac`):

- DalIA como **gerente** que delega a agentes especializados
- Agentes futuros: Forge (producto), Atlas (operaciones), Vega (finanzas), Pulse (marketing)
- SOSTAC como cerebro estratégico compartido
- Integración con WhatsApp (Twilio/Meta) y SUNAT (NubeFact PSE)
