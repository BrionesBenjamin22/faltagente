---
id: MVP-04
title: Publicación de partidos
status: finished
phase: mvp
depends_on: [MVP-03]
created_at: 2026-11-11T16:49:06-03:00
updated_at: 2026-11-19T13:22:28.789-03:00
started_at: 2026-11-11T16:49:06-03:00
resolved_at: 2026-11-12T01:45:09-03:00
resolution_commit: 1b4b065
---

## Alcance atómico

Primera entrega de gestión de partidos: API, persistencia, validaciones, formulario y pruebas de publicación. Edición y cancelación se implementarán en entregas posteriores. No realizar commits automáticamente.

## Criterios de aceptación

- Publicación autenticada sin exigir email verificado, con CSRF y Origin.
- Catálogos activos, formato perteneciente al deporte, inicio futuro y precio/cupos válidos.
- Partido, participación ORGANIZER e historial de publicación en una única transacción.
- Exclusión diaria por fecha local de Buenos Aires, incluso con solicitudes concurrentes.
- Formulario accesible en `/partidos/nuevo`, acceso desde el módulo y regreso al home con confirmación.
- Listado privado `/mis-partidos` con próximos, pasados y cancelados; nueve publicaciones propias por página.
- Auditoría e historial privado del organizador, con tres eventos por página.
- Migración aditiva con comprobación de datos previos; contrato público conservado.
- Base local preparada; pruebas unitarias, integración PostgreSQL, navegador, lint, typecheck y build.

## Evidencia

Rama `feature/gestion-partidos` creada desde `dev`; sin cambios de CI/CD de la rama anterior. Implementación y validación completas. En la validación inicial no se creó commit por indicación del usuario. Su autorización posterior permitió registrar esta funcionalidad en `1b4b065`, separada de la refactorización estructural.

- `pnpm lint` y `pnpm typecheck`: aprobados.
- `pnpm --filter api test --maxWorkers=1`: 38/38 unitarios.
- `pnpm --filter web test --maxWorkers=1 --reporter=verbose`: 136/136 unitarios en 18 archivos.
- Integración PostgreSQL real: `pnpm --filter api test:e2e --maxWorkers=1 --no-file-parallelism`, 46/46 en nueve suites. Base exclusiva `hyt_slice_test` en loopback, sin usar datos habituales.
- Builds API y Next.js aprobados. Build web de navegador con API harness en 3003 y frontend en 3002; instancia temporal detenida al finalizar.
- Playwright final: publicación, vertical slice y descubrimiento multideporte, 8/8 en 48,6 segundos, código de salida 0. API real con email fake del harness y PostgreSQL real. Incluye cuenta sin email verificado, fecha local que cruza medianoche UTC, regreso al home, listado propio, detalle directo e historial privado, red interrumpida y reintento, acceso anónimo y sesión revocada.
- Se inspeccionaron las capturas móviles del formulario completo y listado propio en `.runtime/mvp04-create-mobile.png` y `.runtime/mvp04-my-matches-mobile.png`. Sin desbordes; cambio a escritorio conserva valores. Artefactos ignorados por Git.
- Los casos de vertical slice que usan navegación global se ejecutan en escritorio conforme al breakpoint existente de 640 px. Publicación y descubrimiento mantienen cobertura móvil. No se modificó el layout global.
- La primera ejecución de regresiones necesitó seed de desarrollo en la base aislada; errores de selectores del test nuevo se corrigieron conservando las expectativas. Un login agotó el tiempo durante la reconstrucción simultánea de Docker; la ejecución final con stack estable aprobó completa.
- Migración aditiva aplicada a desarrollo y pruebas, catálogos cargados idempotentemente en ambas bases; seed ficticio sólo en la base aislada de tests. `prisma migrate status` confirma cinco migraciones y esquema local al día.
- `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build --wait api web`: imágenes construidas; comprobación posterior confirma API, web y db saludables. HTTP local: `/health` 200, ambas rutas nuevas 200 y listado privado anónimo 401.
- Revisión final de diff y `git diff --check` aprobadas. Sin archivos staged ni commits.

## Seguridad y límites

Se incorporan permisos privados por propiedad en gestión, historial y listado; la identidad proviene de la sesión. Se conservan cookies, sesiones, CSRF, Origin y CORS existentes. La API rechaza campos desconocidos y no expone auditoría, emails ni credenciales en el contrato público. Las pruebas verifican controles de sesión, propiedad, CSRF y Origin.

Edición, cancelación y reservas continúan pendientes para entregas separadas. No existen endpoints mutables de edición o cancelación en esta etapa. No se modificó producción ni se hicieron resets.

## Commit de esta etapa

`feat(matches): agregar publicación de partidos`

## Aprobación posterior

El usuario confirmó que pudo publicar un partido y aprobó el flujo. También autorizó crear los commits y publicar `feature/refactor-estructural`. La refactorización visual de UI queda pendiente en una tarea independiente.
