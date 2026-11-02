# Dominio multideporte — MVP-01

## Alcance

MVP-01 conserva el listado existente y agrega un catálogo público persistido. Los filtros deportivos y de fecha se incorporan posteriormente en [MVP-02](DISCOVERY.md). Publicación, reservas y administración del catálogo no forman parte de estas tareas.

## Modelos y relaciones

`Sport` contiene UUID, nombre, slug único, activo y timestamps. `SportFormat` contiene los mismos campos y un `sportId` obligatorio; su slug es único dentro del deporte. Los seeds resuelven relaciones por slug, sin depender de identificadores del entorno.

`Match.sportId` es obligatorio y `Match.sportFormatId` opcional. Una FK compuesta hacia `SportFormat(id,sportId)` impide guardar un formato de otro deporte, incluso mediante escrituras directas a PostgreSQL. Las eliminaciones de deportes/formatos referenciados están restringidas; `active` permite deshabilitarlos conservando relaciones históricas. No se modifica `User`, `Location` ni `Participation`.

## Endpoints y contratos

`GET /api/v1/sports` es público y no recibe payload. Devuelve `{items:[{id,name,slug,formats:[{id,name,slug}]}]}`. Filtra deportes activos y formatos activos, ordenados por nombre e identificador. No expone timestamps, usuarios ni información de autenticación. No hay endpoints mutables ni historial de cambios del catálogo en esta task.

`GET /api/v1/matches?locationId=<uuid>&page=1` conserva filtros, orden, páginas de nueve, total y hasMore. Cada partido devuelve `sport:{id,name,slug}` y `sportFormat:{id,name,slug}|null`, además de los restantes campos previos. MVP-02 agrega filtros opcionales `sportId`, `sportFormatId` y `date`; ver [contrato de descubrimiento](DISCOVERY.md). La desactivación del catálogo no oculta ni borra partidos relacionados: el listado mantiene sus reglas anteriores y muestra la identidad deportiva persistida.

Los errores conservan `{code,message,requestId}`, la validación global de query y los controles HTTP existentes. No se agregan permisos de administración ni superficies de escritura. Auth, cookies y CSRF permanecen intactos.

## Catálogo y seeds

- `futbol`: Fútbol 5 (`futbol-5`), Fútbol 6 (`futbol-6`), Fútbol 7 (`futbol-7`).
- `padel`: Dobles (`dobles`).
- `basquet`: 3x3 (`3x3`) y 5x5 (`5x5`).
- `voley`: sin formatos iniciales.

El seed crea catálogo y formatos por upsert de slug y clave deporte/slug. Mantiene estados activos/inactivos existentes. El modo de desarrollo conserva los cuatro partidos demo de fútbol y las participaciones del organizador.

## Migración histórica

`202611010001_multisport_domain` crea catálogo, agrega columnas, mapea todos los partidos, verifica ausencia de relaciones sin mapear, establece constraints y sólo entonces elimina la columna y enum anteriores. Todo ocurre en una transacción sin recrear `Match` ni tocar sus timestamps u otros campos.

Correspondencia de datos históricos: `FIVE → Fútbol 5`, `SIX → Fútbol 6`, `SEVEN → Fútbol 7`. La migración requiere `gen_random_uuid()`, disponible en PostgreSQL 16 del proyecto. No modifica migraciones ya aplicadas ni el índice parcial diario de participación.

Aplicar como migración controlada con `pnpm --filter api db:migrate`, con respaldo cuando existan datos importantes. Desplegar backend y frontend con el contrato nuevo de forma coordinada. No se aplica automáticamente al inicio de la API.

## Validación

La integración debe cubrir catálogo activo, formato opcional, integridad deporte/formato, ausencia del contrato anterior y conservación semántica de datos migrados. Ejecutar lint, typecheck, unitarios, integración sobre PostgreSQL aislado y build según `../../tests/README.md`. Generar Prisma por sí solo no acredita la migración.
