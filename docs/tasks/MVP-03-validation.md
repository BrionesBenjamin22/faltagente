# MVP-03 — Detalle de partido

Estado: completed. Rama: `feature/match-detail`. Sin commit automático ni inicio de MVP-04.

## Alcance implementado

- Endpoint público `GET /api/v1/matches/:id` con UUID validado y respuesta específica.
- Organizador limitado a `id` y `name`, proyección explícita de campos públicos.
- Estados OPEN, CLOSED y CANCELLED preservados por URL estable; listado sin cambios de visibilidad.
- Ruta `/partidos/[id]`, enlace Ver partido en MatchCard y regreso directo al listado.
- Formato y descripción opcionales, precio ARS compartido, disponibilidad y estado explícitos.
- TanStack Query con clave `matches/detail/id`, datos iniciales del servidor y reintento recuperable.
- Documentación de contratos en `apps/api/MATCH-DETAIL.md` y `apps/web/docs/matches.md`.

## Validación

- Integración independiente sobre PostgreSQL real aislado `hyt_slice_test`: 21/21, detalle 8, descubrimiento 9 y deportes 4. Migraciones aplicadas exclusivamente a la base descartable; fixtures propios eliminados por las suites.
- `pnpm lint`: aprobado.
- `pnpm typecheck`: aprobado.
- Tests unitarios backend: 38/38 aprobados.
- `pnpm test --maxWorkers=1`: aprobado, 122/122 tests; backend 38/38 y frontend 84/84 en 12 archivos.
- `pnpm build`: aprobado, incluyendo la ruta dinámica nueva.
- `git diff --check` y revisión final de `git status`/diff: aprobados, sin cambios staged ni archivos ajenos al módulo.
- Revisión independiente de seguridad: pass sin bloqueos, ver `MVP-03-security-review.md`.
- Revisión React: hooks estables, query identificada por ID, sin segunda consulta inmediata tras datos iniciales, enlaces semánticos, loading accesible y texto remoto escapado.

## Decisiones y límites

`placeName` proyecta el campo persistido `venueName` sin cambiar el listado. Se conserva la representación decimal string del precio. No se añaden reservas, publicación, participantes, mapas, historial público ni cambios de autenticación.

La consulta inicial se resuelve en el servidor antes de transmitir la página para conservar HTTP 404 mediante `notFound()`. No se añade `loading.tsx`: durante esa primera espera no se muestra el skeleton del detalle. Si el servidor no consigue recuperar datos, la consulta cliente pendiente muestra el skeleton existente y permite recuperación/reintento. Ambos caminos cuentan con tests de ruta/componente.

No se realizaron capturas, regresión visual, comparación de imágenes, automatización visual ni nuevas pruebas Playwright. La apariencia y el comportamiento responsive quedan para validación manual del desarrollador.

## Recorrido manual sugerido

Con API y frontend locales configurados y en ejecución, abrir `/partidos`, seleccionar Ver partido y comprobar datos y regreso al listado. Repetir sin sesión y con sesión, abrir la URL directamente y consultar un UUID inexistente. Usar partidos existentes con y sin formato/descripción, sin lugares y cerrados/cancelados cuando estén disponibles. Revisar en móvil y escritorio; ante un error de conexión, comprobar el mensaje y Reintentar.

Mensaje de commit sugerido: `feat(matches): agregar detalle público navegable de partidos`.
