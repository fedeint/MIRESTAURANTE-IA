# Planes MiRest con IA — Estructura de precios

Sistema de precios **en 3 capas independientes**. El cliente combina una opción de cada capa según sus necesidades.

```
┌────────────────┐     ┌────────────────┐     ┌────────────────┐
│   LICENCIA     │  +  │     NUBE       │  +  │      IA        │
│  (software)    │     │  (hosting)     │     │  (DalIA)       │
└────────────────┘     └────────────────┘     └────────────────┘
```

---

## 🧱 Capa 1 — LICENCIA (software de gestión)

Lo que paga por usar el sistema: mesas, cocina, caja, ventas, productos, clientes, reportes, etc.

| Opción | Precio | Nube incluida | Observación |
|---|---|---|---|
| **Trial** | S/ 0 (15 días) | ✅ sí | Captación de nuevos clientes |
| **Mensual bundle** ⭐ | **S/ 160/mes** | ✅ sí | Todo junto, cómodo de pagar |
| **Mensual + nube pre-pagada** | **S/ 90/mes** | ❌ aparte (ver Capa 2) | Cliente pagó S/ 700 anual por la nube |
| **Anual bundle** ⭐⭐ | **S/ 1,700/año** | ✅ sí | 🎯 **La oferta** — ahorras S/ 220 vs mensual |
| **Anual separado** | **S/ 1,100/año** | ❌ aparte (ver Capa 2) | Si el cliente solo quiere licencia anual |
| **Lifetime** | **S/ 2,700 único** | ❌ aparte, recurre anual | Early bird, pago único de licencia |

---

## ☁️ Capa 2 — NUBE (hosting y almacenamiento)

Infraestructura donde vive toda la data del restaurante (pedidos, ventas, clientes, reportes). **Recurre siempre** — mientras el negocio use el sistema, paga por la nube.

| Opción | Precio | Cuándo usar |
|---|---|---|
| **Incluida** | S/ 0 extra | Ya viene en Mensual bundle o Anual bundle |
| **Mensual** | S/ 70/mes | Cliente no quiere pagar anual |
| **Anual** ⭐ | **S/ 700/año** (17% off) | Cliente paga adelantado, ahorra S/ 140 |

**Importante**: el cliente con **Lifetime** solo se ahorra la licencia, pero **sigue pagando la nube cada año**.

---

## 🤖 Capa 3 — IA (DalIA: chat, voz, escucha)

Consumo de IA (Google Gemini + fallback DeepSeek). Ortogonal a las otras dos capas.

| Modo | Precio | Qué incluye | Setup |
|---|---|---|---|
| **BYOK** ⭐ | **S/ 0** | Chat + voz TTS Aoede + escucha STT **con la API key del cliente** (free tier Google 500 req/día). DeepSeek como fallback de emergencia. | Cliente crea cuenta gratis en aistudio.google.com (3 min) |
| **Premium Mensual** | **S/ 40/mes** | Voz **1 hora/día** + chat ilimitado. Nosotros ponemos la key, sin configurar nada. | Ninguno, activación instantánea |
| **Premium Anual** | **S/ 400/año** (17% off) | Misma cosa pagada adelantada | Ninguno |

### Diferencia clave entre BYOK vs Premium

| Aspecto | BYOK | Premium |
|---|---|---|
| Costo para el cliente | S/ 0 | S/ 40 mes / S/ 400 año |
| Costo para nosotros | S/ 0 | ~$4 USD/mes por cliente |
| Setup | Cliente pega su key | Automático |
| Límite diario | 500 req/día (chat + voz combinados) | Chat ilimitado + voz 1h/día |
| Soporte | Email + docs | **WhatsApp prioritario** |

---

## 💰 Ejemplos de combinaciones reales

### 👨‍🍳 Ejemplo 1 — Restaurante chico, quiere gastar lo mínimo
```
Licencia:  Mensual bundle             S/ 160/mes
Nube:      incluida                   S/ 0
IA:        BYOK (su propia key)       S/ 0
────────────────────────────────────────────────
Total:                                S/ 160/mes
                                      (S/ 1,920/año)
```

### 🏪 Ejemplo 2 — Restaurante mediano, paga anual y quiere voz
```
Licencia:  Anual bundle               S/ 1,700/año
Nube:      incluida                   S/ 0
IA:        Premium Mensual            S/ 40/mes × 12 = S/ 480
────────────────────────────────────────────────────
Total año 1:                          S/ 2,180/año
                                      (~S/ 182/mes)
```

### 🏅 Ejemplo 3 — Emprendedor comprometido, compra lifetime con todo
```
Año 1:
  Licencia Lifetime                   S/ 2,700 (único)
  Nube anual                          S/ 700
  Premium IA Anual                    S/ 400
────────────────────────────────────────────────
Total año 1:                          S/ 3,800

Años 2 en adelante:
  Nube anual                          S/ 700
  Premium IA Anual                    S/ 400
────────────────────────────────────────────────
Total por año:                        S/ 1,100
```

### 🍕 Ejemplo 4 — Trial
```
Licencia:  Trial 15 días              S/ 0
Nube:      incluida                   S/ 0
IA:        Premium (activado)         S/ 0 (cortesía trial)
────────────────────────────────────────────────
Total:                                S/ 0 (15 días)
Después:   cliente elige combinación  — Anual bundle ideal
```

### 🏢 Ejemplo 5 — Negocio con múltiples operadores, quiere pagar menos mes a mes
```
Licencia:  Mensual sin nube           S/ 90/mes
Nube:      Anual pre-pagada           S/ 700/año (= S/ 58/mes)
IA:        Premium Mensual            S/ 40/mes
────────────────────────────────────────────────
Total por mes (promedio):             S/ 188/mes
Total año 1:                          S/ 2,260
```

---

## 📊 Tabla comparativa rápida

| Perfil | Mejor combo | Total año 1 | Por mes equiv |
|---|---|---|---|
| **Cheapskate** | Mensual bundle + BYOK | S/ 1,920 | S/ 160 |
| **Ahorrador** ⭐ | Anual bundle + BYOK | S/ 1,700 | S/ 142 |
| **Profesional con voz** | Anual bundle + Premium Anual | S/ 2,100 | S/ 175 |
| **Lifetime todo incluido** | Lifetime + Nube anual + Premium Anual | S/ 3,800 año 1 / S/ 1,100 después | variable |

---

## 🎯 Estrategia comercial

### Para cada conversación de venta, ofrecer 3 opciones:

1. **La económica**: Mensual S/ 160 + BYOK → "Arrancas sin compromiso"
2. **La recomendada**: Anual bundle S/ 1,700 + BYOK → "Ahorras S/ 220 al año"
3. **La pro**: Anual bundle + Premium IA → "Voz sin configurar nada"

### Lifetime solo para clientes convencidos:
- Venderlo en reuniones presenciales o demo
- Mencionar que la nube sigue siendo anual (no es "pago único para siempre")
- Promocionar como "early bird" para crear escasez

---

## 🔧 Mapeo técnico (DB)

| Capa | Tabla | Campo |
|---|---|---|
| Licencia | `tenant_suscripciones` | `licencia_tipo`, `licencia_fecha_fin` |
| Nube | `tenant_suscripciones` | `nube_tipo`, `nube_fecha_fin` |
| IA | `tenant_ai_credentials` | `plan_tipo` ('basico'=BYOK / 'premium' / 'trial') |

Ver [`byok-setup.md`](./byok-setup.md) para detalle técnico del módulo IA.

---

## ⚠️ Reglas de negocio

1. **Lifetime no cubre la nube** — siempre se cobra aparte. Dejarlo MUY claro al vender.
2. **Trial incluye Premium IA de cortesía** por 15 días — conversión efectiva.
3. **BYOK aplica a cualquier plan de licencia** — incluso Empresa (en el futuro). Un cliente grande puede preferir BYOK si ya tiene cuenta Google corporativa.
4. **Cambio de plan IA**: se puede cambiar cuando sea, sin penalización. BYOK → Premium: activación al pago. Premium → BYOK: próximo ciclo.
5. **Si se vence la nube pero no la licencia**: sistema bloqueado con mensaje "Renueva tu nube". Data se preserva 30 días.
6. **Si se vence la licencia pero la nube está al día**: solo acceso de solo-lectura + exportar data.

---

## 📈 Proyección de ingresos (100 clientes mixtos)

Asumiendo mix conservador:
- 30% Mensual bundle + BYOK
- 40% Anual bundle + BYOK
- 20% Anual bundle + Premium Anual
- 5% Lifetime + Premium Anual
- 5% Trial activo

| Concepto | Cálculo | Ingreso/mes aprox |
|---|---|---|
| 30 × Mensual bundle | 30 × S/ 160 | S/ 4,800 |
| 40 × Anual bundle | (40 × S/ 1,700) / 12 | S/ 5,667 |
| 20 × Anual + Premium IA | (20 × (1,700 + 400)) / 12 | S/ 3,500 |
| 5 × Lifetime (año 1) + IA | (5 × (2,700 + 700 + 400)) / 12 | S/ 1,583 |
| | **TOTAL BRUTO/MES** | **~S/ 15,550** |
| — Costo IA Premium (25 clientes × $4) | | -S/ 400 |
| — Infraestructura nube (100 × $1) | | -S/ 400 |
| | **NETO/MES** | **~S/ 14,750** |

**Margen neto ~95%** porque la licencia no tiene costo marginal y BYOK no cuesta nada.
