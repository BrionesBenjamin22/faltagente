# Descubrimiento multideporte — MVP-02

## Endpoint público

`GET /api/v1/matches` extiende el listado existente sin agregar endpoints de detalle ni escritura.

| Query | Requisito | Comportamiento |
|---|---|---|
| `locationId` | UUID obligatorio | Localidad exacta, activa |
| `sportId` | UUID opcional | Sin valor incluye todos los deportes |
| `sportFormatId` | UUID opcional | Requiere `sportId` y pertenencia del formato al deporte |
| `date` | Día calendario válido `YYYY-MM-DD` opcional | Día local en `America/Argentina/Buenos_Aires` |
| `page` | Entero de 1 a 10000 | Valor inicial 1, nueve elementos por página |

Ejemplo: `/api/v1/matches?locationId=<uuid>&sportId=<uuid>&sportFormatId=<uuid>&date=2026-11-03&page=1`.

Se combinan únicamente los filtros presentes. El catálogo de `GET /api/v1/sports` es la fuente de nombres, slugs, deportes y formatos activos para los selectores. El listado permite filtrar por identidades persistidas inactivas, respetando la política de MVP-01; no agrega un filtro de actividad deportiva.

## Reglas y respuesta

Se conservan partidos futuros, estados `OPEN` y `CLOSED`, localidad activa, orden `startsAt ASC, id ASC`, carga por páginas de nueve y respuesta `{items,total,page,pageSize,hasMore}`. Cada item conserva sus campos y `sport:{id,name,slug}`, `sportFormat:{id,name,slug}|null`. Consulta de elementos y conteo comparten los filtros y la transacción `RepeatableRead` existente.

El día se convierte en PostgreSQL a dos instantes con la zona nombrada: medianoche local incluida y medianoche siguiente excluida. La consulta mantiene además `startsAt > ahora`, incluso para la fecha actual. No cambia timestamps almacenados ni depende de la zona del servidor API. La conversión utiliza parámetros SQL, nunca interpolación de texto no confiable.

## Validaciones y seguridad

UUIDs, fecha con formato exacto y validez de calendario, paginación y propiedades desconocidas pasan por el DTO y la validación global. Formato sin deporte, formato inexistente o formato de otro deporte producen HTTP 400 con código `INVALID_SPORT_FORMAT_FILTER`. Los demás errores conservan el contrato global `{code,message,requestId}`. Un UUID de deporte o localidad inexistente devuelve una página vacía, sin requerir consulta administrativa.

El endpoint es público y de sólo lectura. No acepta identidad de usuario, no amplía los campos devueltos ni modifica auth, cookies, CSRF, perfil, localidad principal o constraints de participación. No existen operaciones nuevas de escritura, permisos administrativos ni historial mutable en este módulo.

## Pruebas

`test/matches-discovery.e2e-spec.ts` usa Nest y PostgreSQL real en una base local aislada llamada `hyt_slice_test`. Cubre filtros individuales y combinados, formatos incompatibles, UUIDs/fechas inválidos, años bisiestos, página vacía, conteo, `hasMore`, catálogo inactivo persistido y límites de medianoche con precisión de milisegundos. La suite previa de deportes conserva su validación de contrato y ahora acepta el filtro deportivo.

También fija únicamente el reloj de JavaScript dentro de un día con fixtures reales para comprobar que el filtro de fecha actual excluye partidos pasados y el instante exacto de inicio. Validación final: 34 integraciones aprobadas en la suite completa; ver evidencia en `../../tests/README.md`.

Ejecutar las suites según `../../tests/README.md`; nunca contra la base habitual o producción. No requiere migraciones ni cambios de seed.
