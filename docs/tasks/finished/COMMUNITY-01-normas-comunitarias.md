---
id: COMMUNITY-01
title: Normas comunitarias y contacto de soporte
status: finished
phase: mvp
depends_on: []
created_at: 2026-11-20T15:28:09-03:00
updated_at: 2026-11-20T15:28:09-03:00
started_at: null
resolved_at: 2026-11-20T15:28:09-03:00
resolution_commit: null
---

# Normas comunitarias y contacto de soporte

Implementado en `feature/normas-comunitarias`, creada desde `dev`. Commit solicitado por el usuario después de completar las validaciones.

## Entrega

- Página pública `/normas` con pautas de convivencia y compromiso, metadata, estilos locales y acceso desde el pie global autorizado.
- Bloque «Quejas y sugerencias» por correo externo. `NEXT_PUBLIC_SUPPORT_EMAIL` configura un destinatario único y un asunto fijo codificado. Sin configuración válida se muestra el aviso de disponibilidad, sin simular envío.
- Configuración pública documentada en `.env.example`, Dockerfile y Compose. No se configura una dirección ficticia; falta un buzón real antes de habilitar contacto.
- Documentación frontend y backend del límite actual y del punto de integración futura con bandeja y notificaciones exclusivas de administradores. No se crean eventos desde clics ni contratos ficticios.
- Sin términos y condiciones, denuncias formales, panel administrativo, persistencia, endpoints ni cambios de autenticación. No depende de la PR de edición/cancelación pendiente.

## Validación

- `pnpm lint` y `pnpm typecheck`: aprobados.
- `pnpm build`: API y web aprobados; `/normas` prerenderizada estáticamente.
- `pnpm --filter api test --maxWorkers=1`: 56 tests aprobados. La ejecución general inicial tuvo un timeout de 5 segundos en la prueba existente de arranque de API; no se reprodujo con un worker y no se modificó esa prueba.
- `pnpm --filter web test --maxWorkers=1`: 163 tests en 20 archivos aprobados; incluye 27 casos nuevos de normas y contacto.
- `pnpm exec playwright test tests/community-guidelines.spec.ts` con `E2E_WEB_URL=http://localhost:3100`: aprobado sobre build local, acceso anónimo desde el pie por teclado, título, contenido, ausencia de overflow y vuelta al Home.
- Revisión visual de capturas de navegador a 390 px en claro y 1440 px en oscuro: lectura y bloque de feedback correctos, sin overflow. Capturas locales ignoradas en `.runtime/`.
- `docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d --build --wait web`: imágenes construidas y stack saludable. Comprobado HTTP 200 y contenido de `/normas` en el puerto habitual 3000.
- `pnpm --filter api exec prisma migrate status`: cinco migraciones, base local al día. No hay cambios de esquema ni seeds requeridos para este módulo. No se agregan tests de integración PostgreSQL porque no hay comportamiento de persistencia modificado.

Mensaje sugerido: `feat(community): agregar normas comunitarias y contacto de soporte`.
