---
id: RESERVATIONS-04
title: Reducción de lugares y cancelación de reservas por titular y organizador
status: finished
phase: mvp
depends_on: [RESERVATIONS-03]
created_at: 2026-11-26T13:32:43-03:00
updated_at: 2026-11-26T13:39:22-03:00
started_at: null
resolved_at: 2026-11-26T13:39:22-03:00
resolution_commit: a3b57a20a332b5704ca6d941a79a0f7274b30d58
---

# Reservas por cantidad de lugares

El usuario corroboró manualmente la entrega y aprobó ejecutar los commits el 26 de noviembre de 2026. La fecha exacta de inicio de implementación no se registró; `started_at` permanece nulo.

## Alcance aprobado

- La reserva representa al titular y una cantidad de lugares; no se cargan nombres ni se crean registros individuales de acompañantes.
- Titular y organizador pueden reducir una reserva de tres a dos lugares antes del inicio, conservando al menos el del titular. No se admiten ampliaciones ni transferencias de titularidad.
- El titular reduce o cancela toda su reserva sin ingresar motivo. El organizador puede reducir o cancelar una reserva de su partido con motivo opcional de hasta 500 caracteres, visible para el titular.
- La reducción conserva la reserva CONFIRMED y la participación PLAYER activa. La cancelación total conserva la cantidad previa, termina la participación y permite reinscribirse sujeto a las reglas vigentes.
- Versión y cantidad original persistidas. Una versión desactualizada devuelve 409; una cantidad idéntica con versión vigente no escribe ni genera movimientos. La UI evita solicitudes sin diferencias y conserva el borrador ante conflictos para ofrecer recarga explícita.
- Listado privado del organizador: nueve reservas confirmadas por página. Historial del titular y movimientos privados: tres elementos por página. Cada movimiento registra cantidades, fecha, fuente USER, ORGANIZER o MATCH y motivo cuando corresponde.
- Máximo de cien lugares por reserva o solicitud de lista de espera. Liberación, actualización de versiones y reasignación de ofertas usan la misma transacción y bloqueo del dominio, sin doble liberación ni sobre-reserva.

Contratos y persistencia: [API de reservas](../../../apps/api/RESERVATIONS.md) y [lista de espera](../../../apps/api/WAITLIST.md). Vistas, componentes, hooks, permisos y validaciones: [frontend de partidos](../../../apps/web/docs/matches.md).

## Commits de implementación

- `81884ec`: backend, migración, contratos y pruebas de persistencia y concurrencia. El cambio de contrato queda señalado: la cancelación del titular recibe `{}` y rechaza `reason`; reservas y solicitudes de espera admiten hasta cien lugares.
- `a3b57a2`: frontend, documentación del módulo y pruebas de componentes y navegador. Completa el flujo aprobado y resuelve la etapa.

## Verificación

- `pnpm lint`, `pnpm typecheck`, `pnpm test --maxWorkers=1` y `pnpm build` aprobados: 64 unitarios API y 265 frontend.
- 106 integraciones con PostgreSQL real validadas. Las once suites no afectadas por carga aprobaron 74 casos; las suites de reservas y migración se repitieron sin la construcción Docker simultánea y aprobaron sus 32 casos, sin modificar timeouts.
- Diez escenarios Playwright aprobados: cuatro de cantidades y seis regresiones de reserva, cancelación y espera. Cubren no-op sin solicitud, conflicto con borrador conservado, recarga, movimientos paginados, reducción/cancelación por organizador con y sin motivo, retención y aceptación/expiración de ofertas.
- Permisos por propiedad, reservas ajenas 404, motivos exclusivos del organizador, movimientos privados al titular, CSRF, Origin, respuestas no-store, SQL parametrizado y reloj PostgreSQL conservados. Revisión independiente de seguridad sin bloqueos.
- Diff revisado y `git diff --check` aprobado. Layout, router, auth, hooks compartidos y componentes globales sin modificaciones.

## Preparación local

Migración `202611250003_reservation_places` aplicada en desarrollo. Conservó cuatro reservas con cantidad original y versión inicial correctas, sin inventar movimientos históricos ni cambiar motivos anteriores. Seeds de catálogo ejecutados explícitamente. Once migraciones aplicadas, sin pendientes.

Imágenes API/web reconstruidas y stack iniciado con los comandos completos de Compose; web, API y PostgreSQL saludables. Aplicación preparada en `http://localhost:3000`. La base y el servidor temporales de pruebas quedaron detenidos; no se reiniciaron datos de desarrollo.

Publicar la rama, integrar mediante PR y validar CI remota son acciones separadas de los commits autorizados.
