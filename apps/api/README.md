# Falta Gente API

API de Falta Gente construida con NestJS, Express y TypeScript.

OpenAPI y correos usan Falta Gente. Los nombres de cookies, emisor/audiencia JWT e identificadores deterministas existentes mantienen compatibilidad; ver [convenciones de identidad](../../docs/agent/NAMING.md).

## Funcionalidad base

- valida la configuración antes de iniciar y falla con un mensaje explícito;
- aplica `ValidationPipe` global con transformación, whitelist y rechazo de campos desconocidos;
- publica la API bajo `/api/v1`;
- expone `GET /health` fuera del prefijo para healthchecks;
- genera o propaga un `x-request-id` seguro y lo devuelve en la respuesta;
- normaliza errores como `{ code, message, requestId }` sin detalles internos;
- registra por request únicamente `requestId`, método, path sin query string, estado y duración;
- aplica Helmet y CORS con credenciales para orígenes exactos configurados;
- publica Swagger UI en `/api/v1/docs` y OpenAPI JSON en `/api/v1/docs-json`.

La primera vertical slice agrega autenticación local, cookies seguras, CSRF, sesiones revocables, verificación y recuperación de contraseña, localidades y partidos filtrados. Ver [VERTICAL-SLICE.md](VERTICAL-SLICE.md) para configuración completa, persistencia y contratos actuales.

MVP-01 generaliza la identidad deportiva y agrega `GET /api/v1/sports`. Ver [MULTISPORT.md](MULTISPORT.md) para modelos, migración, seeds y contratos. MVP-02 extiende el listado con filtros combinables por deporte, formato opcional y fecha local, conservando la localidad obligatoria y nueve resultados por página. Ver [DISCOVERY.md](DISCOVERY.md) para reglas, validaciones y contrato.

MVP-03 agrega `GET /api/v1/matches/:id`, un detalle público con organizador mínimo y representación de los tres estados del partido. Ver [MATCH-DETAIL.md](MATCH-DETAIL.md) para contrato, visibilidad y pruebas.

## Configuración

Copiar los placeholders de `../../.env.example` a un archivo `.env` local. No versionar valores reales. Además de las variables HTTP siguientes, la slice requiere `DATABASE_URL`, `JWT_SECRET`, `CSRF_SECRET` y `FRONTEND_URL`; los secretos deben ser distintos y tener al menos 32 caracteres. Resend requiere `RESEND_API_KEY` y `EMAIL_FROM` para la entrega real de emails; ambas son obligatorias en producción.

| Variable | Contrato |
| --- | --- |
| `NODE_ENV` | Obligatoria. `development` o `production`. |
| `PORT` | Obligatoria. Entero entre `1` y `65535`. |
| `CORS_ORIGINS` | Obligatoria. Lista de origins HTTP(S) exactos separada por comas; no acepta `*`, paths ni credenciales embebidas. |

Configuración HTTP local (completar también las variables de persistencia y sesión anteriores):

```dotenv
NODE_ENV=development
PORT=3001
CORS_ORIGINS=http://localhost:3000
```

En producción, `CORS_ORIGINS` debe contener exclusivamente el origen controlado del frontend Falta Gente. CORS usa `credentials: true` y nunca combina credenciales con un comodín.

## Contratos HTTP

### `GET /health`

Respuesta `200`:

```json
{
  "status": "ok"
}
```

El endpoint no consulta servicios externos y no expone configuración ni secretos.

### Errores

```json
{
  "code": "NOT_FOUND",
  "message": "No encontramos el recurso solicitado.",
  "requestId": "req_..."
}
```

`code` es estable para consumo del frontend. Los errores inesperados usan `INTERNAL_SERVER_ERROR` y un mensaje genérico.

## Estructura

- `src/matches/`: `matches.module.ts` compone los providers y controllers; `matches.controller.ts` y `matches.service.ts` implementan descubrimiento y detalle públicos. `match-publication.controller.ts` y `my-matches.controller.ts` delegan publicación, gestión privada y listado propio a `match-management.service.ts`. Los contratos y validaciones HTTP están en `dto/`. El historial de cambios se escribe internamente, sin endpoint de lectura.
- `src/locations/` y `src/sports/`: cada catálogo tiene module, controller, service y contratos de respuesta propios. Se conservan filtros de actividad, proyecciones y orden del catálogo.
- `src/auth/auth-response.dto.ts`: respuestas de sesión y CSRF; `src/users/user-response.dto.ts`: contrato de usuario sin fechas técnicas. El historial de perfil permanece interno, sin DTO ni ruta de lectura. Los DTO de localidades y deportes pertenecen a sus dominios y pueden ser referenciados por otros contratos.
- `src/config/`: contrato y validación del entorno.
- `src/common/http/`: request ID, logging, filtro de errores y `MessageResponse`, el único DTO de respuesta transversal.
- `src/health/`: endpoint y DTO de health.
- `src/configure-app.ts`: configuración HTTP compartida por runtime y tests E2E.
- `test/`: pruebas HTTP de los contratos base.

La organización conserva los endpoints, schemas OpenAPI, validaciones, consultas y transacciones existentes. Los permisos siguen resolviéndose desde la sesión y la propiedad del recurso en backend. La composición de rutas de usuarios permanece en `AuthModule`; esta refactorización no cambia autenticación, cookies, CSRF ni modelos Prisma.

## Comandos

Ejecutar desde la raíz del repositorio:

```bash
pnpm dev:api
pnpm --filter api lint
pnpm --filter api typecheck
pnpm --filter api test
pnpm --filter api test:e2e
pnpm --filter api build
```

## Docker

El contexto de build es la raíz del monorepo: `docker build -f apps/api/Dockerfile -t falta-gente-api:local .`. La imagen usa Node 22.23.3 sobre Debian Bookworm, pnpm 10.33.2 y el lockfile compartido. Instala únicamente las dependencias del workspace API; el runtime contiene dependencias de producción, el cliente Prisma generado para Linux, `dist/`, el schema y las migraciones. Prisma CLI se conserva como dependencia operativa para migraciones controladas; Nest CLI, Vitest, tsx y pnpm no forman parte del runtime.

La API se ejecuta como `node` (UID/GID 1000), con `node dist/main.js`, y recibe señales directamente. Los hooks de shutdown de Nest activan el cierre de Prisma existente al recibir SIGTERM. Compose proporciona init, tiempo de cierre, redes y límites; los logs continúan en stdout/stderr. `GET /health` conserva su contrato de disponibilidad básica y no verifica persistencia: además del healthcheck se debe probar una operación real contra PostgreSQL.

Después de iniciar `db`, revisar las migraciones y aplicarlas explícitamente usando la imagen backend:

```bash
docker compose run --rm --no-deps api node node_modules/prisma/build/index.js migrate deploy
docker compose run --rm --no-deps api node prisma/seed.js
```

El segundo comando carga los catálogos de localidades, deportes y formatos y es idempotente. El seed está compilado con `tsconfig.seed.json` y conserva la ruta relativa a `localidades.json`; no requiere tsx en runtime. Para fixtures ficticios usar explícitamente el override local y `node prisma/seed.js --development`. Ninguna migración ni seed se ejecuta al arrancar la API. El CLI tiene que ejecutarse con `db` saludable y con las mismas variables runtime de la API. No copiar credenciales dentro de la imagen.

Todas las variables de la API son runtime; el build no necesita `DATABASE_URL`, secretos ni claves de email. `DATABASE_URL` dentro del contenedor apunta al hostname Docker `db`, nunca a `localhost`; la variable `DOCKER_DATABASE_URL` de Compose mantiene ese valor independiente de la conexión usada por herramientas del host. `JWT_SECRET` y `CSRF_SECRET` deben ser aleatorios, distintos y de al menos 32 caracteres. `FRONTEND_URL` y `CORS_ORIGINS` apuntan al origen público que utiliza el navegador, no al hostname interno `web`.

La topología base usa `NODE_ENV=production`, exige frontend HTTPS y email configurado. Para probar por HTTP en `localhost`, el override local usa `NODE_ENV=development` con los mismos artefactos compilados. Las cookies siguen siendo Secure, HttpOnly y SameSite=Lax; CSRF, Origin y CORS permanecen activos. El prefijo de cookies sigue el contrato existente según el entorno. La base no expone PostgreSQL al host; las herramientas locales que lo necesiten deben utilizar el override local con binding loopback. Ver [operación Docker](../../docs/DOCKER.md) para el flujo completo, build, arranque, cierre y validaciones.
# Publicación de partidos

Contrato, validaciones, persistencia, permisos y coordinación futura con reservas: [MATCH-PUBLICATION.md](MATCH-PUBLICATION.md).

Gestion de partidos: [contratos de edicion y cancelacion](MATCH-MANAGEMENT.md).
