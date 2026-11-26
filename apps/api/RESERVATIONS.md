# Reservas por cantidad de lugares

## Alcance y organización

Una reserva representa al titular y una cantidad de lugares, sin nombres ni registros individuales de acompañantes. El titular y el organizador pueden reducir esa cantidad antes del inicio del partido. El titular conserva al menos un lugar; dar de baja su asistencia requiere cancelar la reserva completa. Sólo el organizador puede indicar un motivo opcional al reducir o cancelar una reserva.

`matches/reservations.module.ts` contiene los DTOs, respuestas OpenAPI, controller y service. La confirmación comparte `matches/booking-core.ts` con la aceptación de ofertas de espera; `reservation-cancellations.domain.ts` registra los movimientos de baja y `reservation-limits.ts` define el máximo de 100 lugares por reserva. La persistencia usa Prisma sin incorporar capas vacías, servicios externos ni nuevas notificaciones.

Los lugares publicados excluyen al organizador. `totalPlaces` conserva la capacidad del partido y `availablePlaces` excluye tanto reservas confirmadas como ofertas pendientes de la [lista de espera](WAITLIST.md). Una reducción libera la diferencia entre cantidad anterior y nueva; la capacidad publicada no cambia.

## API y permisos

Todas las rutas siguientes llevan el prefijo `/api/v1`, requieren sesión y devuelven respuestas privadas `Cache-Control: no-store`. Las mutaciones exigen CSRF y Origin permitido. Los IDs son UUID; la identidad y los permisos se obtienen de la sesión y de la pertenencia persistida, nunca de campos del cliente.

| Método | Ruta | Payload | Resultado |
| --- | --- | --- | --- |
| POST | `/matches/:id/reservations` | `{places}` | 201; reserva confirmada |
| GET | `/matches/:id/reservations/me` | — | 200; reserva propia confirmada o `null` |
| GET | `/matches/:id/reservations?page=1` | — | 200; nueve reservas confirmadas por página, sólo para el organizador |
| PATCH | `/matches/:id/reservations/:reservationId/places` | `{expectedVersion,places,reason?}` | 200; reserva con la cantidad conservada, sólo para titular u organizador |
| POST | `/matches/:id/reservations/:reservationId/cancel` | `{}` | 200; reserva cancelada, sólo para su titular |
| POST | `/matches/:id/reservations/:reservationId/cancel-by-organizer` | `{expectedVersion,reason?}` | 200; `{id}`, sólo para el organizador |
| GET | `/matches/:id/reservations/history?page=1` | — | 200; historial propio de reservas, tres por página |
| GET | `/matches/:id/reservations/:reservationId/cancellations?page=1` | — | 200; movimientos privados de esa reserva, tres por página, sólo para su titular |

La respuesta de creación y consulta propia es `{id,matchId,places,originalPlaces,version,createdAt}`. La respuesta de reducción y cancelación del titular agrega `{status,cancelledAt,cancellationReason,cancellationSource}`. Las fechas se serializan en ISO 8601. La cancelación por organizador responde únicamente `{id}` y no expone el historial privado del titular.

El listado del organizador devuelve `{items,total,page,pageSize:9,hasMore}`. Cada item contiene los campos de la reserva y `holder:{id,name}`; no incluye contactos, motivos ni movimientos. Orden estable: `createdAt ASC, id ASC`. Un usuario que no organiza el partido recibe 403 `RESERVATIONS_FORBIDDEN`; las acciones sobre reservas que no puede gestionar y las consultas de movimientos ajenos devuelven 404.

## Validación, versiones e idempotencia

`places` debe ser un entero entre 1 y 100 y no superar la disponibilidad al crear. El organizador no puede reservar su propio partido. La confirmación crea una participación `PLAYER`, comprueba la fecha local de Buenos Aires y rechaza otra participación activa en esa fecha, tanto como jugador como organizador. Repetir la creación con la misma cantidad vigente devuelve la reserva existente; una cantidad distinta devuelve 409 `RESERVATION_ALREADY_EXISTS`.

Para reducir, `places` es la cantidad a conservar: no admite cero ni aumentos. Por ejemplo, una reserva de tres pasa a dos y libera un lugar. `expectedVersion` es un entero positivo y corresponde a la versión de la reserva. Una versión desactualizada devuelve 409 `RESERVATION_VERSION_CONFLICT`, incluso cuando la cantidad solicitada coincide con la actual. La misma cantidad y versión vigente devuelve el estado actual sin modificar la reserva ni crear un movimiento.

Sólo el organizador puede enviar `reason` en una reducción. El titular que lo incluya recibe 400 `RESERVATION_REASON_FORBIDDEN`, también en una solicitud sin cambios. La cancelación total del titular admite únicamente `{}` y rechaza campos adicionales, incluido `reason`. El motivo del organizador admite hasta 500 caracteres después de recortar espacios; vacío se persiste como `null` y queda disponible al titular en su historial privado.

Una cancelación total nueva exige reserva confirmada y partido vigente y futuro. Desactiva la participación `PLAYER` del titular y libera todos los lugares que conservaba. La ruta del organizador valida además `expectedVersion`. Un reintento autorizado sobre una reserva ya cancelada no duplica movimientos, no vuelve a liberar cupos y no reescribe motivo, fuente ni fecha, incluso después de una reinscripción.

Las reducciones conservan activa la participación `PLAYER` y, por lo tanto, el bloqueo para otra participación del mismo día. Tras una cancelación total, reinscribirse crea una nueva reserva y reactiva esa participación únicamente si las reglas de fecha y disponibilidad lo permiten.

## Transacciones, disponibilidad y lista de espera

Las operaciones individuales de confirmación, reducción y cancelación de reserva utilizan la transacción y el advisory lock de dominio compartidos con la lista de espera. Después se bloquean las filas del usuario actor y del partido, en ese orden. El inicio se valida con el reloj de PostgreSQL y la fecha local se calcula en `America/Argentina/Buenos_Aires`.

Antes de liberar lugares se comprueban coherencia de reservas confirmadas, participaciones `PLAYER`, fecha local, estado del partido y ocupación: reservas confirmadas más retenciones deben explicar la diferencia entre capacidad y disponibilidad. Una inconsistencia provoca rollback. La reducción o cancelación incrementa las versiones de reserva y partido, registra el movimiento y asigna ofertas compatibles dentro de la misma transacción. Los lugares liberados pueden quedar inmediatamente retenidos por la lista de espera; el partido puede continuar completo.

No se permite sobre-reservar ni liberar dos veces bajo carreras entre reducciones, cancelación total, cancelación del partido, reserva directa y aceptación de ofertas. El núcleo compartido aplica el máximo de 100 también a las reservas confirmadas desde una oferta. Reintentar una aceptación devuelve la misma reserva, con `originalPlaces` y `version`, sin recrearla.

## Persistencia e historial privado

`Reservation.status` conserva `CONFIRMED` y `CANCELLED`. `originalPlaces` registra la cantidad inicial; `places` representa los lugares conservados mientras la reserva esté confirmada y conserva su cantidad inmediatamente anterior al cancelar totalmente. `version` comienza en 1 y aumenta ante reducciones y cancelaciones reales. Una confirmada conserva `cancelledAt`, `cancellationReason` y `cancellationSource` nulos.

`ReservationCancellation` registra `{id,reservationId,previousPlaces,remainingPlaces,occurredAt,source,reason}`. Una reducción conserva al menos un lugar y una cancelación total registra `remainingPlaces:0`. Las fuentes son `USER` para el titular, `ORGANIZER` para una reserva gestionada por el organizador y `MATCH` para la cancelación del partido. No se crean entidades de acompañantes ni una auditoría de nombres.

`GET /reservations/history` devuelve `{items,total,page,pageSize:3,hasMore,matchCancellation}`. Incluye las reservas propias confirmadas y canceladas, ordenadas por `createdAt DESC, id DESC`. Los motivos históricos `USER` anteriores a esta etapa se preservan y siguen siendo privados; el titular ya no puede ingresar nuevos motivos.

`GET /reservations/:reservationId/cancellations` devuelve `{items,total,page,pageSize:3,hasMore}`. Cada movimiento expone `{id,previousPlaces,remainingPlaces,occurredAt,source,reason}` y se ordena por `occurredAt DESC, id DESC`. El organizador puede reducir y cancelar reservas, pero no consultar estos movimientos privados. Ambas paginaciones aceptan páginas enteras entre 1 y 10000.

La cancelación del partido transforma sus reservas confirmadas en `CANCELLED/MATCH`, incrementa sus versiones y registra movimientos de cancelación total con la misma fecha. Desactiva las participaciones activas y restituye la capacidad en una transacción; conserva las bajas previas y las reducciones anteriores. El motivo del partido permanece en `Match`, no se copia en `Reservation.cancellationReason` ni en el movimiento `MATCH`.

El contexto `matchCancellation:{cancelledAt,reason}|null` del historial sólo se devuelve si el titular tiene una reserva con fuente `MATCH`, independientemente de la página. Quienes cancelaron antes, terceros y visitantes no reciben ese contexto. Ver [gestión de partidos](MATCH-MANAGEMENT.md).

## Migración y errores

La migración atómica `202611250003_reservation_places` agrega `originalPlaces`, `version` y `ReservationCancellation`, incorpora la fuente `ORGANIZER` y refuerza las restricciones. Inicializa `originalPlaces` con la cantidad existente y la versión en 1; conserva cantidades, estados, fechas, motivos, cupos y participaciones. No inventa movimientos históricos ni requiere un seed nuevo. Las migraciones anteriores siguen conservando la unicidad parcial de una reserva confirmada por usuario y partido.

Errores 409 relevantes: `OWN_MATCH`, `MATCH_UNAVAILABLE`, `MATCH_FULL`, `DAILY_PARTICIPATION_CONFLICT`, `RESERVATION_ALREADY_EXISTS`, `RESERVATION_PLACES_LIMIT`, `RESERVATION_VERSION_CONFLICT`, `RESERVATION_NOT_EDITABLE`, `RESERVATION_INCREASE_FORBIDDEN`, `RESERVATION_NOT_CANCELLABLE` y `RESERVATION_INCONSISTENT`. Payload inválido: 400; sin sesión: 401; CSRF/Origin inválido: 403; recursos inexistentes o reservas ajenas en acciones y movimientos: 404. Los errores conservan `{code,message,requestId}` sin datos privados ni logs de payloads.

## Validación y aprobación

Las pruebas de `test/reservations.e2e-spec.ts`, `test/waitlist.e2e-spec.ts` y `test/multisport-migration.e2e-spec.ts` usan PostgreSQL real aislado y cubren contratos, permisos, privacidad, restricciones, conservación de datos, versiones, reintentos, cupos, regla diaria y concurrencia.

Ejemplo desde la raíz, con `DATABASE_URL` configurado exclusivamente para PostgreSQL loopback `falta_gente_test`:

```bash
pnpm --filter api exec vitest run --config vitest.config.e2e.ts test/reservations.e2e-spec.ts --maxWorkers=1
```

La entrega actual fue validada manualmente y aprobada para commits el 26 de noviembre de 2026. Ver [RESERVATIONS-04](../../docs/tasks/finished/RESERVATIONS-04-quantity-reduction.md); la [entrega anterior](../../docs/tasks/RESERVATIONS-03.md) documenta la incorporación de cancelación de partidos con reservas activas.
