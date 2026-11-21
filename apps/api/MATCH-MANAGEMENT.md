# Edicion y cancelacion de partidos (MVP-05)

## Endpoints privados

Todos requieren sesion. Las mutaciones mantienen CSRF y validacion de Origin globales. La identidad proviene de la sesion y se verifica propiedad en backend. Los errores conservan `{code,message,requestId}`.

- `GET /api/v1/matches/:id/management`: conserva id, capacidad, disponibilidad, version y auditoria. Agrega sport, sportFormat y location con identidad, nombre y estado activo; startsAt, placeName, address, pricePerPerson decimal string, description, status, cancelledAt, cancellationReason, occupiedPlaces, activePlayerCount, hasConfirmedParticipants, canEdit, canCancel y canAdjustCapacity. Toda la respuesta usa un snapshot RepeatableRead; el formulario no debe combinar versiones de otras lecturas.
- `PATCH /api/v1/matches/:id`: `{expectedVersion,...camposModificados}`. Campos permitidos: sportId, sportFormatId, locationId, startsAt, placeName, address, pricePerPerson, totalPlaces y description. Solo sportFormatId y description aceptan null. Responde 200 `{id}`.
- `POST /api/v1/matches/:id/cancel`: `{expectedVersion,reason?}`; motivo string de hasta 500 caracteres despues de trim. Vacio se persiste null. Responde 201 `{id}`, tambien ante repeticion autorizada.
- `GET /api/v1/matches/:id/history?page=1`: privado al organizador, tres eventos por pagina, incluye PUBLISHED, UPDATED y CANCELLED.

## Reglas y trazabilidad

Solo se editan partidos OPEN/CLOSED futuros. La cancelacion es anterior al inicio. Cada transaccion bloquea primero User organizador y despues Match, compara expectedVersion y aplica cambios/auditoria en una operacion atomica. Las ediciones normalizan trim, decimal e instante. Sin diferencias no cambian version, updatedAt ni historial.

Con jugadores activos o lugares ocupados solo se permite descripcion/capacidad. La ocupacion es totalPlaces - availablePlaces; cambiar capacidad aplica el mismo delta a disponibilidad y deriva OPEN/CLOSED. Una reserva puede abarcar varios lugares: ocupacion mayor que cantidad de jugadores puede ser valida. Ocupacion positiva sin jugadores o jugadores superiores a ocupacion bloquean el ajuste. Las relaciones historicas inactivas y datos heredados omitidos se conservan; reemplazos exigen catalogos activos y formato del deporte resultante. Cambiar fecha actualiza localDate del organizador y verifica exclusividad diaria de Buenos Aires bajo lock y constraint parcial.

Cada cambio efectivo incrementa version y crea un unico evento con actor y diferencias before/after. Los cambios de relaciones guardan snapshots id/nombre; capacidad registra tambien disponibilidad/estado derivados. Cancelar registra fecha/motivo y desactiva Participation ORGANIZER; conserva partido y cupos. Su repeticion comprueba autenticacion/propiedad y no modifica fecha, motivo, version ni historial, aun con expectedVersion anterior.

El motivo permanece privado en management/history del organizador. Detalle y listados publicos no lo exponen. CANCELLED queda fuera de descubrimiento y permanece en filtro cancelled de Mis partidos.

## Errores de dominio

- MATCH_VERSION_CONFLICT (409): recargar explicitamente y revisar; no sobrescribir cambios.
- MATCH_NOT_EDITABLE (409): partido iniciado o cancelado.
- MATCH_FIELDS_RESTRICTED (409): cambios criticos con participantes.
- MATCH_CAPACITY_INCONSISTENT (409): revisar integracion de reservas antes de ajustar capacidad.
- MATCH_CAPACITY_INSUFFICIENT (409): capacidad inferior a ocupacion.
- MATCH_CANCELLATION_REQUIRES_RESERVATIONS_INTEGRATION (409): cancelacion temporalmente bloqueada con jugadores o cupos ocupados. Esta entrega no cancela reservas.
- PARTICIPATION_DATE_CONFLICT (409): otro compromiso activo en la fecha local.
- SPORT_INVALID, SPORT_FORMAT_INVALID, LOCATION_INVALID, MATCH_START_INVALID (400): corregir el dato seleccionado.
- MATCH_MANAGEMENT_FORBIDDEN (403): partido ajeno.

## Modelo y migracion

Migracion aditiva `202611190001_match_cancellation`: Match.cancelledAt timestamptz(3) nullable y Match.cancellationReason varchar(500) nullable. Los registros historicos conservan null; no se inventa auditoria. Sin dependencias nuevas ni cambios de infraestructura, auth o reservas.

## Validacion

`test/match-mutations.e2e-spec.ts` usa PostgreSQL aislado real para permisos, validacion parcial/nulos, CSRF/Origin, capacidad, estado, catalogos conservados, fecha diaria, cancelacion idempotente/privada y concurrencia. `match-mutation-dto.spec.ts` cubre allowlist/nulos/normalizacion/version. La prueba de migracion historica aplica la migracion y verifica preservacion y nulls.
