---
id: REF-01
title: Organizar módulos y contratos sin modificar comportamiento
status: finished
phase: refactor
depends_on: []
created_at: 2026-11-12T03:11:16-03:00
updated_at: 2026-11-19T13:22:28.789-03:00
started_at: null
resolved_at: 2026-11-12T03:14:31.963-03:00
resolution_commit: 88e5e5d
---

# Alcance entregado

R0–R7 implementadas en `feature/refactor-estructural`, creada desde `feature/gestion-partidos` conservando la publicación pendiente de commit. El estado inicial y el diff previo se guardaron en `.runtime/refactor/`. Al cerrar la validación inicial no se habían creado commits ni modificado remotos o descartado cambios previos. El usuario autorizó posteriormente los commits y la publicación de la rama.

Backend: partidos separa composición Nest, controller, service público y DTO; `MatchManagementService` conserva las operaciones de publicación y gestión. Los contratos HTTP pertenecen a sus dominios y `common/http/response.dto.ts` conserva únicamente `MessageResponse`. Localidades y deportes tienen controller y service propios.

Frontend: contratos en `types.ts` de partidos, auth y cuenta; fechas puras en `matches/local-date.ts`; flujos en `discovery/`, `publication/`, `detail/` y `organized/`. Los hooks quedan junto a sus consumidores. La suite transversal vive en `test/integration/vertical-slice.test.tsx` y conserva sus 20 casos, incluidas sus 18 declaraciones directas. No se agregan barrels ni reexportaciones de compatibilidad.

A1 y A2 siguen excluidas: no cambia la composición de usuarios/auth ni la ubicación de providers. Los cambios de auth son imports y extracción de contratos. No cambia ninguna URL, consulta, transacción, regla de negocio, clave de caché, política de sesión ni paginación. Los cambios Prisma y de publicación presentes al iniciar pertenecen al baseline.

# Transición de nombres autorizada durante la implementación

El usuario indicó que `hyt` era una denominación anterior y autorizó incluir tanto la base habitual como las pruebas. La base local se renombró a `falta-gente` con respaldo PostgreSQL previo y conservación de datos; los conteos exactos de las 13 tablas coinciden antes y después. Se mantuvo el rol propietario existente. Se actualizaron las URLs privadas locales, `POSTGRES_DB`, Compose, el ejemplo de entorno y las instrucciones activas.

La nueva base aislada `falta-gente-test` recibió las cinco migraciones y seed de desarrollo. Las nueve guardas HTTP/navegador admiten únicamente ese nombre sobre `localhost`/`127.0.0.1`; rechazan la base habitual, nombres heredados y hosts remotos. La revisión independiente verificó 81 combinaciones de esas guardas. Las bases heredadas de pruebas no se eliminaron. No se tocaron recursos remotos ni producción.

No se creó ninguna migración Prisma nueva por esta refactorización o el renombre. `prisma migrate status` confirma las cinco migraciones al día en desarrollo. No se requirieron nuevos seeds para la base habitual, cuyos catálogos existentes responden correctamente.

# Verificación

- Lint y typecheck completos: aprobados.
- Unitarios API: 38/38. Frontend: 136 casos únicos aprobados, combinando la suite completa con la repetición de los 20 casos de publicación después de corregir una conversión UTF-8 durante el movimiento. Los timeouts del baseline concurrente no se resolvieron cambiando límites o expectativas.
- Integración PostgreSQL real: 46/46 en nueve suites sobre `falta-gente-test`, con un worker y sin paralelismo de archivos.
- Build local de ambos workspaces y builds Docker de API/web: aprobados.
- OpenAPI compilado antes y después: igualdad semántica completa, 22 rutas y 34 schemas.
- Playwright final: 13/13, publicación, descubrimiento multideporte, vertical slice y recuperación/cuenta, frontend compilado en puerto 3100 y API real del harness en 3001. Sólo email sustituido en memoria; no se verificó entrega externa de correo.
- Los escenarios antiguos de cuenta se ajustaron a la navegación existente `Ingresar → Registrate` y a escritorio para el menú de cuenta, que ya se ocultaba por debajo de 640 px. Landing, descubrimiento y publicación mantienen recorridos móviles. No hubo cambios globales de UI para hacer pasar las pruebas.
- Auditoría de imports TS/TSX: 53 archivos API y 89 frontend, sin imports locales sin resolver ni ciclos en el grafo de imports literales. No constituye una prueba de imports calculados dinámicamente.
- Revisión independiente de seguridad: sin hallazgos bloqueantes; cookies, CSRF, CORS, sesión, autorización y privacidad conservados.
- Stack final: db, api y web saludables. Smoke HTTP 200 en health, catálogos, inicio, descubrimiento, publicación y partidos propios. Migraciones de desarrollo al día.
- `git diff --check` y revisión del diff: aprobados. No se agregaron tests de comportamiento nuevos porque la implementación principal es mecánica; se conservaron y ejecutaron los escenarios existentes.

Los logs, documentos OpenAPI, inventario de casos y respaldo quedan ignorados bajo `.runtime/refactor/`. La documentación de responsabilidades se actualizó en `apps/api/README.md`, `apps/web/FRONTEND.md` y `apps/web/docs/matches.md`.

# Commits autorizados

El usuario aprobó los cambios y confirmó manualmente la publicación de un partido. Se separó la funcionalidad previa de la reorganización y del contrato de bases:

- `1b4b065 feat(matches): agregar publicación de partidos`
- `b3fee53 refactor(api): organizar módulos y contratos por dominio`
- `c854282 refactor(web): organizar los flujos y contratos de partidos`
- `88e5e5d chore(database): adoptar nombres falta-gente para desarrollo y pruebas`

La continuación del 19 de noviembre volvió a aprobar lint, typecheck y los 174 tests unitarios (38 API y 136 frontend) en ejecución serial. La base local estaba detenida y se inició sin modificar datos; las cinco migraciones están al día y health/localidades/deportes responden HTTP 200. Las cifras de integración, navegador y builds anteriores corresponden a la validación funcional de la implementación; no se presentan como nuevas ejecuciones en esta continuación documental/Git.

La refactorización visual permanece pendiente en [UI-04](../pending/UI-04-refactor-ui.md). El [estado consolidado del sistema](../../PROJECT-STATUS.md) distingue capacidades implementadas, pendientes del producto y preparación para lanzamiento. Publicar esta rama no incluye fusionarla en `dev` o `main`.

El renombre local ya se ejecutó: cambiar sólo `POSTGRES_DB` en otra instalación con volumen existente no renombra su base. Esa instalación requiere su propia transición explícita con respaldo.

# Resolución de conflictos de la PR #8

Se integra `dev` (`bce23b5`) en la rama de refactorización mediante un merge, conservando su historial. La resolución mantiene CI, los ajustes de navegador y el helper compartido de aislamiento de base introducidos en desarrollo, junto con los fixtures de capacidad y las funcionalidades de publicación de esta rama.

El contrato integrado de pruebas usa exclusivamente PostgreSQL en loopback con base `falta_gente_test`. Se conservan las comprobaciones de protocolo y se agregan rechazos explícitos de la base habitual `falta-gente` y del nombre anterior `falta-gente-test`. Esta integración no renombra bases persistidas ni modifica autenticación o el esquema.

Los recorridos de cuenta mantienen las aserciones de ambas ramas. El helper adaptativo comprueba el menú oculto en móvil antes de pasar a escritorio; se elimina la configuración global de escritorio incompatible con esa cobertura. Publicación permanece incluida en el descubrimiento automático de suites de CI.

La validación se ejecuta en un worktree separado y PostgreSQL/PostGIS descartable en el puerto 55434, con sus cinco migraciones y seed explícito. No se modifica la base habitual ni se incluyen los cambios locales en curso de MVP-05. Lint, typecheck, 192 unitarios (56 API y 136 frontend), 18 pruebas del gate, 46 integraciones y builds Nest/Next aprobaron. El orquestador de navegador aprobó 20 recorridos (13 con harness y 7 públicos), con código de salida 0 y cierre de sus procesos. La revisión independiente de seguridad no encontró bloqueos. Los logs locales se conservan en `.runtime/pr8-validation/`.
