# Lista de espera: etapa aprobada

El usuario confirmó el funcionamiento mediante validación manual y solicitó los commits de esta etapa el 25 de noviembre de 2026.

## Resultado

Lista de espera integrada de punta a punta: solicitudes, selección por mejor aprovechamiento y antigüedad, ofertas con retención de hasta quince minutos, aceptación, rechazo, salida, vencimiento, reasignación, gestión del organizador y En espera en Mis partidos. Las operaciones protegen disponibilidad, idempotencia y una sola participación confirmada por fecha local.

Contratos y operación: [backend](../apps/api/WAITLIST.md). Vistas, service, hooks y validaciones: [frontend](../apps/web/docs/waitlist.md).

## Evidencia de validación

- `pnpm lint`: aprobado.
- `pnpm typecheck`: aprobado.
- `pnpm test --maxWorkers=1`: 294 pruebas aprobadas, 64 API y 230 web.
- `pnpm test:integration --maxWorkers=1 --no-file-parallelism`: 95 pruebas aprobadas en PostgreSQL aislado.
- `pnpm build`: aprobado.
- `pnpm test:e2e:ci`: 34 pruebas de navegador aprobadas, 25 del harness y 9 externas.
- Pruebas específicas de lista de espera: 4 unitarias backend, 13 de integración, 8 frontend y 3 de navegador.
- Tras el ajuste final de dos textos de vencimiento se repitieron ESLint de los archivos afectados y las ocho pruebas frontend; la imagen web se reconstruyó con ese resultado final.
- Revisión independiente de seguridad sin bloqueos pendientes. Se verificaron permisos, CSRF, privacidad y atomicidad.

No se realizaron pruebas de carga a gran escala. Las pruebas concurrentes y por lotes verifican los escenarios funcionales incluidos, sin representar una medición de capacidad productiva.

## Desarrollo local preparado

Migración `202611250002_waitlist` aplicada a desarrollo y diez migraciones al día. No fue necesario ejecutar seeds ni reiniciar datos. Imágenes API y web reconstruidas, servicios Compose saludables, web en `http://localhost:3000`, API en `http://localhost:3001` y `/health` correcto. El listado privado devolvió 401 sin sesión. La base aislada de pruebas se detuvo al terminar.

Comandos utilizados con los archivos Compose del proyecto:

```powershell
docker compose -f docker-compose.yml -f docker-compose.dev.yml build api web
docker compose -f docker-compose.yml -f docker-compose.dev.yml run --rm --no-deps api node node_modules/prisma/build/index.js migrate deploy
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --no-build api web
docker compose -f docker-compose.yml -f docker-compose.dev.yml exec -T api node node_modules/prisma/build/index.js migrate status
```

## Trabajo separado

La compañera responsable de notificaciones deberá implementar el consumidor de eventos, persistencia de notificaciones in-app, entrega por email, reintentos y plantillas. Esta etapa entrega los eventos persistidos y el lector por cursor, sin realizar envíos ni incorporar infraestructura externa. No quedan pendientes funcionales de la lista de espera dentro del alcance aprobado.
