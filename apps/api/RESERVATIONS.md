# Inscripción a partidos

`POST /api/v1/matches/:id/reservations` requiere sesión y CSRF. Body: `{ "places": 1 }`, entero positivo hasta la disponibilidad. Responde 201 con `{id, matchId, places, createdAt}`. Repetir para el mismo usuario/partido y cantidad devuelve la reserva original; otra cantidad devuelve 409 `RESERVATION_ALREADY_EXISTS`.

`GET /api/v1/matches/:id/reservations/me` requiere sesión y devuelve únicamente la reserva propia o JSON `null`. Ambas respuestas usan `Cache-Control: no-store`; nunca exponen reservas ajenas ni datos de contacto.

Los lugares publicados representan vacantes, excluyen al organizador y se descuentan de `availablePlaces` al reservar; `totalPlaces` conserva la capacidad publicada. Al ocupar el último lugar el partido pasa a `CLOSED`. La reserva y la participación `PLAYER` se confirman en una única transacción. Se bloquean las filas del usuario y del partido, en ese orden, antes de validar disponibilidad y fecha local de Buenos Aires. La publicación comparte el bloqueo del usuario y la restricción única parcial de Participation refuerza la regla diaria, también frente a publicación y reserva simultáneas.

Errores 409: `OWN_MATCH`, `MATCH_UNAVAILABLE`, `MATCH_FULL`, `DAILY_PARTICIPATION_CONFLICT`, `RESERVATION_ALREADY_EXISTS`. Datos inválidos: 400; sin sesión: 401; CSRF/Origin inválido: 403; partido inexistente: 404. Esta etapa no incorpora cancelación, nombres de acompañantes, lista de espera ni emails de confirmación.

Pruebas reales: `pnpm --filter api exec vitest run --config vitest.config.e2e.ts test/reservations.e2e-spec.ts` usando exclusivamente PostgreSQL loopback `falta_gente_test` configurado mediante `DATABASE_URL`.
