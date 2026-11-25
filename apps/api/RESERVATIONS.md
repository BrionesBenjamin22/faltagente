# Inscripción a partidos

`POST /api/v1/matches/:id/reservations` requiere sesión y CSRF. Body: `{ "places": 1 }`, entero positivo hasta la disponibilidad. Responde 201 con `{id, matchId, places, createdAt}`. Repetir para el mismo usuario/partido y cantidad devuelve la reserva original; otra cantidad devuelve 409 `RESERVATION_ALREADY_EXISTS`.

`GET /api/v1/matches/:id/reservations/me` requiere sesión y devuelve únicamente la reserva propia confirmada o JSON `null`, conservando los campos existentes. Todas las respuestas privadas usan `Cache-Control: no-store`; nunca exponen reservas ajenas ni datos de contacto.

Los lugares publicados representan vacantes, excluyen al organizador y se descuentan de `availablePlaces` al reservar; `totalPlaces` conserva la capacidad publicada. Al ocupar el último lugar el partido pasa a `CLOSED`. La reserva y la participación `PLAYER` se confirman en una única transacción. Se bloquean las filas del usuario y del partido, en ese orden, antes de validar disponibilidad y fecha local de Buenos Aires. La publicación comparte el bloqueo del usuario y la restricción única parcial de Participation refuerza la regla diaria, también frente a publicación y reserva simultáneas.

Errores 409: `OWN_MATCH`, `MATCH_UNAVAILABLE`, `MATCH_FULL`, `DAILY_PARTICIPATION_CONFLICT`, `RESERVATION_ALREADY_EXISTS`, `RESERVATION_NOT_CANCELLABLE`, `RESERVATION_INCONSISTENT`. Datos inválidos: 400; sin sesión: 401; CSRF/Origin inválido: 403; partido o reserva propia inexistente: 404. No se incorporan nombres de acompañantes, lista de espera ni emails de confirmación.

## Cancelación e historial privado

`POST /api/v1/matches/:id/reservations/:reservationId/cancel` exige sesión, CSRF y Origin permitido. Recibe `{reason?: string}`; recorta el motivo y admite hasta 500 caracteres. Devuelve 200 con `{id, matchId, places, createdAt, status, cancelledAt, cancellationReason, cancellationSource}`. La identidad se obtiene exclusivamente de la sesión. El motivo es privado al titular, incluso frente al organizador.

La transacción bloquea usuario y partido, en ese orden, y comprueba titularidad y pertenencia. Una reserva ya cancelada devuelve su resultado original sin repetir efectos, incluso después de una reinscripción. Una cancelación nueva exige partido vigente y futuro; conserva la reserva como `CANCELLED`, desactiva su participación PLAYER y devuelve todos sus lugares. Reabre un partido CLOSED. Rechaza inconsistencias de ocupación, participación, fecha local o estado sin modificar datos. Reservar y cancelar incrementan la versión del partido para coordinarse con su edición.

`GET /api/v1/matches/:id/reservations/history?page=1` devuelve `{items,total,page,pageSize:3,hasMore,matchCancellation}` sólo del titular. Cada item tiene los campos de la respuesta de cancelación. Orden: `createdAt DESC, id DESC`; página entera entre 1 y 10000. Incluye reservas confirmadas y canceladas, con cantidad, fechas y motivo privado.

`Reservation.status` admite CONFIRMED y CANCELLED; `cancelledAt` y `cancellationReason` conservan la cancelación. La migración `202611240001_reservation_cancellation` convierte las existentes en confirmadas sin alterar sus datos, valida coherencia de cancelación y reemplaza la unicidad anterior por un índice parcial para una sola reserva confirmada por usuario/partido. Reinscribirse crea otra reserva y reactiva la misma participación PLAYER con la fecha local actual, tras validar cupos y restricción diaria. La cancelación parcial queda fuera de alcance. La cancelación del partido con reservas activas se describe debajo.

Pruebas reales: `pnpm --filter api exec vitest run --config vitest.config.e2e.ts test/reservations.e2e-spec.ts` usando exclusivamente PostgreSQL loopback `falta_gente_test` configurado mediante `DATABASE_URL`.

## Cancelación por el organizador y fuente histórica

`Reservation.cancellationSource` distingue `USER` y `MATCH`. Las confirmadas conservan fuente, fecha y motivo nulos; las canceladas requieren fuente y fecha. El motivo privado del titular sólo pertenece a USER. Las cancelaciones MATCH conservan `cancellationReason = null`: el motivo del organizador permanece en Match. La migración `202611250001_match_reservation_cancellation` asigna USER a las bajas anteriores sin modificar sus fechas ni motivos y refuerza estas reglas mediante CHECK.

La cancelación del partido convierte todas sus reservas confirmadas en CANCELLED/MATCH con la misma fecha, desactiva las participaciones activas y restituye `availablePlaces = totalPlaces` dentro de una única transacción. No modifica bajas anteriores. Un reintento individual sobre una reserva cancelada por el partido devuelve su fuente MATCH sin reescribirla. Ver [gestión de partidos](MATCH-MANAGEMENT.md).

El historial privado agrega `cancellationSource` en cada elemento y `matchCancellation: {cancelledAt,reason} | null` en la respuesta. Sólo devuelve ese contexto si el usuario de sesión tiene una reserva de ese partido con fuente MATCH; la consulta no depende de la página. Quien se bajó voluntariamente antes, terceros y visitantes no acceden al motivo del organizador. `GET /reservations/me` mantiene su contrato y devuelve null tras la cancelación.

Validación y aprobación manual: [RESERVATIONS-03](../../docs/tasks/RESERVATIONS-03.md).
