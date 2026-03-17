# PRD: Fase 0 - Tarea 0.1.1
## Mover credenciales hardcodeadas a variables de entorno

**Fecha**: 17 Marzo 2026
**Estado**: COMPLETADO
**Hallazgo origen**: SEC-001 (Arquitecto SaaS) - CRITICO

---

## Problema
El archivo `db.js` tenia credenciales de base de datos hardcodeadas directamente en el codigo fuente:
```javascript
host: 'localhost',
user: 'root',
password: '111',
database: 'reconocimiento',
```
Esto es un riesgo de seguridad critico para un sistema financiero que maneja caja y P&L con dinero real. Las credenciales quedan expuestas en el repositorio Git.

## Solucion implementada

### Cambios en `db.js`:
- Agregado `require('dotenv').config()` al inicio
- Todas las credenciales ahora leen de `process.env`:
  - `DB_HOST` (default: localhost)
  - `DB_USER` (default: root)
  - `DB_PASSWORD` (default: '' vacio, NO '111')
  - `DB_DATABASE` (default: reconocimiento)
  - `DB_PORT` (default: 3306)
  - `DB_POOL_SIZE` (default: 50, antes era 10)
- Pool de conexiones aumentado de 10 a 50 (recomendacion de escalabilidad ESC-001)

### Cambios en `.env`:
- Agregado `DB_PORT=3306`
- Agregado `DB_POOL_SIZE=50`
- Agregado `SESSION_SECRET` con valor fuerte

### Seguridad:
- El `.env` ya esta en `.gitignore` (no se sube al repositorio)
- Si no existe `.env`, los defaults no exponen credenciales reales (password vacio)
- El `server.js` ya usaba `require('dotenv').config()`, el `db.js` no lo hacia

## Archivos modificados
- `db.js` - Credenciales desde process.env
- `.env` - Variables nuevas agregadas

## Verificacion
- [x] db.js no contiene credenciales hardcodeadas
- [x] .env tiene todas las variables necesarias
- [x] .gitignore incluye .env
- [x] Pool size aumentado a 50
- [x] Defaults seguros (password vacio si no hay .env)
