# REVIEW DE SISTEMAS - Analisis Profundo del PLAN SaaS V2
## Sistema de Gestion de Restaurantes - dignita.tech

**Revisor**: Senior Systems Analyst (30+ anos en operaciones de restaurantes y ERP)
**Fecha de revision**: 17 de Marzo 2026
**Documento revisado**: PLAN_SAAS_V2.md (v2, 16 de Marzo 2026)
**Clasificacion**: ANALISIS EXHAUSTIVO - Modulo por modulo

---

## RESUMEN EJECUTIVO

El plan presenta una vision ambiciosa y bien estructurada para un SaaS de gestion de restaurantes. La arquitectura modular es correcta y los flujos principales estan bien pensados. Sin embargo, tras un analisis profundo desde la perspectiva de operaciones reales de un restaurante con 250 clientes/dia, se identifican **43 hallazgos** distribuidos en:

| Prioridad | Cantidad | Significado |
|-----------|----------|-------------|
| CRITICO | 14 | Riesgo de perdida de datos, dinero, o fallo operativo en produccion |
| IMPORTANTE | 17 | Funcionalidad incompleta que afectara la operacion diaria |
| SUGERENCIA | 12 | Mejoras que agregarian valor significativo |

---

## 1. MODULO CAJA REGISTRADORA - Analisis Detallado

### 1.1 Lo que esta bien
- Estructura de apertura/cierre con diferencia sobrante/faltante: correcto.
- Vinculacion automatica factura -> caja_movimientos: correcto.
- Registro de metodo de pago (efectivo/tarjeta/transferencia): correcto.
- Campo de notas para justificar diferencias: correcto.

### 1.2 Hallazgos

**[CAJA-001] CRITICO - Falta conteo por denominacion en el cierre de caja**

En un restaurante real, el cajero no solo dice "tengo S/8,795". El cierre profesional exige contar por denominacion: cuantos billetes de S/200, cuantos de S/100, cuantos de S/50, etc. Esto permite detectar errores de vuelto y falsificaciones.

Falta una tabla o JSON para:
```
billetes_200: 5    = S/1,000
billetes_100: 22   = S/2,200
billetes_50:  15   = S/750
billetes_20:  30   = S/600
billetes_10:  45   = S/450
monedas_5:    20   = S/100
monedas_2:    35   = S/70
monedas_1:    25   = S/25
monedas_050:  40   = S/20
TOTAL CONTADO:       S/5,215 (efectivo)
```

Sin esto, el cierre de caja es impreciso y se pierde una herramienta clave de control antirrobo.

**[CAJA-002] CRITICO - No hay concepto de "retiro parcial" o "cash drop" durante el dia**

Con 250 clientes y ~60% de ventas en efectivo (S/5,200 segun el ejemplo), a las 12:00 la caja puede tener S/3,000+ en efectivo. Esto es un riesgo de seguridad. Los restaurantes profesionales hacen "retiros parciales" a caja fuerte durante el dia, tipicamente cuando el efectivo supera un umbral (ej: S/1,500).

El plan tiene `tipo ENUM('ingreso','egreso')` con concepto `retiro_efectivo`, pero no hay un flujo definido para:
- Umbral de alerta de efectivo acumulado
- Registro de destino del retiro (caja fuerte, banco, propietario)
- Autorizacion requerida para retiros

**[CAJA-003] CRITICO - No se contempla el cambio de turno / multiples cajas simultaneas**

El plan asume 1 caja y 1 turno. Pero con 250 clientes/dia, es comun tener:
- Turno manana (08:00-14:00) con Cajero A
- Turno tarde (14:00-18:00) con Cajero B
- O 2 cajas simultaneas (caja 1 para salon, caja 2 para delivery/mostrador)

La tabla `cajas` lo soportaria tecnicamente (multiple filas abiertas), pero no hay logica definida para:
- Cierre de turno intermedio (Cajero A cierra, Cajero B abre con el saldo)
- Cuadre parcial entre turnos
- Asignacion de factura a caja especifica cuando hay 2 abiertas
- Reporte de cierre POR TURNO, no solo por dia

**[CAJA-004] IMPORTANTE - Falta el manejo de propinas**

En Peru las propinas son voluntarias pero frecuentes. Cuando un cliente paga S/37 por una cuenta de S/35, esos S/2 son propina. Actualmente el sistema registraria S/37 como ingreso y habria un "sobrante" perpetuo en caja. Se necesita:
- Campo `propina` en la factura o en caja_movimientos
- Decision: la propina va a caja o se reparte al personal?
- Impacto en el cuadre de caja

**[CAJA-005] IMPORTANTE - Falta manejo de pagos mixtos (split payment)**

Un cliente puede pagar S/20 en efectivo y S/15 con tarjeta. El plan tiene un solo `metodo_pago` por movimiento de caja. Se necesita soportar pagos parciales por metodo en una misma factura.

**[CAJA-006] IMPORTANTE - Falta anulacion de movimientos de caja**

Si se registra un movimiento por error (ej: se digito S/350 en vez de S/35), no hay mecanismo de anulacion. Se necesita:
- Estado `anulado` en caja_movimientos
- Registro de quien anulo y por que
- Movimiento reverso automatico
- Permiso exclusivo del administrador para anular

**[CAJA-007] SUGERENCIA - Falta integracion con gaveta de efectivo (cash drawer)**

Si en el futuro se conecta impresora termica POS, la gaveta se abre automaticamente al cobrar. Dejar previsto el hook para comandos ESC/POS de apertura de gaveta.

---

## 2. MODULO ALMACEN / INVENTARIO - Analisis Detallado

### 2.1 Lo que esta bien
- Modelo de datos robusto con 8 tablas: excelente.
- Trazabilidad completa (quien, cuando, cuanto, por que): excelente.
- Conteo fisico con diferencias: excelente.
- Semaforo de estados (OK/Bajo/Critico/Agotado): excelente.
- 14 categorias con ~196 ingredientes: muy completo para un restaurante peruano.
- Factor de conversion compra/uso: detalle avanzado que muchos sistemas omiten.
- Historial diario consolidado: excelente para reportes.

### 2.2 Hallazgos

**[ALM-001] CRITICO - No hay control de concurrencia para operaciones simultaneas de stock**

Con 250 clientes, en hora punta (12:00-14:00) pueden generarse 30-40 facturas en 1 hora. Cada factura descuenta multiples ingredientes. Si 2 facturas se procesan al mismo tiempo:

```
Factura A lee: pescado = 5,000g
Factura B lee: pescado = 5,000g
Factura A descuenta 150g: escribe 4,850g
Factura B descuenta 150g: escribe 4,850g  <-- DEBIO SER 4,700g
```

Se necesita:
- Transacciones SQL con `SELECT ... FOR UPDATE` en el descuento de stock
- O uso de `UPDATE almacen_ingredientes SET stock_actual = stock_actual - ? WHERE id = ? AND stock_actual >= ?` (operacion atomica)
- Manejo del caso donde stock_actual < cantidad requerida por la receta

**[ALM-002] CRITICO - No hay inspeccion de recepcion de mercaderia**

Cuando llega el pescado del terminal pesquero, el plan dice "ingresar cantidad real recibida" pero NO incluye:
- Verificacion de temperatura al recibir (la cadena de frio es obligatoria para pescados/carnes)
- Inspeccion visual de calidad (color, olor, textura)
- Registro fotografico de la mercaderia recibida
- Peso verificado vs peso declarado por el proveedor
- Criterios de rechazo (cuando devolver mercaderia)

En un restaurante de pescados/mariscos con 250 clientes/dia, recibir pescado en mal estado puede significar intoxicacion masiva. Esto no es un "nice to have", es un requerimiento de salubridad.

Tabla sugerida:
```sql
CREATE TABLE inspeccion_recepcion (
    id INT AUTO_INCREMENT PRIMARY KEY,
    orden_compra_id INT NULL,
    entrada_rapida_id INT NULL,
    temperatura_recibida DECIMAL(4,1) NULL,  -- grados centigrados
    estado_visual ENUM('excelente','bueno','aceptable','rechazado') NOT NULL,
    foto_url VARCHAR(500) NULL,
    peso_declarado DECIMAL(12,3) NULL,
    peso_verificado DECIMAL(12,3) NULL,
    notas_inspeccion TEXT NULL,
    aprobado TINYINT(1) DEFAULT 1,
    inspector_id INT NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**[ALM-003] CRITICO - Falta tracking de fechas de vencimiento por lote**

El plan tiene `dias_vencimiento` como campo generico del ingrediente, pero NO trackea la fecha de vencimiento REAL de cada lote recibido. Si compras 5kg de pescado el lunes y 3kg el miercoles, cada lote tiene diferente fecha de vencimiento.

Se necesita:
- Concepto de "lote" con fecha de ingreso y fecha de vencimiento calculada
- Alerta automatica cuando un lote esta proximo a vencer (ej: 24h antes)
- Aplicacion de FIFO (First In, First Out): usar primero lo que entro primero
- Registro de merma por vencimiento vinculado al lote especifico

Sin esto, el sistema no puede alertar: "El lote de pescado del lunes vence manana, usarlo primero".

**[ALM-004] CRITICO - No hay mecanismo de "ingrediente agotado" que bloquee la venta del platillo**

Si el aji limo se agota (stock = 0), el sistema enviaria un mensaje al canal #cocina, pero el mesero podria seguir tomando pedidos de ceviche. El descuento automatico daria stock negativo o fallaria silenciosamente.

Se necesita:
- Validacion PRE-VENTA: al agregar items a la mesa/factura, verificar que hay stock suficiente para la receta completa
- Si no hay stock: mostrar alerta al mesero "Sin aji limo - no disponible: Ceviche, Tiradito, Leche de tigre"
- Opcion de "vender sin validar stock" solo con autorizacion del admin
- Canal automatico al mesero con lista de platillos no disponibles actualizada en tiempo real

**[ALM-005] IMPORTANTE - Falta registro de temperatura de almacenamiento continuo**

El campo `temperatura_almacen` es un texto estatico ('0-4C'). En operacion real, las temperaturas se deben registrar multiples veces al dia (por normativa sanitaria). Si el refrigerador falla y sube a 12C, se pierde toda la mercaderia.

Tabla sugerida:
```sql
CREATE TABLE almacen_temperaturas (
    id INT AUTO_INCREMENT PRIMARY KEY,
    ubicacion VARCHAR(100) NOT NULL,     -- 'Refrigerador 1', 'Congelador'
    temperatura DECIMAL(4,1) NOT NULL,
    registrado_por INT NOT NULL,
    alerta TINYINT(1) DEFAULT 0,         -- 1 si esta fuera de rango
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**[ALM-006] IMPORTANTE - Falta concepto de "ingrediente sustituto"**

Si se agota el pescado bonito, se puede usar corvina? Si se acaba el aji limo, se usa aji amarillo? Los restaurantes manejan sustitutos. Falta:
- Tabla de ingredientes sustitutos con factor de conversion
- Impacto en costo de la receta al usar sustituto
- Registro de que se uso sustituto (para trazabilidad)

**[ALM-007] IMPORTANTE - No hay umbral de aprobacion para ajustes de inventario**

El plan dice que las salidas requieren aprobacion si superan cierto monto, pero no define:
- Cual es el umbral (S/50? S/100? S/500?)
- Flujo de aprobacion (quien aprueba, timeout, escalacion)
- Que pasa si el admin no esta disponible
- Audit trail de aprobaciones

**[ALM-008] IMPORTANTE - Falta manejo de merma por preparacion como porcentaje estandar**

En la preparacion del pescado, de cada 1kg comprado se pierde ~30% en limpieza (cabeza, espinas, piel). Esto significa que 1kg de pescado bonito comprado = 700g de pescado usable. El plan no contempla:
- Porcentaje de merma estandar por ingrediente (`merma_preparacion_pct`)
- Rendimiento real vs rendimiento teorico
- Impacto en el calculo de costo real del plato (el costo del pescado deberia ser /0.70, no /1.0)

**[ALM-009] SUGERENCIA - Falta integracion con balanza digital**

Para un almacen con 200+ ingredientes pesados en gramos/kilos, la integracion con balanza digital (via puerto serial o USB) automatizaria el ingreso de pesos y reduciria errores de digitacion.

**[ALM-010] SUGERENCIA - Falta alerta de sobre-stockeo**

El plan tiene `stock_maximo` pero no define que pasa cuando se excede. Sobre-stockear ingredientes perecibles genera merma. Se necesita alerta cuando `stock_actual > stock_maximo`.

---

## 3. MODULO RECETAS - Analisis Detallado

### 3.1 Lo que esta bien
- Vinculacion producto -> ingredientes con cantidades: correcto.
- Calculo de costo automatico: correcto.
- Calculo de margen bruto: correcto.
- Descuento automatico al facturar: correcto.

### 3.2 Hallazgos

**[REC-001] CRITICO - No hay versionado de recetas**

Si el chef cambia la receta del ceviche (de 150g a 120g de pescado), todas las facturas historicas se recalcularian con la receta nueva, corrompiendo los reportes de costos pasados.

Se necesita:
- Version de receta (`version INT DEFAULT 1`)
- Al modificar una receta, crear nueva version y desactivar la anterior
- Las facturas historicas referencian la version de receta usada al momento de la venta
- Poder comparar versiones: "el ceviche costaba S/7.55 con la receta v1, ahora cuesta S/6.20 con la v2"

**[REC-002] CRITICO - No hay manejo de recetas compuestas (sub-recetas)**

En la cocina peruana, muchos platos usan preparaciones base:
- "Leche de tigre" (base para ceviche, tiradito, leche de tigre como plato)
- "Arroz graneado" (base para arroz con mariscos, arroz con pollo, arroz chaufa)
- "Salsa criolla" (acompanamiento de multiples platos)
- "Aderezo base" (sofrito de cebolla, ajo, aji panca)

Actualmente, cada plato que usa "leche de tigre" tendria que listar todos los ingredientes individuales. Si se cambia la receta de la leche de tigre, hay que actualizar 5 platos.

Se necesita:
- Concepto de "sub-receta" o "preparacion base"
- Una receta puede referenciar otra receta como ingrediente
- Calculo de costo en cascada

**[REC-003] IMPORTANTE - Falta "rendimiento" o "yield" por receta**

Una receta de 1 ceviche personal produce 1 porcion. Pero la receta de "arroz graneado" de cocina puede producir 20 porciones. El plan no tiene campo de rendimiento por receta, lo cual es necesario para:
- Calcular costo por porcion cuando la receta es para multiples porciones
- Saber cuantas porciones quedan de una preparacion base

**[REC-004] IMPORTANTE - No hay ajuste de porciones (scaling)**

Si un cliente pide "medio ceviche" o "ceviche para compartir (doble)", el mesero deberia poder ajustar la cantidad. Esto impacta:
- El precio (50% o 200% segun el caso)
- El descuento de inventario (proporcional)
- El costo registrado

Se necesita un campo `multiplicador_porcion` en detalle_facturas o un concepto de "tamano de porcion".

**[REC-005] IMPORTANTE - No hay concepto de menu del dia / platos temporales**

Los restaurantes peruanos tienen "menu del dia" (entrada + segundo + refresco por S/12-15) que cambia diariamente. Esto requiere:
- Crear recetas temporales o combos diarios
- Vincular multiples productos en un "combo" con precio especial
- Desactivar combos automaticamente al final del dia
- Historial de menus del dia para analisis

**[REC-006] IMPORTANTE - Falta calculo de "food cost percentage" objetivo**

El plan calcula margen bruto pero no establece un food cost objetivo por categoria. Los benchmarks de la industria son:
- Pescados/mariscos: 28-35% de food cost
- Carnes: 30-38%
- Pastas/arroces: 20-28%
- Bebidas: 15-22%

Se necesita alertar cuando un plato supera el food cost objetivo: "El arroz con mariscos tiene 40% de food cost, el objetivo es 35%. Revisar receta o ajustar precio."

**[REC-007] SUGERENCIA - Falta campo de tiempo de preparacion**

Cada receta deberia tener un tiempo estimado de preparacion. Esto permite:
- Estimar tiempos de espera para el cliente
- Optimizar la carga de cocina
- Planificar personal necesario segun el menu

**[REC-008] SUGERENCIA - Falta campo de alergenos por receta**

Por normativa y por servicio al cliente, cada plato deberia indicar alergenos: gluten, lacteos, mariscos, frutos secos, etc. Esto se puede derivar automaticamente de los ingredientes si cada ingrediente tiene sus alergenos marcados.

---

## 4. MODULO ADMINISTRACION / P&L - Analisis Detallado

### 4.1 Lo que esta bien
- Estructura de P&L completa con EBITDA/EBIT/EBT: profesional.
- Cashflow mensual con categorias detalladas: correcto.
- Planilla con pago diario (jornales): adaptado a la realidad peruana.
- Gastos fijos categorizados: correcto.
- Ratios automaticos (ROS, ROE, ROA): avanzado.

### 4.2 Hallazgos

**[ADM-001] CRITICO - No hay calculo de IGV (18%) en las ventas**

En Peru, el IGV (Impuesto General a las Ventas) del 18% es obligatorio. El plan lo menciona en compras (`igv DECIMAL(12,2)` en ordenes_compra) pero NO en ventas/facturas. Toda factura emitida debe desglosar:
- Subtotal (valor venta)
- IGV 18%
- Total

Esto impacta directamente en el P&L porque las ventas reportadas deben ser SIN IGV (el IGV es del estado, no del restaurante). Si se reportan ventas con IGV incluido, el margen bruto esta inflado en un 18%.

Ademas falta:
- Calculo de IGV credito fiscal (IGV de compras) vs IGV debito fiscal (IGV de ventas)
- Declaracion mensual PDT 621 (o reporte para el contador)

**[ADM-002] CRITICO - No hay integracion SUNAT para facturacion electronica**

Desde 2019, Peru requiere facturacion electronica para la mayoria de contribuyentes. El plan no menciona:
- Emision de boletas/facturas electronicas a SUNAT
- Uso de un OSE (Operador de Servicios Electronicos) como Nubefact, Efact, o similar
- Serie y correlativo de comprobantes electronicos
- Notas de credito electronicas (para devoluciones/anulaciones)
- Codigo QR obligatorio en boletas
- Envio de resumen diario de boletas a SUNAT

Sin esto, el restaurante opera en la informalidad tributaria o necesita un sistema paralelo para facturacion, lo cual elimina la propuesta de valor de "gestion completa".

**[ADM-003] CRITICO - No hay conciliacion bancaria**

Con ~27% de ventas por tarjeta (S/2,350/dia en el ejemplo) y ~14% por transferencia, el restaurante recibe depositos bancarios diarios del procesador de pagos (Visa/MC) y transferencias directas. Falta:
- Registro de depositos bancarios recibidos
- Conciliacion: ventas por tarjeta del dia vs deposito recibido del banco (hay comisiones del 3-4%)
- Comisiones del procesador de pagos como gasto
- Dias de rezago (el banco deposita a los 2-3 dias habiles)
- Reporte de cuentas por cobrar (ventas tarjeta pendientes de deposito)

**[ADM-004] CRITICO - Falta calculo de Impuesto a la Renta Peru**

El P&L incluye "Impuesto de Sociedades (IR Peru)" pero no define:
- Regimen tributario del restaurante (RUS, RER, Regimen MYPE, Regimen General)
- Cada regimen tiene tasas diferentes: RUS (S/20-50/mes fijo), RER (1.5% de ingresos), MYPE (10% hasta 15 UIT + 29.5%), General (29.5%)
- Pagos a cuenta mensuales (1.5% o coeficiente)
- Para un restaurante con S/8,750/dia (S/262,500/mes), probablemente esta en Regimen General

**[ADM-005] IMPORTANTE - La tabla `personal` esta desvinculada de `usuarios`**

El campo `usuario_id INT NULL` en personal implica que puede haber personal sin acceso al sistema. Correcto. Pero no hay:
- Control de asistencia (entrada/salida del personal)
- Calculo de horas extras
- Descanso semanal obligatorio (DL 713 en Peru)
- Vacaciones y CTS (beneficios laborales peruanos)
- Gratificaciones (julio y diciembre)
- Aportes: EsSalud (9%), ONP (13%) o AFP (12-14%)

Para el P&L correcto, el costo real de un empleado con sueldo de S/80/dia NO es S/80. Es aproximadamente S/80 + 9% EsSalud + gratificaciones prorrateadas + CTS prorrateada = ~S/106/dia.

**[ADM-006] IMPORTANTE - No hay presupuesto vs real**

El P&L muestra lo que YA paso, pero no permite:
- Definir un presupuesto mensual por categoria
- Comparar presupuesto vs gasto real
- Alertar cuando un gasto supera el presupuesto (ej: "gastos de gas ya alcanzaron el 90% del presupuesto mensual")

**[ADM-007] IMPORTANTE - Falta gestion de cuentas por pagar**

Las compras al proveedor no siempre se pagan al contado. Muchos proveedores dan credito a 7, 15 o 30 dias. Falta:
- Estado de pago de cada orden de compra (pagada, pendiente, parcial)
- Fecha de vencimiento del pago
- Reporte de cuentas por pagar (cuanto debo y a quien, con fechas)
- Alerta de pagos proximos a vencer

**[ADM-008] SUGERENCIA - Falta analisis de punto de equilibrio (break-even)**

Con los datos de costos fijos, costos variables (COGS) y precio promedio, el sistema podria calcular automaticamente:
- Cuantos clientes/dia necesito para cubrir todos los costos?
- Cual es el ticket promedio minimo para no perder?
- Desde que hora del dia se empieza a generar ganancia?

---

## 5. MODULO CANALES INTERNOS - Analisis Detallado

### 5.1 Lo que esta bien
- Canales predefinidos por area: correcto.
- Mensajes automaticos del sistema: excelente.
- Prioridad de mensajes (normal/alta/urgente): correcto.
- Permisos por rol: correcto.

### 5.2 Hallazgos

**[CAN-001] IMPORTANTE - El campo `leido_por JSON` no escala bien**

Con un equipo de 10+ personas y cientos de mensajes diarios, almacenar `leido_por` como JSON array en cada mensaje genera:
- Lecturas costosas para contar "no leidos" por usuario
- No hay indice eficiente sobre JSON arrays en MySQL
- Mejor usar tabla separada: `canal_mensajes_leidos(mensaje_id, usuario_id, leido_at)`

**[CAN-002] IMPORTANTE - No hay concepto de mensajes "anclados" (pinned)**

El aviso "Hoy no hay Jalea Mixta" debe permanecer visible todo el dia, no perderse entre otros mensajes. Falta:
- Campo `pinned TINYINT(1) DEFAULT 0`
- Mensajes pinned se muestran siempre en la parte superior del canal
- Expiracion automatica al final del dia para avisos diarios

**[CAN-003] SUGERENCIA - Falta notificacion push / sonido**

Un mensaje urgente en #cocina ("ingrediente agotado") no sirve si el cocinero no esta mirando la pantalla. Se necesita:
- Notificacion sonora para mensajes urgentes
- Push notification via Service Worker (si es PWA)
- Indicador visual persistente (sidebar con badge parpadeante)

**[CAN-004] SUGERENCIA - Falta canal de comunicacion mesero-cocina en tiempo real**

El flujo de pedidos actual es: mesero envia a cocina -> cocinero prepara -> marca listo. Pero no hay canal para:
- Cocina pregunta al mesero: "La mesa 5 pidio sin cebolla, confirmar?"
- Mesero informa a cocina: "La mesa 8 quiere apurar el pedido"
- Comunicacion bidireccional por mesa/pedido especifico

---

## 6. MODULO REPORTES PDF - Analisis Detallado

### 6.1 Lo que esta bien
- Contenido del reporte diario muy completo: excelente.
- Incluye proyeccion para manana: avanzado.
- P&L del dia con desglose: profesional.
- Seccion de faltantes con sugerencia de compra: muy util.

### 6.2 Hallazgos

**[REP-001] IMPORTANTE - Faltan reportes adicionales criticos**

El plan solo define PDF diario y mensual. Un restaurante necesita:

| Reporte | Frecuencia | Para que |
|---------|-----------|---------|
| Reporte semanal comparativo | Semanal | Lun vs Mar vs Mie... cual dia vende mas? |
| Reporte de merma | Semanal | Cuanto se perdio, en que ingredientes, por que motivo |
| Reporte de productividad por mesero | Semanal | Cuantas mesas atendio, ticket promedio, propinas |
| Reporte de platos descontinuados | Mensual | Platos que se venden menos de X por semana |
| Reporte de rotacion de inventario | Mensual | Dias de inventario por ingrediente |
| ABC de ingredientes | Mensual | 20% de ingredientes que representan 80% del costo |
| Reporte de proveedor | Mensual | Cumplimiento de entregas, variacion de precios |
| Reporte de tendencias | Mensual | Ventas por hora del dia, dia de la semana, estacionalidad |
| Kardex valorizado | Mensual | Movimiento completo de cada ingrediente con costos (requerido por SUNAT) |

**[REP-002] IMPORTANTE - Falta exportacion a formatos multiples**

Solo se menciona PDF. Se necesita tambien:
- Excel/CSV para analisis personalizado
- Envio automatico por email al administrador
- Acceso historico a reportes generados (no solo generacion en el momento)

**[REP-003] SUGERENCIA - Falta dashboard en tiempo real**

El reporte PDF es un snapshot del final del dia. Faltaria un dashboard en tiempo real que muestre:
- Ventas acumuladas del dia (con grafico por hora)
- Ocupacion de mesas actual
- Pedidos en cocina (cola)
- Stock de ingredientes criticos
- Comparacion con el mismo dia de la semana anterior

---

## 7. MODULO ASISTENTE IA CON VOZ - Analisis Detallado

### 7.1 Lo que esta bien
- Uso de Web Speech API (gratis, sin dependencia externa): pragmatico.
- Toggle para activar/desactivar: correcto.
- Alternativa premium con OpenAI Whisper: prevision correcta.

### 7.2 Hallazgos

**[IA-001] IMPORTANTE - Web Speech API no funciona offline**

El plan no menciona que Web Speech API requiere conexion a internet (envia audio a servidores de Google para reconocimiento). Si el internet cae, la voz no funciona. Se necesita:
- Fallback a solo texto cuando no hay internet
- Indicador visual claro de disponibilidad de voz

**[IA-002] IMPORTANTE - No se define que datos puede consultar la IA**

El plan dice que DIGNITA AI responde "como estuvo el dia" pero no especifica:
- Tiene acceso a datos en tiempo real? (stock, ventas, caja)
- Puede ejecutar acciones? (crear pedido por voz, registrar merma)
- Contexto del tenant? (la IA debe saber que restaurante es)
- Historial de conversaciones persistente?
- Limites de uso por plan (Free vs Pro)

**[IA-003] SUGERENCIA - Falta IA predictiva**

Mas alla del chat, la IA podria ofrecer:
- Prediccion de demanda por dia de la semana
- Sugerencia de compras basada en historico de ventas
- Deteccion de anomalias (dia con ventas 40% menores al promedio, posible robo)
- Optimizacion de precios basada en margenes y demanda

---

## 8. FLUJOS OPERATIVOS - Analisis de Escenarios Criticos

### 8.1 Escenarios no cubiertos en el plan

**[FLUJO-001] CRITICO - Que pasa cuando un cliente devuelve un plato?**

Escenario: El ceviche salio mal (muy salado, frio, o el cliente simplemente no lo quiere). El mesero lo devuelve a cocina.

Impactos no definidos:
1. **Facturacion**: Se anula el item de la factura? Se genera nota de credito? Se crea nueva factura sin ese item?
2. **Inventario**: Los ingredientes ya se descontaron al facturar. Se revierten? Se registran como merma? Si se cocinaron, no son recuperables.
3. **Caja**: Si ya se cobro, se devuelve el dinero? Se registra como egreso?
4. **Cocina**: Se prepara un reemplazo? Se descuenta inventario nuevamente?
5. **Reporte**: Como aparece en el P&L? Como "devolucion" o como "costo adicional"?

Flujo sugerido:
```
Cliente rechaza plato
    -> Mesero registra devolucion con motivo
    -> Sistema pregunta: Reemplazo? Anulacion? Descuento?
    -> Si reemplazo: nuevo pedido a cocina, inventario se descuenta de nuevo
    -> Si anulacion: nota de credito, ingredientes a merma (no se revierten)
    -> En ambos casos: alerta al admin en #administracion
```

**[FLUJO-002] CRITICO - Que pasa cuando se cae el internet?**

Con un SaaS cloud-based, la caida de internet = restaurante paralizado. Con 250 clientes/dia, una caida de 2 horas en hora punta es catastrofica.

El plan NO contempla:
- Modo offline (PWA con Service Worker + IndexedDB)
- Cache local de productos, precios, recetas
- Cola de transacciones offline que se sincronizan al volver la conexion
- Impresion de tickets sin internet (cache local de la impresora)

Esto es especialmente critico en Peru, donde las caidas de internet son frecuentes en muchas zonas.

**[FLUJO-003] CRITICO - Que pasa cuando un ingrediente se agota a mitad del servicio?**

Escenario: A las 13:00, el pescado bonito llega a 0g. Hay 5 pedidos de ceviche en cola en cocina.

Flujo no definido:
1. Los 5 pedidos ya en cola: se preparan con sustituto? Se cancelan? Se notifica a las mesas?
2. Los nuevos pedidos: como se bloquea la venta de todos los platos que usan pescado bonito?
3. Compra de emergencia: se puede hacer una "entrada rapida" de un proveedor de emergencia?
4. Comunicacion: notificar a TODOS los meseros simultaneamente que platos no estan disponibles

**[FLUJO-004] IMPORTANTE - Que pasa con las mesas que no facturan?**

Escenario: Una mesa pide, come, y se va sin pagar (dine and dash). O una mesa reservada no aparece.

Falta:
- Estado "fugado" o "no pagado" en mesa
- Registro de perdida con responsable (mesero asignado)
- Impacto en inventario (los ingredientes ya se descontaron si se envio a cocina)

**[FLUJO-005] IMPORTANTE - Que pasa con pedidos modificados despues de enviar a cocina?**

El cliente pide ceviche, se envia a cocina, y dice "ah, mejor quiero arroz con mariscos". Esto no tiene flujo definido:
- Cancelar pedido en cocina (si no se empezo a preparar)
- Ingredientes del ceviche: se descontaron al enviar o al facturar?
- Nuevo pedido del arroz: se suma a la cola

**[FLUJO-006] IMPORTANTE - No hay manejo de reservas de mesa**

El canal #meseros menciona "mesas reservadas" pero no hay tabla ni flujo de reservas:
- Tabla de reservas (fecha, hora, nombre, telefono, cantidad personas, mesa asignada)
- Confirmacion de reserva (SMS/WhatsApp)
- No-show tracking
- Liberacion automatica si no llega en X minutos

---

## 9. INTEGRIDAD DE DATOS - Riesgos Identificados

**[INT-001] CRITICO - Stock de almacen puede quedar desincronizado con movimientos**

Si el UPDATE de `almacen_ingredientes.stock_actual` falla pero el INSERT de `almacen_movimientos` ya se ejecuto (o viceversa), el stock queda inconsistente. Se necesita:
- Transaccion SQL que envuelva AMBAS operaciones
- Constraint: `SUM(movimientos) + stock_inicial = stock_actual` verificable
- Job nocturno de reconciliacion que compare stock_actual vs SUM de movimientos
- Alerta automatica si hay discrepancia

**[INT-002] CRITICO - Caja puede quedar desincronizada con facturas**

Si se genera una factura pero falla la creacion del movimiento de caja, el cierre de caja no cuadrara con las facturas del dia. Se necesita:
- Transaccion atomica: factura + caja_movimiento en la misma TX
- Reporte de reconciliacion: SUM(facturas del dia) vs SUM(ingresos en caja)
- Alerta si hay diferencia

**[INT-003] IMPORTANTE - costo_promedio puede calcular mal con entradas concurrentes**

Si 2 personas registran entradas del mismo ingrediente al mismo tiempo, el calculo de costo promedio ponderado puede corromperse:
```
Entrada A: 5kg a S/25/kg (lee costo_promedio actual: S/20/kg, stock: 10kg)
Entrada B: 3kg a S/22/kg (lee costo_promedio actual: S/20/kg, stock: 10kg)
Ambas calculan basandose en el mismo stock/costo, pero despues de ambas el resultado deberia ser diferente.
```
Se necesita UPDATE atomico con la formula de costo promedio ponderado en SQL.

**[INT-004] IMPORTANTE - No hay soft delete consistente**

Algunas tablas usan `activo TINYINT(1)` pero no todas. Si se elimina un ingrediente que esta referenciado en recetas, movimientos y ordenes de compra, las FK fallan. Se necesita:
- Politica uniforme de soft delete en TODAS las tablas maestras
- Nunca DELETE fisico de ingredientes, productos, proveedores, personal
- Validacion al desactivar: "Este ingrediente esta en 12 recetas activas. Desactivar de todos modos?"

---

## 10. ARQUITECTURA SaaS MULTI-TENANT - Analisis

**[MT-001] CRITICO - Shared database con tenant_id es riesgoso sin row-level security**

La estrategia de `WHERE tenant_id = ?` en cada query es fragil. Un solo query sin el filtro de tenant expone datos de TODOS los restaurantes. Se necesita:
- Middleware que SIEMPRE inyecte tenant_id (ya mencionado, bien)
- Tests automatizados que validen que NINGUNA query omite tenant_id
- Considerar PostgreSQL con Row Level Security (RLS) en lugar de MySQL, o bien Views con tenant_id fijo por conexion
- Audit log de accesos cross-tenant

**[MT-002] IMPORTANTE - No hay estrategia de backup/restore por tenant**

Si un restaurante pide "restaurar mis datos de ayer", con shared database es complejo:
- No se puede hacer restore del backup completo (afectaria a todos los tenants)
- Se necesita export/import por tenant_id
- Backup logico por tenant (mysqldump con WHERE)

**[MT-003] IMPORTANTE - Falta limites de uso (rate limiting) por plan**

El plan Free dice "1 usuario, 10 mesas, 50 productos" pero no define:
- Como se enfuerzan los limites tecnicamente
- Que pasa cuando se alcanza el limite (bloqueo? degradacion? aviso?)
- Limites de API calls, almacenamiento, ancho de banda

**[MT-004] SUGERENCIA - Considerar schema por tenant para Enterprise**

Para clientes Enterprise con "hosting dedicado", una base de datos separada por tenant ofrece mejor aislamiento, performance, y facilidad de backup/restore.

---

## 11. INTEGRACIONES EXTERNAS FALTANTES

**[EXT-001] CRITICO - Integracion con apps de delivery (Rappi, PedidosYa, Uber Eats)**

No mencionada en el plan. Un restaurante con 250 clientes/dia probablemente recibe un 15-20% de pedidos via delivery. Esto requiere:
- API para recibir pedidos de las plataformas
- Sincronizacion de menu y precios
- Sincronizacion de disponibilidad (si se agota un plato, avisar a las apps)
- Comisiones de delivery como gasto (20-30% por pedido)
- Impacto en inventario identico al de ventas presenciales

**[EXT-002] CRITICO - Integracion con SUNAT (ya detallado en ADM-002)**

Facturacion electronica obligatoria.

**[EXT-003] IMPORTANTE - Integracion con software contable**

El plan tiene P&L y cashflow, pero el contador del restaurante probablemente usa Concar, Contasis, o similar. Falta:
- Exportacion en formato contable (plan de cuentas)
- Asientos contables automaticos
- Exportacion de libros electronicos (PLE) para SUNAT

**[EXT-004] IMPORTANTE - Integracion con pasarela de pagos**

Para pagos con tarjeta, se necesita integrar con:
- Izipay / Niubiz (principales en Peru)
- Yape / Plin (billeteras digitales, muy usadas en Peru)
- QR de pagos

**[EXT-005] SUGERENCIA - Integracion con WhatsApp Business API**

Para:
- Confirmacion de reservas
- Envio de comprobantes electronicos
- Notificacion al dueno del reporte diario
- Pedidos por WhatsApp

**[EXT-006] SUGERENCIA - Integracion con Google My Business**

Para sincronizar horarios, menu, resenas, y fotos automaticamente.

---

## 12. SEGURIDAD - Hallazgos

**[SEG-001] CRITICO - No hay audit trail completo**

El plan registra `usuario_id` en la mayoria de las tablas, pero NO hay una tabla de auditoria centralizada que registre TODA accion critica:
- Quien modifico un precio de producto
- Quien cambio una receta
- Quien anulo una factura
- Quien hizo un ajuste de inventario
- Con IP, timestamp, valor anterior y valor nuevo

Tabla sugerida:
```sql
CREATE TABLE audit_log (
    id BIGINT AUTO_INCREMENT PRIMARY KEY,
    tenant_id INT NOT NULL,
    usuario_id INT NOT NULL,
    accion VARCHAR(50) NOT NULL,          -- 'UPDATE', 'DELETE', 'CREATE'
    tabla VARCHAR(100) NOT NULL,
    registro_id INT NOT NULL,
    datos_anteriores JSON NULL,
    datos_nuevos JSON NULL,
    ip_address VARCHAR(45) NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

**[SEG-002] IMPORTANTE - No se menciona encriptacion de datos sensibles**

Contrasenas de usuarios, datos de clientes (telefono, email), informacion financiera. Se necesita:
- Bcrypt para contrasenas (minimo)
- Encriptacion at-rest para datos financieros
- HTTPS obligatorio (Let's Encrypt)
- Tokens JWT con expiracion corta + refresh tokens

**[SEG-003] IMPORTANTE - No hay politica de respaldo**

No se define:
- Frecuencia de backups (diario minimo para un restaurante con 250 clientes/dia)
- Retencion de backups (30 dias minimo)
- Backup en ubicacion diferente (cloud storage)
- Pruebas de restauracion periodicas
- RPO (Recovery Point Objective) y RTO (Recovery Time Objective)

---

## 13. MODELO DE DATOS - Hallazgos Adicionales

**[BD-001] IMPORTANTE - Falta tabla de "notas de credito" o "devoluciones"**

```sql
CREATE TABLE notas_credito (
    id INT AUTO_INCREMENT PRIMARY KEY,
    factura_id INT NOT NULL,
    motivo ENUM('devolucion','error_facturacion','descuento_posterior','anulacion') NOT NULL,
    monto DECIMAL(10,2) NOT NULL,
    items JSON NULL,                      -- items devueltos con cantidades
    estado ENUM('emitida','anulada') DEFAULT 'emitida',
    usuario_id INT NOT NULL,
    notas TEXT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (factura_id) REFERENCES facturas(id)
);
```

**[BD-002] IMPORTANTE - La tabla facturas necesita mas estados**

No se muestra la tabla facturas en el plan, pero deberia tener al menos:
- `estado ENUM('borrador','emitida','pagada','anulada','credito_parcial')`
- `tipo_comprobante ENUM('boleta','factura','nota_venta','ticket')`
- `serie VARCHAR(10)` -- Serie del comprobante
- `correlativo INT` -- Correlativo por serie
- `sunat_estado ENUM('pendiente','enviada','aceptada','rechazada')` -- Estado en SUNAT

**[BD-003] SUGERENCIA - Considerar tabla de "turnos" formal**

```sql
CREATE TABLE turnos (
    id INT AUTO_INCREMENT PRIMARY KEY,
    nombre VARCHAR(50) NOT NULL,          -- 'Manana', 'Tarde', 'Noche'
    hora_inicio TIME NOT NULL,
    hora_fin TIME NOT NULL,
    activo TINYINT(1) DEFAULT 1
);
```
Esto permite vincular cajas, facturas, personal, y reportes por turno.

---

## 14. RESUMEN DE HALLAZGOS POR PRIORIDAD

### CRITICOS (14) - Resolver ANTES de produccion

| ID | Modulo | Hallazgo |
|---|--------|---------|
| CAJA-001 | Caja | Falta conteo por denominacion |
| CAJA-002 | Caja | Falta cash drop / retiro parcial controlado |
| CAJA-003 | Caja | Falta cambio de turno / multiples cajas |
| ALM-001 | Almacen | Sin control de concurrencia en stock |
| ALM-002 | Almacen | Sin inspeccion de recepcion |
| ALM-003 | Almacen | Sin tracking de vencimiento por lote |
| ALM-004 | Almacen | Ingrediente agotado no bloquea venta |
| REC-001 | Recetas | Sin versionado de recetas |
| REC-002 | Recetas | Sin sub-recetas (preparaciones base) |
| ADM-001 | Admin | Sin calculo de IGV 18% en ventas |
| ADM-002 | Admin | Sin facturacion electronica SUNAT |
| ADM-003 | Admin | Sin conciliacion bancaria |
| FLUJO-001 | Flujos | Sin flujo de devolucion de platos |
| FLUJO-002 | Flujos | Sin modo offline |

### IMPORTANTES (17) - Resolver en las primeras semanas post-lanzamiento

| ID | Modulo | Hallazgo |
|---|--------|---------|
| CAJA-004 | Caja | Falta manejo de propinas |
| CAJA-005 | Caja | Falta split payment |
| CAJA-006 | Caja | Falta anulacion de movimientos |
| ALM-005 | Almacen | Falta registro de temperaturas continuo |
| ALM-006 | Almacen | Falta ingredientes sustitutos |
| ALM-007 | Almacen | Sin umbral de aprobacion definido |
| ALM-008 | Almacen | Sin merma por preparacion como % |
| REC-003 | Recetas | Falta rendimiento/yield por receta |
| REC-004 | Recetas | Falta ajuste de porciones |
| REC-005 | Recetas | Falta menu del dia / combos |
| REC-006 | Recetas | Falta food cost % objetivo |
| ADM-004 | Admin | Sin calculo de IR Peru por regimen |
| ADM-005 | Admin | Sin costos laborales reales |
| ADM-006 | Admin | Sin presupuesto vs real |
| ADM-007 | Admin | Sin cuentas por pagar |
| REP-001 | Reportes | Faltan 9 reportes adicionales |
| FLUJO-003 | Flujos | Sin flujo de agotamiento mid-service |

### SUGERENCIAS (12) - Para versiones futuras

| ID | Modulo | Hallazgo |
|---|--------|---------|
| CAJA-007 | Caja | Integracion cash drawer ESC/POS |
| ALM-009 | Almacen | Integracion balanza digital |
| ALM-010 | Almacen | Alerta de sobre-stockeo |
| REC-007 | Recetas | Tiempo de preparacion por receta |
| REC-008 | Recetas | Alergenos por receta |
| ADM-008 | Admin | Analisis punto de equilibrio |
| CAN-003 | Canales | Push notifications |
| CAN-004 | Canales | Chat bidireccional mesa-cocina |
| REP-002 | Reportes | Exportacion multi-formato |
| REP-003 | Reportes | Dashboard tiempo real |
| IA-003 | IA | IA predictiva |
| EXT-005 | Ext | Integracion WhatsApp Business |

---

## 15. RECOMENDACIONES DE IMPLEMENTACION REVISADAS

### Fase 1 REVISADA: Almacen + Recetas (2-3 semanas, no 1-2)

Agregar al alcance original:
1. Control de concurrencia (SELECT FOR UPDATE o UPDATE atomico)
2. Versionado de recetas
3. Sub-recetas basicas
4. Validacion pre-venta de stock suficiente
5. Merma de preparacion por ingrediente

### Fase 2 REVISADA: Caja (1-2 semanas, no 1)

Agregar al alcance original:
1. Conteo por denominacion
2. Cash drop / retiro parcial
3. Soporte para multiples cajas/turnos
4. Split payment
5. Anulacion de movimientos con auditoria

### Fase 2.5 NUEVA: Facturacion Electronica SUNAT (2-3 semanas)

Esta fase NO existia y es OBLIGATORIA para operar legalmente:
1. Integracion con OSE (Nubefact recomendado por simplicidad)
2. Boletas y facturas electronicas
3. Notas de credito
4. Resumen diario de boletas
5. Calculo de IGV
6. QR en comprobantes

### Fase 3 REVISADA: Administracion (2-3 semanas)

Agregar al alcance original:
1. Calculo de IGV credito/debito
2. Costos laborales reales (EsSalud, CTS, gratificaciones)
3. Conciliacion bancaria basica
4. Cuentas por pagar a proveedores
5. Presupuesto vs real

### Fase 7 REVISADA: SaaS Multi-Tenant (3-4 semanas, no 2-3)

Agregar al alcance original:
1. Audit trail centralizado
2. Backup por tenant
3. Rate limiting por plan
4. Tests de aislamiento de tenant
5. Row-level security o validacion exhaustiva

### Fase NUEVA: Modo Offline (2-3 semanas)

Implementar como PWA con:
1. Service Worker para cache de assets
2. IndexedDB para datos criticos (productos, precios, recetas)
3. Cola de sincronizacion para transacciones offline
4. Indicador visual de estado online/offline
5. Resolucion de conflictos al reconectar

---

## 16. CONCLUSION FINAL

El PLAN SaaS V2 es un documento de planificacion **notablemente detallado** para esta etapa. La vision es clara, los flujos principales son correctos, y el modelo de datos es robusto como punto de partida. El enfoque en trazabilidad del almacen ("Si el almacen esta bien, todo esta bien") demuestra comprension del negocio.

Sin embargo, para un sistema que gestionara dinero real, inventario perecible, y operaciones con 250 clientes diarios, los 14 hallazgos criticos deben resolverse antes de ir a produccion. Especialmente:

1. **Facturacion electronica SUNAT** - sin esto, el sistema no tiene utilidad legal en Peru
2. **Modo offline** - sin esto, una caida de internet paraliza el restaurante
3. **Control de concurrencia** - sin esto, el inventario se corrompe bajo carga real
4. **Flujo de devoluciones** - sin esto, cada devolucion genera caos operativo

El plan actual llevaria aproximadamente 8-10 semanas de desarrollo. Con los hallazgos criticos incorporados, la estimacion sube a 14-18 semanas. Esta inversion adicional es necesaria para un producto que funcione en condiciones reales de operacion de un restaurante peruano.

---

*Revision completada el 17 de Marzo 2026. Este documento debe revisarse junto con el autor del plan para priorizar y ajustar el roadmap de implementacion.*
