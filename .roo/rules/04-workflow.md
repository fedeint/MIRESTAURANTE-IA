# Flujo de trabajo obligatorio — MiRestconIA

## Antes de modificar

Roo debe:

1. Leer los archivos relevantes.
2. Explicar qué entiende.
3. Proponer plan corto.
4. Listar archivos que tocará.
5. Esperar confirmación si el cambio es grande.

## Durante la implementación

Trabajar en bloques pequeños.

No hacer refactor masivo sin autorización.

No cambiar arquitectura, stack ni nombres globales sin justificar.

## Después de modificar

Reportar:

1. archivos modificados
2. resumen de cambios
3. cómo probar
4. riesgos
5. pendientes

## Comandos útiles

Usar según corresponda:

```bash
npm install
npm run dev
npm test
```

## Checklist post-cambio

Antes de marcar como completado, verificar:

- [ ] No rompe rutas públicas.
- [ ] No rompe rutas privadas.
- [ ] Logs no muestran secretos.
- [ ] Formularios tienen validación.
- [ ] Pantallas mobile y desktop relacionadas están sincronizadas.
- [ ] No hay errores en consola del navegador.
- [ ] La base de datos no expone secretos.
- [ ] Si se toca PWA, se revisó `public/manifest.json`.
- [ ] El cambio es reversible si es necesario.
