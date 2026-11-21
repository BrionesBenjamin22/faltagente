# UI-01 — Landing multideporte

Estado: completed.

Evolución incremental de la landing pública. Mantiene hero, título, CTAs y rutas, sección Más fácil juntarse a jugar, navbar, footer, identidad, colores y tipografía existentes.

## Implementación

- Eyebrow Partidos en Argentina y descripción multideporte, sin depender de un grupo ni conocer al organizador.
- Matriz estática 2x2 de Fútbol, Pádel, Básquet y Vóley con igual jerarquía. SVG locales y Lucide existente, sin imágenes externas ni dependencias nuevas.
- Carrusel con selección directa de las tarjetas laterales, sin botones Anterior/Siguiente, más indicadores, swipe horizontal y teclado. Los gestos y las flechas del teclado conservan límites sin wrap; se ignoran gestos cortos, verticales o cancelados. Tarjeta activa frontal y laterales parcialmente visibles, con una sola slide accesible y anuncio de posición.
- Estilos encapsulados en landing.module.css, transición de 250 ms y respeto por prefers-reduced-motion.
- Documentación funcional en apps/web/FRONTEND.md. Sin nuevos contratos, endpoints, servicios o cambios de persistencia.

## Alcance preservado

Partidos, perfil, header, footer, tema y feedback de sesión sin cambios. El test de integración de componentes de la landing en slice.test.tsx actualiza únicamente el eyebrow esperado.

Sin screenshots, regresión visual, comparaciones de imagen, inspección visual automatizada o nuevos E2E. El desarrollador realizará la validación visual y responsive manual.

## Base local

Prisma migrate status: cuatro migraciones, esquema al día. No se requieren migraciones ni seeds para esta tarea.

## Validación final

- `pnpm lint`: aprobado (API y web). Lint web repetido tras actualizar la expectativa del test de la landing, aprobado.
- `pnpm typecheck`: aprobado (API y web).
- `pnpm build`: aprobado (API y web).
- API: 38/38 tests aprobados con un worker; el primer intento concurrente tuvo un timeout de arranque.
- Frontend: 13 archivos de tests aprobados con `pnpm --filter web test --pool=threads --maxWorkers=1 --reporter=verbose`. Resultado final confirmado en el registro de Vitest, actualizado el 3 de noviembre de 2026 a las 14:40:43, todos con `failed:false`.
- Landing: 7 tests aprobados, incluidos navegación, límites, gestos y conservación de los CTAs.
- Revisión independiente de fuente aprobada y `git diff --check` sin errores.
- Aspecto y responsive pendientes de la validación manual del desarrollador según el alcance solicitado; no se ejecutó inspección visual automatizada.

## Ajuste solicitado: selección directa de tarjetas

Se retiran las flechas Anterior/Siguiente. Cada lateral tiene un botón nativo transparente que selecciona esa tarjeta y la lleva al centro; el contenido inactivo permanece oculto y el foco vuelve al carrusel. La captura del puntero mantiene el destino del tap y evita ejecutar también el click tras un swipe. Se conservan indicadores, teclado y gestos existentes.

Se preserva el cambio simultáneo del eyebrow a Partidos en Argentina y se alinean sus tests. Validación del ajuste: lint, typecheck y build frontend aprobados; 29/29 tests de landing y slice aprobados, incluidos 8 casos del carrusel. Revisión independiente aprobada, sin validación visual automatizada. No corresponden nuevos tests backend, migraciones o seeds porque el ajuste sólo modifica interacción local.

## Commit propuesto

`feat(landing): adaptar presentación multideporte y navegación del carrusel`

No se ejecuta commit ni se inicia otra tarea.
