# Cancelación de reservas propias

Estado: implementado y aprobado para commits el 24 de noviembre de 2026.

## Alcance aprobado

Cancelación completa por el titular antes del inicio de un partido vigente. Conserva reserva, fecha y motivo privado opcional de hasta 500 caracteres; libera sus cupos y participación, reabre partidos completos y permite reinscripción. Un reintento sobre una reserva antigua no afecta una inscripción posterior. Reservar y cancelar incrementan la versión del partido.

Backend: [contrato y persistencia](../../apps/api/RESERVATIONS.md). Frontend: [componentes, hooks, validaciones y permisos](../../apps/web/docs/matches.md). Historial privado de tres reservas por página; el historial del organizador mantiene su alcance.

## Validación final

- `pnpm lint`, `pnpm typecheck`, `pnpm build` y `git diff --check` aprobados.
- 60 unitarios API y 211 web aprobados. La suite web también se ejecutó con pool threads y un worker.
- 75 integraciones PostgreSQL aprobadas en total. Las nueve suites sin fallos aprobaron 65 casos; las dos afectadas por timeouts de arranque durante la reconstrucción Docker aprobaron sus diez casos en repetición aislada. No se aumentaron límites ni se deshabilitaron controles del producto.
- La suite de reservas cubre 16 casos: cancelación de varios lugares, reapertura, fecha diaria, reinscripción, privacidad, paginación, permisos, sesión, CSRF, Origin, motivos inválidos, inicio, rollback y concurrencia con cancelación, reserva y edición. El almacenamiento real de throttling se limpia entre casos; el guard sigue activo.
- La prueba de migración usa un schema temporal de la base aislada y comprueba conservación de reservas existentes, defaults, unicidad parcial e historial.
- Cuatro recorridos Playwright aprobados: cancelación de reservas y tres regresiones de edición/cancelación de partidos. Incluyen desistimiento, error de red con motivo conservado, cupos, recarga, reinscripción e historial.
- Revisiones independientes funcional y de seguridad sin bloqueos. Cookies, sesión, CSRF, Origin, CORS y logging seguro conservados; el motivo sólo se expone al titular. El harness sustituye únicamente el transporte de email.

## Preparación local

Las ocho migraciones están aplicadas en desarrollo y pruebas. La nueva es `202611240001_reservation_cancellation`. Se verificó ausencia de reservas confirmadas en los partidos demo antes de renovar sus fechas mediante el seed de desarrollo. Catálogo: cuatro deportes y veinte ubicaciones; cuatro partidos demo futuros. No se eliminaron datos.

Se reconstruyó el stack con `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build --wait`. Los tres servicios quedaron saludables; Home, health, listado de Tolosa y detalles devolvieron 200. El servidor temporal del puerto 3002 se cerró. La aplicación permanece en `http://localhost:3000`.

## Pendientes excluidos

Cancelación parcial, lista de espera, notificaciones, nombres de acompañantes, contactos y cancelación de partidos con reservas activas. Publicar los commits, integrar por PR y verificar CI remota son pasos separados de esta entrega local.
