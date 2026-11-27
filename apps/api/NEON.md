# Integración PostgreSQL con Neon

La etapa prepara la base remota y su operación explícita desde el repositorio. No publica la API ni el frontend. Se conserva Prisma 6 y el transporte PostgreSQL TCP del backend NestJS.

## Configuración y aislamiento

`neon.ts` declara Postgres sin activar Neon Auth. La autenticación de Falta Gente conserva sus contratos y controles actuales. `.neon` contiene el vínculo local con el proyecto y no se versiona.

La CLI Neon 9.10.0 se instaló globalmente durante la preparación. `pnpm neon:pull` descarga las variables a `.env.neon.local`, ignorado por Git. No usar la descarga predeterminada al `.env` de Docker: `neon init` y `neon deploy` pueden escribir allí. Para volver a aplicar la política sin descargar variables al archivo predeterminado, usar `neon deploy --no-env-pull` y luego `pnpm neon:pull`.

El archivo separado requiere `DATABASE_URL` pooled y `DATABASE_URL_UNPOOLED` directa, ambas con TLS y correspondientes al mismo endpoint, rol, base y schema. No compartirlas con el frontend. El wrapper rechaza el uso de la base local como fallback y admite archivos UTF-8 con BOM de Windows.

`neon:start` hereda las opciones locales de API desde `apps/api/.env`; `.env.neon.local` puede sobrescribir `NODE_ENV`, `PORT`, `CORS_ORIGINS`, `FRONTEND_URL`, `JWT_SECRET`, `CSRF_SECRET`, `BREVO_API_KEY` y `EMAIL_FROM`. Es una herramienta para ejecutar localmente contra Neon. La publicación requiere configurar secretos y orígenes productivos en el proveedor.

## Comandos desde la raíz

| Comando | Comportamiento |
| --- | --- |
| `pnpm neon:pull` | Descarga variables al archivo separado; requiere CLI autenticada. |
| `pnpm neon:status` | Consulta migraciones con conexión directa. |
| `pnpm neon:check` | Verifica consultas, transacción, advisory lock y conteos por pooler. |
| `pnpm neon:start` | Ejecuta `apps/api/dist/main.js` usando el pooler; requiere build previo. |
| `pnpm neon:migrate --apply` | Aplica migraciones existentes de forma explícita mediante conexión directa. |
| `pnpm neon:seed --apply` | Carga sólo catálogos mediante conexión directa. |
| `pnpm test:neon` | Ejecuta pruebas del wrapper sin conexiones remotas. |

El wrapper también acepta `--env-file <ruta>`. Migraciones y seed requieren `--apply` y nunca se ejecutan al iniciar la API. No admite `--development`, reset ni creación de migraciones remotas. Las suites de integración existentes conservan su base local aislada y no deben apuntarse a `production`.

Los advisory locks transaccionales del dominio se conservan. Los locks de sesión de Prisma Migrate utilizan la conexión directa. Los endpoints, payloads, modelos y reglas de negocio de la aplicación no cambian por esta integración.

## Estado y validación pendiente

Se verificó inicialmente la rama vacía `production` del proyecto `twilight-salad-62280349`. Se aplicaron doce migraciones y el seed de catálogos: veinte registros de localidades y cuatro deportes, sin usuarios ni partidos ficticios. La consulta por pooler y el advisory lock aprobaron inicialmente. PostGIS está disponible en el proveedor; esta etapa no instala la extensión porque los modelos y migraciones actuales no la requieren.

Lint, typecheck, build, 342 tests existentes y ocho tests del wrapper aprobaron. Las pruebas nuevas cubren aislamiento de entornos, selección pooled/directa, TLS, endpoints coincidentes, redacción de secretos y compatibilidad Windows.

La validación posterior de navegador a API y Neon falló por conectividad: las conexiones directa y pooled no completaron el handshake PostgreSQL, incluso con el compute activo. Una repetición previa al commit también falló. Queda pendiente repetir `neon:check` y el recorrido de descubrimiento en navegador cuando se restablezca la conexión. El usuario autorizó expresamente guardar esta etapa con ese pendiente; no se considera una publicación validada ni una aprobación E2E.

## Referencias

- [Neon y Prisma](https://neon.com/docs/guides/prisma)
- [Pooling](https://neon.com/docs/connect/connection-pooling)
- [Frontend y conexión a la API](../web/FRONTEND.md#base-remota-neon)
