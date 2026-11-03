# Docker de Falta Gente

Las imágenes actuales son `falta-gente-web:local` y `falta-gente-api:local`. El archivo base declara `name: falta-gente`; no se necesitan aliases, funciones ni `-p`. El volumen lógico `postgres` se crea como `falta-gente_postgres`. Los nombres de usuario/base `hyt` se conservan; consultar [convenciones de identidad](agent/NAMING.md).

Tres servicios: Next.js (`web`), NestJS (`api`) y PostgreSQL/PostGIS (`db`). Ejecutar los comandos desde la raíz con Docker Compose moderno y el motor Linux iniciado. No hay proxy ni terminación TLS en este stack.

## Operación cotidiana

El agente prepara la base al finalizar cada etapa. Con `.env` configurado y esa preparación completada, el usuario sólo necesita los comandos normales de Compose:

```powershell
# Levantar los servicios y esperar sus healthchecks
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait

# Reconstruir e incorporar cambios de código
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build --wait

# Ver estado
docker compose -f docker-compose.yml -f docker-compose.dev.yml ps

# Seguir logs; Ctrl+C termina el seguimiento
docker compose -f docker-compose.yml -f docker-compose.dev.yml logs -f --tail 100

# Seguir únicamente la API
docker compose -f docker-compose.yml -f docker-compose.dev.yml logs -f --tail 100 api

# Reiniciar un servicio sin reconstruir su imagen
docker compose -f docker-compose.yml -f docker-compose.dev.yml restart api

# Detener, conservando contenedores y datos
docker compose -f docker-compose.yml -f docker-compose.dev.yml stop

# Eliminar contenedores y redes, conservando datos
docker compose -f docker-compose.yml -f docker-compose.dev.yml down
```

`up --build` incorpora código nuevo; `restart` reutiliza la imagen existente. El stack compilado no tiene recarga automática. Los datos persisten en `falta-gente_postgres`; `down -v` los elimina y no forma parte de la operación habitual. Cambiar password en `.env` no altera usuarios de un volumen existente.

## Entorno

Copiar `.env.example` a `.env` y completar `POSTGRES_PASSWORD`, `JWT_SECRET`, `CSRF_SECRET` y `DOCKER_DATABASE_URL`. Generar secretos diferentes de al menos 32 caracteres; no versionarlos. La URL de contenedor debe ser `postgresql://hyt:<password-codificada>@db:5432/hyt?schema=public`, coincidente con `POSTGRES_USER`/`POSTGRES_DB`. `DATABASE_URL` se conserva para procesos ejecutados directamente en el host y utiliza localhost y `POSTGRES_PORT`.

La API recibe sólo variables explícitas: `NODE_ENV`, `PORT`, `DATABASE_URL`, `JWT_SECRET`, `CSRF_SECRET`, `FRONTEND_URL`, `CORS_ORIGINS`, `RESEND_API_KEY`, `EMAIL_FROM`. Compose base fuerza `NODE_ENV=production`: requiere orígenes HTTPS exactos y email configurado según el contrato actual. No iniciar la base como producción con los ejemplos HTTP locales. El despliegue remoto necesita HTTPS externo previamente configurado; este trabajo no lo proporciona.

`NEXT_PUBLIC_API_URL` (incluye `/api/v1`) y `NEXT_PUBLIC_SESSION_WARNING_SECONDS` son argumentos públicos de build, incorporados al JavaScript del navegador. Cambiarlos requiere reconstruir web. No son secretos; no usar hostname `api` en la URL que consume el navegador. El runtime web recibe `NODE_ENV=production`, `HOSTNAME=0.0.0.0`, `PORT=3000` y `API_INTERNAL_URL=http://api:3001/api/v1`. Esta última URL sólo se usa en consultas del servidor Next.js, como el detalle de partido; el navegador continúa usando `NEXT_PUBLIC_API_URL`.

Para localhost usar `docker-compose.dev.yml`: ejecuta la misma API compilada con `NODE_ENV=development`, permitiendo los orígenes HTTP ya soportados. Next.js continúa en producción. No cambia cookies Secure/HttpOnly, CSRF ni CORS. Acceder desde `http://localhost:3000`, conservando `FRONTEND_URL=http://localhost:3000`, `CORS_ORIGINS=http://localhost:3000` y `NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1`. El override publica DB sólo en loopback para Prisma Studio y herramientas del host y establece `db_network.internal=false` para permitir ese forwarding; omitirlo fuera del desarrollo. No añade hot reload ni bind mounts.

## Preparación local a cargo del agente

Al finalizar cada etapa, el agente ejecuta las migraciones pendientes y los seeds que correspondan, comprueba consultas reales y entrega el entorno listo. Si no cambió el esquema, verifica que no haya migraciones pendientes. Estos comandos documentan su procedimiento; no son tareas cotidianas del usuario. Sobre un volumen nuevo se requiere la preparación completa:

```powershell
docker compose -f docker-compose.yml -f docker-compose.dev.yml build
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait db
docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm --no-deps api node node_modules/prisma/build/index.js migrate deploy
docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm --no-deps api node prisma/seed.js --development
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait
```

El seed con `--development` carga catálogo y partidos ficticios locales; sin ese argumento carga únicamente catálogo. Son operaciones explícitas e idempotentes. Nunca usar datos ficticios contra producción. Ni startup, reconstrucción ni restart ejecutan migraciones o seeds. El agente comprueba que las migraciones estén aplicadas y que el catálogo/listado/detalle puedan consultarse antes del cierre. Las pruebas de integración usan una base aislada. El CLI Prisma existente se incluye como dependencia operacional de la imagen API, junto con schema/migraciones y seed compilado; no se incluye el compilador TypeScript ni Nest CLI en runtime.

En producción usar la configuración base sin `-f docker-compose.dev.yml`, con configuración válida y migraciones como paso controlado tras revisión y respaldo. La regla de cierre de desarrollo no autoriza migraciones automáticas ni regenerar datos productivos. El frontend escucha internamente en 3000 y la API en 3001; los puertos del host se ajustan con `WEB_PORT`/`API_PORT`. `DOCKER_BIND_ADDRESS` es loopback por defecto. Una publicación remota requiere establecer explícitamente la interfaz apropiada y configurar URLs públicas, HTTPS externo y orígenes exactos.

## Persistencia y logs

El usuario autorizó regenerar el volumen anterior de desarrollo asociado al proyecto `furvo`. El proyecto vigente usa `falta-gente_postgres`; esa regeneración es un paso acotado y no se repite al cerrar otras etapas. No borrar volúmenes ajenos ni usar limpieza global Docker. Los logs van a stdout/stderr y Docker rota `json-file` con 10 MB y tres archivos por servicio, configurable mediante `DOCKER_LOG_MAX_SIZE`/`DOCKER_LOG_MAX_FILE`. Evitar imprimir `docker compose config` completo o inspecciones del entorno: contienen secretos runtime.

## Redes, salud y recursos

Web sólo pertenece a `app_network`; API pertenece a `app_network` y `db_network`; DB sólo a `db_network`, interna en la base. El override local habilita forwarding del puerto loopback mediante `internal=false`; web sigue fuera de esa red. El navegador llama directamente a la API pública, como antes; no se agregó proxy. DB base no tiene `ports`.

Startup espera `pg_isready`, luego `/health` de API y finalmente HTTP `/` de web. `/health` mantiene su contrato de disponibilidad básica, no certifica migraciones ni acceso a datos. Compose espera la salud de DB antes de iniciar API; Prisma puede conectar al realizar la primera consulta. El agente valida además operaciones reales y deja migraciones y seeds preparados antes de entregar cada etapa.

Los tres servicios usan init y 30 segundos de gracia. API habilita hooks Nest para desconectar Prisma al recibir SIGTERM; Next standalone recibe señales directamente. PostgreSQL conserva el stop signal de la imagen oficial. Restart `on-failure:5` limita reintentos para no ocultar indefinidamente errores de configuración; después de corregirlos, iniciar explícitamente. No reinicia automáticamente por healthcheck fallido.

Web/API ejecutan como `node` (UID/GID 1000), sin capabilities y con `no-new-privileges`. DB conserva su entrypoint oficial para inicializar ownership y bajar a postgres. No se impone `read_only`: Next puede escribir caches y Prisma CLI necesita directorios temporales; no se habilita sin validar esas rutas.

Valores iniciales configurables para desarrollo/pruebas: web/API 1 GiB y 1 CPU cada uno, DB 1 GiB y 2 CPU. PIDs: 512 web/API y 256 DB, incluyendo threads. Son márgenes iniciales, no capacidades productivas demostradas; ajustar con consumo observado antes del go-live. Variables: `WEB_MEMORY_LIMIT`, `API_MEMORY_LIMIT`, `DB_MEMORY_LIMIT`, `WEB_CPU_LIMIT`, `API_CPU_LIMIT`, `DB_CPU_LIMIT`, `WEB_PIDS_LIMIT`, `API_PIDS_LIMIT`, `DB_PIDS_LIMIT`. Los límites se aplican al runtime, no al proceso de build.

## Imágenes y contexto

Dockerfiles usan contexto raíz, manifests de ambos workspaces, lockfile único y pnpm 10.33.2 con instalación frozen. Node 22.23.3 Bookworm slim cumple engines y fija patch; DB conserva `postgis/postgis:16-3.5` del proyecto para las migraciones PostGIS. Actualizar pins deliberadamente con pruebas; no usan latest. Next standalone conserva su estructura monorepo y copia public/static. La API conserva únicamente build y dependencias productivas, datos necesarios y tooling operacional Prisma.

`.dockerignore` excluye entornos reales, dependencias locales, builds, resultados, caches y directorios de credenciales; `.env.example` sólo contiene placeholders. No pasar secretos como build args ni copiarlos al contexto. Las variables runtime son visibles a operadores con acceso Docker: restringir ese acceso.

Referencias: [Compose services](https://docs.docker.com/reference/compose-file/services/) y [Node official image pins](https://github.com/docker-library/official-images/blob/master/library/node).
