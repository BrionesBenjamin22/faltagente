# Falta Gente Web

Aplicación web de Falta Gente, creada con Next.js, React y TypeScript.

La interfaz, metadatos y nombres accesibles usan Falta Gente. Las claves existentes de apariencia se conservan para mantener preferencias; ver [convenciones de identidad](../../docs/agent/NAMING.md).

## Estructura actual

- `src/app/`: landing, Home, cuenta y rutas de autenticación del App Router.
- `src/features/`: autenticación, perfil, apariencia, localidades, partidos, reservas por cantidad y lista de espera.
- `src/lib/http.ts`: cliente HTTP con credenciales y CSRF.
- `src/components/`: estructura visual de la aplicación.
- `public/`: recursos estáticos servidos por Next.js.
- `next.config.ts`: configuración del framework.

La segunda iteración incorpora búsqueda accesible de localidades, gestión de cuenta y temas claro, oscuro y sistema, sobre la sesión existente. Ver [FRONTEND.md](FRONTEND.md) para vistas, contratos, permisos y validaciones.

## Comandos

Ejecutar desde la raíz del repositorio:

```bash
pnpm dev:web
pnpm --filter web lint
pnpm --filter web typecheck
pnpm --filter web test
pnpm --filter web build
```

El servidor de desarrollo usa `http://localhost:3000` por defecto. `NEXT_PUBLIC_API_URL` configura la API, incluyendo `/api/v1`. Las variables de Next.js se definen en `apps/web/.env.local`; no contiene secretos de backend.

## Docker

El contexto de build es la raíz del monorepo, no `apps/web`. La imagen multi-stage usa Node 22.23.3 y pnpm 10.33.2; instala con el lockfile y copia únicamente el output `standalone`, `public` y `.next/static` al runtime. El servidor se ejecuta como usuario `node` (UID/GID 1000), escucha en `0.0.0.0:3000` y responde al healthcheck HTTP sobre `/`. Next.js conserva su manejo de SIGTERM; Compose proporciona init y 30 segundos para finalizar.

Desde la raíz:

```bash
docker compose -f docker-compose.yml -f docker-compose.dev.yml build web
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait
```

El navegador sigue consumiendo la API directamente. `NEXT_PUBLIC_API_URL` debe ser una URL accesible desde el navegador, incluir `/api/v1` y coincidir con el backend publicado (localmente `http://localhost:3001/api/v1`). Nunca utilizar `http://api:3001` como URL del navegador: ese nombre pertenece a la red Docker.

`NEXT_PUBLIC_API_URL` y `NEXT_PUBLIC_SESSION_WARNING_SECONDS` son argumentos de build públicos que Next.js incorpora en JavaScript. Modificarlos requiere reconstruir la imagen; cambiarlos sólo en runtime no actualiza el bundle. No suministrar JWT, CSRF, credenciales de base de datos ni claves de email al build web. El runtime sólo necesita `NODE_ENV=production`, `HOSTNAME=0.0.0.0` y `PORT=3000`, configurados en la imagen.

No se modifica el cliente HTTP: conserva cookies mediante `credentials: "include"` y obtiene un token CSRF por mutación. Las URLs públicas de frontend y API requieren CORS explícito en backend. El filesystem permanece escribible para permitir caches de Next.js; no se habilita `read_only` sin validar sus necesidades de escritura.

Consultar [Docker](../../docs/DOCKER.md) para migraciones controladas, configuración, logs, persistencia y parada del stack.

## Compartir partidos

El detalle público permite copiar su enlace y abrir WhatsApp, Telegram, X o las aplicaciones nativas disponibles. Un disparador con icono abre un popover en escritorio y un bottom sheet modal en móvil. Ver [MATCH-SHARING.md](MATCH-SHARING.md) para componentes, permisos, validaciones, accesibilidad y pruebas.

## Inscripción a partidos

El detalle `/partidos/:id` conserva su contenido público y agrega inscripción autenticada de uno a 100 lugares, limitada por la disponibilidad informada. Los visitantes acceden a Login. El organizador no reserva su propio partido; los partidos completos permiten ingresar en lista de espera y los cancelados o iniciados no admiten nuevas inscripciones.

`POST /api/v1/matches/:id/reservations` recibe `{ places: number }` y devuelve `{ id, matchId, places, originalPlaces, version, createdAt }`. Usa el cliente compartido con cookies y CSRF. `GET /api/v1/matches/:id/reservations/me` devuelve esa reserva propia o `null`, permitiendo recuperar la confirmación al recargar. La caché privada se separa por usuario y partido; éxito y conflictos refrescan la disponibilidad pública. Backend valida capacidad, propiedad y participación diaria de forma atómica.

Titular y organizador pueden reducir una reserva de tres lugares a dos, con confirmación de la cantidad liberada y conservada. La reserva mantiene al menos el lugar del titular; para dejarla sin lugares se cancela completamente. El titular no ingresa motivo; sólo el organizador dispone de un motivo opcional para reducir o cancelar reservas. No se cargan nombres ni registros individuales de acompañantes. El organizador consulta nueve reservas confirmadas por página y el titular accede a su historial y movimientos privados de tres elementos por página. Las operaciones permanecen en detalle, muestran feedback y exigen recarga explícita ante conflictos de versión.

Consultar [partidos y reservas](docs/matches.md) para vistas, componentes, servicios, tipos, hooks, permisos, validaciones y contratos, y [lista de espera](docs/waitlist.md) para la reasignación de lugares liberados.
