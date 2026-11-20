# Falta Gente — Implementation Rules

## Stack

### Package manager

```text
pnpm
```

Mantener un único lockfile.

---

## Frontend

Raíz: `apps/web/`.

```text
Next.js
React
TypeScript
```

Dependencias principales:

```text
@tanstack/react-query
react-hook-form
zod
@hookform/resolvers
```

Responsabilidades:

```text
UI
formularios
estado remoto
validaciones UX
sesión visual
```

El frontend nunca implementa por sí solo reglas críticas de negocio.

---

## Backend

Raíz: `apps/api/`.

```text
NestJS
TypeScript
Express
```

Dependencias base:

```text
@nestjs/config
@nestjs/jwt
@nestjs/swagger
@nestjs/throttler

class-validator
class-transformer

cookie-parser
csrf-csrf
helmet

argon2
```

Para logs estructurados se podrá utilizar una integración basada en Pino.

---

## Persistencia

```text
PostgreSQL
PostGIS
Prisma
```

Prisma será utilizado para operaciones habituales.

Las operaciones PostGIS que no puedan expresarse adecuadamente mediante el ORM deberán implementarse mediante SQL parametrizado y encapsulado en repositorios.

No distribuir SQL geoespacial por services o controllers.

---

# Estructura del backend

```text
src/
├── auth/
├── users/
├── locations/
├── matches/
├── reservations/
├── participations/
├── admin/
├── common/
└── main.ts
```

Cada módulo puede utilizar:

```text
controller
service
repository
dto
domain
```

cuando sea necesario.

No crear capas vacías únicamente para cumplir una estructura.

---

# Dependencias entre módulos

Dirección general:

```text
controllers
    ↓
services
    ↓
repositories
    ↓
database
```

Controllers:

* reciben HTTP;
* validan DTO;
* delegan.

Services:

* coordinan casos de uso;
* aplican reglas.

Repositories:

* acceden a persistencia.

Evitar lógica de negocio en controllers.

---

# Frontend

Estructura conceptual:

```text
src/
├── app/
├── components/
├── features/
├── lib/
├── hooks/
└── types/
```

Organizar comportamiento por feature cuando resulte útil:

```text
features/
├── auth/
├── matches/
├── reservations/
├── profile/
└── locations/
```

---

# API

Prefijo:

```text
/api/v1
```

REST + JSON.

OpenAPI debe reflejar el contrato implementado.

No agregar endpoints sin requerimiento.

---

# Errores

Formato:

```json
{
  "code": "MATCH_FULL",
  "message": "El partido ya no tiene lugares disponibles.",
  "requestId": "..."
}
```

El frontend debe reaccionar principalmente a `code`.

---

# Request ID

Toda request recibe un `requestId`.

Debe:

```text
entrar
→ propagarse
→ incluirse en logs
→ aparecer en errores
```

---

# Logging

Usar logs estructurados.

Registrar como mínimo:

```text
requestId
method
path
status
duration
```

No registrar payload completo por defecto.

---

# Health

Implementar:

```http
GET /health
```

Debe poder utilizarse desde la infraestructura Azure que se defina para CD.

---

# Testing

Para cada cambio:

### Regla pura

Unit test.

### Persistencia / transacción / autorización

Integration test.

### Flujo principal

E2E sólo cuando aporte valor.

No hacer mocks de PostgreSQL para validar comportamiento transaccional.

---

# GitHub Actions

Pull Requests:

```text
install
→ lint
→ typecheck
→ test
→ build
```

El pipeline debe fallar ante cualquier paso fallido. También ejecuta integración con PostgreSQL/PostGIS, todas las suites de navegador existentes y construcción de imágenes Docker. `ci-required` agrega los resultados y debe configurarse como obligatorio en `dev` y `main`. Consultar [CI](../CI.md) para servicios, datos aislados y aceptación remota.

---

# Deploy

```text
Frontend → Azure (servicio por definir)
Backend  → Azure (servicio por definir)
Database → PostgreSQL administrado (servicio por definir)
```

No introducir infraestructura adicional sin requerimiento.

## Cierre de etapas en desarrollo

El agente entrega cada etapa con la base local preparada: aplica las migraciones pendientes y los seeds necesarios para la funcionalidad, valida datos y consultas reales, e informa los comandos y resultados. Si no hay cambios de esquema, confirma que no quedan migraciones pendientes. No presenta migraciones o seeds como pasos habituales a cargo del usuario.

La operación cotidiana utiliza comandos completos `docker compose -f docker-compose.yml -f docker-compose.dev.yml ...`, sin aliases, funciones ni `-p`: el archivo base fija `name: falta-gente`. El volumen lógico `postgres` se materializa como `falta-gente_postgres`. Levantar, reconstruir o reiniciar servicios no ejecuta migraciones ni seeds automáticamente.

Los seeds ficticios se ejecutan explícitamente sólo contra desarrollo. Un volumen recreado requiere preparación completa antes de entregar el entorno. Las suites mantienen su PostgreSQL aislado y nunca utilizan la base habitual. En producción, las migraciones siguen siendo un paso controlado con revisión y respaldo; la regla de cierre local no autoriza su ejecución automática ni borrados de datos.

---

# Principio de implementación

Elegir siempre:

```text
solución simple
+
correcta
+
testeable
```

antes que:

```text
solución genérica
+
compleja
+
preparada para escenarios hipotéticos
```
