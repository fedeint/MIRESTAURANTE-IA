# Seguridad — MiRestconIA

## Reglas obligatorias

- No leer, imprimir ni modificar `.env`.
- No exponer claves, tokens, credenciales ni secretos.
- No hardcodear credenciales.
- No mostrar datos sensibles en logs.
- No crear endpoints públicos sin validación.

## Inputs

Todo input del usuario debe validarse.

Aplicar validación en:

- formularios
- endpoints POST/PUT/PATCH
- parámetros de URL
- query params
- datos enviados al asistente IA

## Base de datos

- Usar consultas parametrizadas.
- No concatenar SQL con input del usuario.
- Evitar exponer errores internos de base de datos al usuario final.

## Sesión y permisos

Antes de crear o modificar rutas privadas, verificar:

- autenticación
- tenant/restaurante actual
- permisos del usuario
- control de sesión

## IA

No enviar al modelo:

- secretos
- claves API
- datos privados innecesarios
- información sensible del restaurante

La IA debe recibir solo el contexto mínimo necesario.
