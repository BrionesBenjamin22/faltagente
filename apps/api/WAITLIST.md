# Lista de espera

## Alcance aprobado

Módulo NestJS `src/waitlist`, integrado con publicación, edición, reservas y cancelaciones. No envía emails ni crea notificaciones in-app. Conserva eventos internos para que el módulo de notificaciones se implemente por separado.

Un usuario autenticado puede solicitar entre uno y el menor valor entre 100 y la capacidad publicada de un partido completo y futuro, siempre que no lo organice ni tenga participación confirmada en esa fecha local. Sólo puede tener una solicitud activa por partido. Repetir el ingreso con la misma cantidad devuelve la existente; cambiar la cantidad requiere salir y volver a ingresar, con nueva antigüedad. La salida identifica la solicitud concreta para que un reintento anterior no afecte una nueva.

La asignación selecciona la mayor cantidad que entre en los lugares disponibles; desempata por antigüedad y luego por ID. No divide solicitudes. Puede emitir varias ofertas independientes. Cada oferta retiene sus lugares durante 15 minutos como máximo, sin superar el inicio del partido. `availablePlaces` excluye las retenciones: capacidad = reservas confirmadas + ofertas pendientes + disponibilidad.

Aceptar crea una reserva normal y participación PLAYER dentro de la misma transacción, con máximo de 100 lugares validado también en el núcleo compartido. Invalida las otras solicitudes y ofertas del usuario para la fecha local de Buenos Aires. Reservar directamente, publicar o cambiar la fecha de un partido aplica la misma limpieza. Reintentar una aceptación devuelve la misma reserva con su cantidad vigente, `originalPlaces` y `version`, incluso si después fue reducida o cancelada; nunca la recrea. Rechazar o vencer finaliza la solicitud y reasigna los cupos. Para volver a participar se requiere un ingreso nuevo y que el partido siga completo.

Reducir una reserva por cantidad, desde el titular o el organizador, reasigna los lugares liberados a solicitudes compatibles en esa misma transacción. Una reducción conserva la participación diaria del titular; sólo cancelar la reserva completa la desactiva. Los cupos liberados pueden quedar inmediatamente retenidos por ofertas y el partido continuar completo. Contratos y permisos: [reservas por cantidad](RESERVATIONS.md).

## API

Todas las rutas usan `/api/v1`, sesión y respuestas privadas `Cache-Control: no-store`. Las mutaciones exigen CSRF y Origin permitido. Los IDs son UUID y la identidad siempre proviene de la sesión.

| Método | Ruta | Resultado |
| --- | --- | --- |
| POST | `/matches/:id/waitlist` | 201; recibe `{places: number}` entero de 1 a 100 y hasta la capacidad publicada; devuelve la solicitud |
| GET | `/matches/:id/waitlist/me` | 200; última solicitud propia, incluida terminal, o `null` |
| POST | `/matches/:id/waitlist/:entryId/leave` | 200; solicitud finalizada |
| GET | `/matches/:id/waitlist?page=1` | 200; solicitudes activas, sólo para el organizador |
| POST | `/waitlist/offers/:offerId/accept` | 200; reserva confirmada o resultado original del reintento |
| POST | `/waitlist/offers/:offerId/reject` | 200; solicitud finalizada |
| GET | `/users/me/waitlist?page=1` | 200; solicitudes activas propias con datos del partido |

Solicitud: `{id,matchId,places,status,createdAt,offer}`. Oferta nullable: `{id,status,places,expiresAt,reservationId}`. Fechas JSON en ISO 8601. Listados: `{items,total,page,pageSize:9,hasMore}`, página entera de 1 a 10000. El listado del organizador agrega `user:{id,name}`, nunca contacto; el propio agrega `match:{id,startsAt,venueName,address,status,availablePlaces,sport,sportFormat,location}`.

Conflictos 409 incluyen `WAITLIST_MATCH_NOT_FULL`, `WAITLIST_ALREADY_EXISTS`, `WAITLIST_PLACES_INVALID`, `WAITLIST_OFFER_UNAVAILABLE`, `DAILY_PARTICIPATION_CONFLICT`, `OWN_MATCH` y `MATCH_UNAVAILABLE`. Propiedad inválida: 403 `WAITLIST_FORBIDDEN`; sesión ausente: 401; IDs o payload inválidos: 400; entidad inexistente: 404. Se mantiene el formato seguro de error de la API.

## Persistencia, estados y auditoría

La migración `202611250002_waitlist` agrega `WaitlistEntry`, `WaitlistOffer` y `WaitlistEvent`, relaciones y restricciones de integridad. No requiere seed ni reiniciar datos existentes.

- Solicitud: `WAITING`, `OFFERED`, `COMPLETED`, `LEFT`, `EXPIRED`, `INVALIDATED`.
- Oferta: `PENDING`, `ACCEPTED`, `REJECTED`, `EXPIRED`, `INVALIDATED`.
- Se conservan solicitudes, ofertas y eventos terminales; no se borran al invalidar.
- Índice parcial: una solicitud activa por usuario/partido. Oferta única por solicitud y reserva vinculada única.

Con solicitudes activas se restringen los campos críticos de edición. Descripción y capacidad pueden ajustarse respetando reservas y retenciones. Gestión agrega `heldPlaces`, `activeWaitlistCount` y `hasActiveWaitlist`; `occupiedPlaces` cuenta únicamente reservas confirmadas. El detalle público incorpora `totalPlaces`. Cancelar el partido invalida solicitudes y ofertas sin perder trazabilidad.

## Concurrencia y vencimientos

Todos los escritores de disponibilidad y participación diaria toman primero el advisory lock transaccional PostgreSQL `(17312025,1)` y luego los bloqueos de filas correspondientes. El núcleo `matches/booking-core.ts` comparte la confirmación entre reserva directa y aceptación. La serialización global es una decisión del MVP; deberá revisarse si el volumen exige más concurrencia. Los escritores futuros deben respetar el mismo bloqueo.

El proceso interno corre al iniciar el módulo y cada 30 segundos, sin solaparse dentro de una instancia. Usa reloj de PostgreSQL, hasta 50 partidos por pasada, una transacción por partido y hasta 200 solicitudes vencidas por lote. Continúa los pendientes en pasadas siguientes; no necesita cola externa. Las operaciones interactivas también liquidan vencimientos. Los GET muestran el estado efectivo sin escribir ni liberar cupos. La aceptación valida el plazo con reloj de base de datos y rechaza ofertas vencidas aunque todavía no haya corrido el proceso.

## Contrato interno para notificaciones

`WaitlistModule` exporta `WaitlistEventsService.readAfter(cursor = '0', limit = 100)`. El cursor es una cadena decimal no negativa; límite entero de 1 a 500. Devuelve `{items,nextCursor}` en orden ascendente. No existe endpoint HTTP de eventos.

Cada evento tiene `id` UUID estable, `cursor` decimal, `schemaVersion:1`, `type`, `occurredAt`, `recipientId`, `matchId`, `entryId`, `offerId` nullable, `places`, `expiresAt` nullable y `reason` nullable. Tipos emitidos: `ENTRY_JOINED`, `OFFER_CREATED`, `OFFER_ACCEPTED`, `OFFER_REJECTED`, `OFFER_EXPIRED`, `OFFER_INVALIDATED`, `ENTRY_COMPLETED`, `ENTRY_LEFT`, `ENTRY_EXPIRED`, `ENTRY_INVALIDATED`. Los eventos se persisten en la misma transacción que la transición; el bloqueo de dominio ordena sus commits.

El futuro consumidor debe conservar su propio cursor después de procesar y deduplicar por `id`; varios eventos pueden corresponder a una misma transición de solicitud/oferta. Debe decidir qué tipos producen notificaciones, comprobar vigencia cuando corresponda y resolver entrega, reintentos y plantillas en su propio módulo. No hay consumidor, marca de entrega, preferencias ni transporte implementados en esta etapa.

## Verificación

Cuatro pruebas unitarias de selección y trece pruebas con PostgreSQL real cubren permisos, privacidad, idempotencia, concurrencia, cupos retenidos, fecha local, edición, cancelación, rollback, vencimiento por lotes y cursor de eventos. Ver `src/waitlist/waitlist.domain.spec.ts`, `test/waitlist.e2e-spec.ts` y [validación de etapa](../../docs/WAITLIST.md).
