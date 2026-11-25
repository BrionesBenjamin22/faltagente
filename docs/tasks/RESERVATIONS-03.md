# Cancelación de partidos con reservas activas

Estado: implementado, validado manualmente y aprobado para commits el 24 de noviembre de 2026. El usuario confirmó que la cancelación funciona y que el motivo figura en el historial; solicitó ejecutar los commits.

## Entrega aprobada

El organizador puede cancelar partidos futuros OPEN/CLOSED con reservas. Una transacción valida versión y consistencia, cancela las reservas confirmadas con fuente MATCH, desactiva participaciones PLAYER/ORGANIZER, restituye disponibilidad, incrementa versión una vez y registra un único evento. Los reintentos autorizados no duplican efectos ni reescriben motivo o fechas. Las bajas USER anteriores permanecen intactas.

El motivo del organizador sólo se expone a titulares con reserva confirmada al cancelar, mediante contexto privado del historial independiente de su página; tampoco se expone a quienes se bajaron antes. Mis partidos ofrece Organizados/Reservados con próximos, pasados y cancelados, nueve por página y prioridad de inscripción confirmada sobre bajas anteriores. El historial conserva tres elementos por página.

Contratos, persistencia, locks y errores: [API reservas](../../apps/api/RESERVATIONS.md) y [gestión](../../apps/api/MATCH-MANAGEMENT.md). Vistas, servicios, hooks, tipos, permisos y validaciones: [frontend](../../apps/web/docs/matches.md).

## Verificación

- Lint y typecheck globales, builds API/web, imágenes Docker y diff aprobados.
- 60 unitarios API y 216 web. Un timeout de importación de arranque bajo carga pasó al repetir la suite API con un worker y sin paralelismo de archivos.
- 79 integraciones PostgreSQL de la suite completa y dos casos posteriores de concurrencia entre partidos, todos aprobados. Cubren migración conservativa, restricciones, privacidad, versión, inicio, autorización, CSRF/Origin, rollback, cupos y participación diaria.
- Seis escenarios Playwright aprobados: dos nuevos de cancelación con reservas/Reservados, uno de reservas propias y tres regresiones de edición/cancelación. El test nuevo de paginación corrigió un selector para usar el nombre accesible real de los enlaces; aprobó en repetición aislada.
- Revisión independiente de seguridad sin bloqueos. Cookies, sesión, CSRF, Origin, CORS, SQL parametrizado, cachés por usuario y respuestas privadas no-store conservados.

## Preparación local

Nueve migraciones aplicadas en desarrollo y pruebas, incluida `202611250001_match_reservation_cancellation`. Fuente USER asignada a cancelaciones existentes sin cambiar fechas o motivos; confirmadas con fuente nula y CHECK reforzado. Cuatro deportes, veinte localidades y cuatro demos futuras verificadas; no se requirieron nuevos seeds ni reinicios de datos.

Imágenes reconstruidas con `docker compose -f docker-compose.yml -f docker-compose.dev.yml build api web` y servicios iniciados con `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --wait`. API, web y base saludables. Mis partidos y health devolvieron 200; OpenAPI del contenedor expone role organizer/player y source USER/MATCH. Servidor temporal de pruebas cerrado. Aplicación en `http://localhost:3000`.

## Pendientes excluidos

Cancelación parcial, reactivación de partidos, lista de espera/ofertas, acompañantes, contactos y notificaciones de negocio/email. Publicar commits, integrar por PR y verificar CI remota son pasos separados. El pendiente anterior de cancelación con reservas activas y el listado Reservados quedan resueltos por esta entrega.
