# Publicación de partidos

Esta entrega implementa creación y consulta del organizador. Edición, cancelación, reservas, acompañantes, espera y notificaciones quedan para etapas posteriores.

## Endpoints

Todas las rutas usan `/api/v1` y requieren sesión vigente. No se exige email verificado. `POST` conserva CSRF y validación de Origin.

| Método | Ruta | Contrato |
| --- | --- | --- |
| POST | `/matches` | Publica; devuelve `201 {id}`. |
| GET | `/users/me/matches?filter=upcoming&page=1` | Sólo partidos organizados por la sesión; filtros `upcoming`, `past`, `cancelled`; páginas de nueve. |
| GET | `/matches/:id/management` | Capacidad, versión y permisos; privado del organizador, sin fechas técnicas de auditoría. |

La ruta `/matches/:id/history` fue retirada y devuelve 404 a todos los usuarios. Los registros históricos y sus escrituras transaccionales se conservan internamente para una futura administración.

El payload de publicación es `{sportId, sportFormatId?, locationId, startsAt, placeName, address, pricePerPerson, totalPlaces, description?}`. UUIDs de catálogo activos; el formato opcional debe pertenecer al deporte. La localidad admite LOCALIDAD, BARRIO o ZONA. `startsAt` es ISO8601 con zona explícita y debe ser futuro. Se calcula el día local en PostgreSQL con `America/Argentina/Buenos_Aires`.

`placeName` (2–120 caracteres) se persiste como `venueName`; dirección admite 2–200 caracteres, descripción opcional hasta 2000. Se recortan espacios externos. Precio es una cadena decimal no negativa, hasta ocho enteros y dos decimales. Cupos son un entero JSON positivo hasta 2147483647. Campos desconocidos se rechazan. Identidad y estado no se reciben del cliente.

## Persistencia y concurrencia

`MatchPublicationController -> MatchPublicationService -> Prisma`. Dentro de una transacción se bloquea la fila del usuario, se validan catálogos y participación activa diaria y se crean Match, Participation(ORGANIZER) y MatchChange(PUBLISHED). El índice parcial de participación activa por usuario/día es una segunda protección. Conflictos devuelven `409 PARTICIPATION_DATE_CONFLICT`; fallos no dejan registros parciales.

`totalPlaces` representa lugares ofrecidos a jugadores. El organizador no consume cupos. Al crear, `availablePlaces = totalPlaces`, `status = OPEN` y `version = 1`. El historial conserva diferencias `{before, after}`, actor y fecha sin exponer lectura en la aplicación. Gestión ajena devuelve `403 MATCH_MANAGEMENT_FORBIDDEN`; inexistentes, 404. Errores mantienen `{code,message,requestId}` sin datos internos.

La migración aditiva `202611110001_match_publication` verifica que no haya PLAYER activos antes de inicializar `totalPlaces = availablePlaces`. No infiere capacidad a partir de participaciones. Conserva campos e identidades existentes; no genera eventos retrospectivos de publicación. Agrega constraints de capacidad y versión e índices para listado propio e historial.

## Contrato para reservas y próximas etapas

Reservas deberá bloquear usuario antes que partido, ordenar usuarios por ID cuando intervengan varios y comprobar estado, horario y disponibilidad bajo esos bloqueos. Descontar/devolver cupos, actualizar OPEN/CLOSED y aumentar versión serán una operación atómica. Ocupación se calcula como `totalPlaces - availablePlaces`, nunca contando participaciones: una reserva podrá representar varios lugares.

Edición y primera cancelación requerirán versión; todavía no existen esos endpoints. La cancelación con jugadores conservará el derecho del organizador y, hasta integrar reservas, tendrá un bloqueo temporal explicativo `MATCH_CANCELLATION_REQUIRES_RESERVATIONS_INTEGRATION`. La integración deberá cancelar reservas y participaciones conjuntamente y restaurar disponibilidad; no limitar definitivamente la cancelación a partidos vacíos.

## Validación

`test/match-publication.e2e-spec.ts` usa PostgreSQL real para transacción, concurrencia, día local, catálogos, entradas, CSRF/Origin, privacidad y listado propio paginado. `test/multisport-migration.e2e-spec.ts` comprueba preservación de datos y rechazo del backfill con jugadores activos. No se agregan dependencias, servicios ni tareas automáticas al arranque.
