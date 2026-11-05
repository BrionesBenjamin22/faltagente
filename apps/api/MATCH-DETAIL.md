# Detalle público de partido

## Endpoint y contrato

`GET /api/v1/matches/:id` permite consultar un partido por UUID sin sesión. El controller valida el parámetro con `MatchIdDto`; `MatchesService.detail` consulta Prisma por clave primaria. No agrega repositorios ni modifica datos.

Respuesta `200`:

```json
{
  "id": "uuid",
  "sport": { "id": "uuid", "name": "Fútbol", "slug": "futbol" },
  "sportFormat": { "id": "uuid", "name": "Fútbol 5", "slug": "futbol-5" },
  "startsAt": "2026-11-04T00:30:00.000Z",
  "location": { "id": "uuid", "name": "Tolosa" },
  "placeName": "El Galpón",
  "address": "1 y 63",
  "pricePerPerson": "7000",
  "availablePlaces": 2,
  "description": "Nivel intermedio.",
  "status": "OPEN",
  "organizer": { "id": "uuid", "name": "Martín R." }
}
```

`sportFormat` y `description` admiten `null`. `pricePerPerson` es un decimal serializado como string, con la misma representación de Prisma usada por el listado. `placeName` proyecta `Match.venueName`; el listado conserva su contrato `venueName` y `location.type`. El DTO OpenAPI del detalle es específico.

## Visibilidad y estados

La URL individual conserva acceso público para `OPEN`, `CLOSED` y `CANCELLED`, incluso si el inicio pasó o las identidades de catálogo están inactivas. Esto permite representar el estado real sin aplicar los filtros de descubrimiento. Los cancelados continúan excluidos del listado. Esta consulta no calcula reservas ni participantes.

La proyección Prisma selecciona exclusivamente los campos del contrato. El organizador expone únicamente `id` y `name`: nunca email, contraseña/hash, sesiones, tokens, historial o localidad privada. Las relaciones deportivas contienen solamente identidad pública. No cambia autenticación, cookies, CORS ni CSRF; permanece la protección HTTP global existente.

## Errores y pruebas

- UUID inválido: `400`, código `VALIDATION_ERROR`.
- UUID válido inexistente: `404`, código `NOT_FOUND`.
- Error inesperado: tratamiento seguro global `500`.

Todos siguen `{ code, message, requestId }`. `test/matches-detail.e2e-spec.ts` valida el contrato HTTP real con PostgreSQL aislado `hyt_slice_test`, opciones nulas, disponibilidad cero, estados, identidades inactivas y ausencia de campos privados. No requiere migraciones, variables nuevas ni cambios de Docker.
