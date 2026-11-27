# Descubrimiento multideporte — MVP-02

## Endpoint público

`GET /api/v1/matches` extiende el listado existente sin agregar endpoints de detalle ni escritura.

| Query | Requisito | Comportamiento |
|---|---|---|
| `locationId` | UUID opcional | Localidad exacta, activa; sin valor incluye todas las localidades activas |
| `preferredLocationId` | UUID opcional | Prioriza esa localidad sin excluir otras; se ignora si se filtra por `locationId` |
| `sportId` | UUID opcional | Sin valor incluye todos los deportes |
| `sportFormatId` | UUID opcional | Requiere `sportId` y pertenencia del formato al deporte |
| `date` | Día calendario válido `YYYY-MM-DD` opcional | Día local en `America/Argentina/Buenos_Aires` |
| `page` | Entero de 1 a 10000 | Valor inicial 1, nueve elementos por página |

Ejemplo: `/api/v1/matches?locationId=<uuid>&sportId=<uuid>&sportFormatId=<uuid>&date=2026-11-03&page=1`.

Se combinan únicamente los filtros presentes. El catálogo de `GET /api/v1/sports` es la fuente de nombres, slugs, deportes y formatos activos para los selectores. El listado permite filtrar por identidades persistidas inactivas, respetando la política de MVP-01; no agrega un filtro de actividad deportiva.

## Reglas y respuesta

Se conservan partidos futuros, estados `OPEN` y `CLOSED`, localidad activa, carga por páginas de nueve y respuesta `{items,total,page,pageSize,hasMore}`. Sin preferencia se ordena por `startsAt ASC, id ASC`. Con preferencia y sin filtro de localidad, primero aparecen todos los partidos de la localidad priorizada y después los restantes, con el mismo orden cronológico dentro de cada grupo. La prioridad se aplica antes de paginar. Conteo y consultas de ambos grupos comparten una transacción `RepeatableRead`; se recuperan como máximo nueve resultados, sin cargar todo el listado en memoria. Cada item conserva sus campos y `sport:{id,name,slug}`, `sportFormat:{id,name,slug}|null`.

El día se convierte en PostgreSQL a dos instantes con la zona nombrada: medianoche local incluida y medianoche siguiente excluida. La consulta mantiene además `startsAt > ahora`, incluso para la fecha actual. No cambia timestamps almacenados ni depende de la zona del servidor API. La conversión utiliza parámetros SQL, nunca interpolación de texto no confiable.

## Validaciones y seguridad

UUIDs, fecha con formato exacto y validez de calendario, paginación y propiedades desconocidas pasan por el DTO y la validación global. Formato sin deporte, formato inexistente o formato de otro deporte producen HTTP 400 con código `INVALID_SPORT_FORMAT_FILTER`. Los demás errores conservan el contrato global `{code,message,requestId}`. Un UUID de deporte o localidad de filtro inexistente devuelve una página vacía. Una localidad preferida sin partidos conserva los resultados generales en orden cronológico.

El endpoint es público y de sólo lectura. No acepta identidad de usuario, no amplía los campos devueltos ni modifica auth, cookies, CSRF, perfil, localidad principal o constraints de participación. No existen operaciones nuevas de escritura, permisos administrativos ni historial mutable en este módulo.

## Pruebas

`test/matches-discovery.e2e-spec.ts` usa Nest y PostgreSQL real en una base local aislada llamada `falta_gente_test`. Cubre filtros individuales y combinados, formatos incompatibles, UUIDs/fechas inválidos, años bisiestos, página vacía, conteo, `hasMore`, catálogo inactivo persistido y límites de medianoche con precisión de milisegundos. La suite previa de deportes conserva su validación de contrato y ahora acepta el filtro deportivo.

También fija únicamente el reloj de JavaScript dentro de un día con fixtures reales para comprobar que el filtro de fecha actual excluye partidos pasados y el instante exacto de inicio. Validación final: 34 integraciones aprobadas en la suite completa; ver evidencia en `../../tests/README.md`.

El ajuste aprobado de listado global agrega cobertura de localidad opcional, prioridad entre páginas y transición entre grupos sin duplicados, combinación con filtros, preferencia sin resultados, localidad inactiva y UUID de preferencia inválido. La suite de descubrimiento pasa 14 casos sobre PostgreSQL real. No se ejecutaron pruebas de navegador por indicación del usuario.

Ejecutar las suites según `../../tests/README.md`; nunca contra la base habitual o producción. No requiere migraciones ni cambios de seed.
