# MVP-05: revisión independiente de seguridad

Fecha: 2026-11-19.

Estado de seguridad: PASS. Sin hallazgos critical, high o medium abiertos en las superficies revisadas. La validación global de entrega queda a cargo del cierre de la tarea, incluidos navegador y build.

## Superficies revisadas

- `PATCH /api/v1/matches/:id` y `POST /api/v1/matches/:id/cancel`.
- Respuesta privada de gestión, historial, detalle público y listados.
- DTOs de actualización y cancelación, migración aditiva y transacciones Prisma.
- Acceso directo al formulario, claves privadas de caché, versiones conservadas y panel de cancelación.

## Controles verificados

La identidad se obtiene mediante `AuthService.requireUser`; ningún payload puede asignar organizador o usuario. Ambos endpoints comprueban propiedad bajo bloqueo antes de modificar datos. La repetición de cancelación también comprueba identidad y propiedad.

El middleware existente protege todos los métodos mutables mediante token CSRF, Origin permitido, cookie de navegador y Fetch Metadata. CORS conserva sus orígenes explícitos y credenciales. No se modificaron cookies, sesiones, recuperación de contraseña ni controles de autenticación.

Los DTOs rechazan campos ajenos, estado, disponibilidad y auditoría; requieren versión entera positiva sin coerción de strings. Sólo descripción y formato admiten `null` en edición. El motivo admite texto recortado de hasta 500 caracteres; vacío se persiste como `null`.

Cada mutación utiliza una transacción y SQL parametrizado, con bloqueo de usuario seguido de partido. La versión se compara bajo bloqueo. Los tests de dos ediciones y edición contra cancelación verifican un ganador, conflicto de versión y ausencia de eventos duplicados. La cancelación idempotente no modifica auditoría previa. Un PATCH equivalente conserva versión y fecha de actualización.

La ocupación deriva de capacidad menos disponibilidad. Los tests verifican que una participación pueda representar varios lugares, que el delta preserve ocupación y que datos inconsistentes impidan ajustar capacidad o cancelar. El cambio de fecha actualiza participación y comprueba la restricción diaria dentro de la misma transacción.

La respuesta de gestión reúne campos, versión, relaciones y restricciones con aislamiento `RepeatableRead`. Los cambios de relaciones guardan identidad y nombre. Los tests adicionales independientes verifican snapshots coherentes después de cambiar deporte, formato y localidad, el rechazo de reemplazos inactivos y la pertenencia del formato.

## Exposición de datos y frontend

El motivo sólo se selecciona en gestión e historial privados. El detalle público y descubrimiento usan proyecciones explícitas que no lo incluyen. Los endpoints privados conservan `Cache-Control: no-store`; las claves del cliente incluyen identidad. La interfaz renderiza texto remoto mediante React, sin HTML interpretado, y mantiene campos y versión originales juntos durante la edición. Un conflicto exige recarga explícita; las mutaciones no se reintentan automáticamente.

Los logs HTTP conservan únicamente metadatos de request, estado y duración. No se agregaron logs de payloads, tokens, cookies, motivos ni secretos. Los errores mantienen `{code,message,requestId}` y mensajes seguros.

## Evidencia ejecutada

- `pnpm --filter api exec vitest run src/matches/match-mutation-dto.spec.ts`: 4 tests aprobados.
- `pnpm --filter api lint`: aprobado.
- `pnpm --filter api typecheck`: aprobado.
- `node --env-file=.env .runtime/mvp05/run.cjs integration`: 55 aprobados y un fallo de timeout de 90 segundos en el test de migración histórica. Las 10 pruebas de mutaciones aprobaron, incluidas concurrencia, permisos, CSRF, privacidad y dos casos independientes agregados durante esta revisión.
- Se amplió únicamente el timeout del caso de migración histórica a 180 segundos por los siete procesos Prisma y dos ejecuciones de seed; se conservaron todos sus asserts y los límites individuales de procesos. Repetición dirigida mediante `node --env-file=.env .runtime/mvp05/security-migration.cjs`: 1 test aprobado, 41 segundos. Quedan aprobados los 56 casos de integración entre la ejecución completa y esta repetición dirigida.

La suite utiliza exclusivamente PostgreSQL local `falta-gente-test`; no se ejecutaron fixtures contra la base habitual ni producción.

## Hallazgos y recomendación

- Low, corregido: mensajes nuevos tenían signos `?` en lugar de tildes; backend corrigió UTF-8.
- Low, corregido: la primera versión de los campos compartidos no deshabilitaba todos los datos restringidos y no mostraba el deporte histórico inactivo. Frontend añadió restricciones y opciones históricas.
- Info: la cancelación con jugadores u ocupación sigue bloqueada mediante `MATCH_CANCELLATION_REQUIRES_RESERVATIONS_INTEGRATION`, según el alcance aprobado. No se incorporan reservas ni notificaciones.

Recomendación: conservar los controles revisados y completar las verificaciones globales pendientes antes de declarar la entrega lista. No hay aceptación de riesgo de seguridad solicitada ni degradaciones de controles para habilitar el flujo.
