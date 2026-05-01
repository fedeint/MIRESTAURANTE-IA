# Sistema de diseño — MiRestconIA

## Objetivo visual

MiRestconIA debe sentirse como un SaaS moderno para restaurantes:

- rápido
- claro
- táctil
- usable en tablets y celulares
- confiable para operación diaria

## Prioridad UX

Priorizar:

1. claridad de información
2. rapidez de acción
3. botones grandes y táctiles
4. estados visibles
5. feedback inmediato
6. buena lectura en pantallas pequeñas

## Estilo visual

Mantener una estética:

- limpia
- moderna
- profesional
- con buen contraste
- basada en tarjetas, estados y acciones claras

## Componentes

Antes de crear nuevos estilos, revisar:

- `public/css/theme.css`
- CSS global existente
- partials en `views/partials/`

No crear clases duplicadas si ya existe un patrón similar.

## Reglas de UI

- Botones principales deben ser visibles y consistentes.
- Acciones destructivas deben diferenciarse visualmente.
- Estados como pendiente, activo, pagado, cancelado o entregado deben ser claros.
- Formularios deben tener labels, placeholders útiles y validación visual.
- Evitar pantallas saturadas.
- Priorizar diseño mobile-first.

## Performance visual

- Evitar animaciones pesadas.
- Evitar librerías nuevas si CSS/JS simple resuelve el caso.
- Cuidar carga rápida en Android de gama media/baja.
