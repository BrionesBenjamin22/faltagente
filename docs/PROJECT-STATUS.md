# Estado de Falta Gente

Revisión de reservas del 26 de noviembre de 2026 sobre el estado consolidado del 19 de noviembre. Las reglas de `agent/PRODUCT.md` describen el alcance objetivo; no todas están implementadas. Algunas tareas Foundation siguen marcadas como pendientes pese a tener implementación parcial o completa: sus etiquetas no sustituyen esta revisión del código.

## Implementado

### Cuenta y acceso

- Registro y login con email y contraseña; selección de localidad principal y recuperación de cuentas que todavía no la tienen.
- Sesiones mediante cookies Secure/HttpOnly, rotación de refresh, renovación explícita, aviso de expiración y logout. CSRF, validación de Origin, CORS restringido y rate limiting.
- Verificación de email, reenvío y recuperación/restablecimiento de contraseña con enlaces de uso único. Integración de envío mediante Resend; su entrega real depende de la configuración del entorno.
- Perfil propio editable: nombre y localidad, payload de diferencias y feedback visible. El historial se conserva internamente, sin acceso de lectura ni fechas técnicas en las respuestas.
- Cambio de contraseña con revocación de todas las sesiones y enlaces pendientes.

### Descubrimiento y partidos

- Catálogos persistidos de localidades y deportes: Fútbol, Pádel, Básquet y Vóley, con formatos deportivos cuando corresponden.
- Descubrimiento público y Home autenticado: filtros por localidad, deporte, formato y fecha local de Buenos Aires, con estado en URL y navegación atrás/adelante.
- Localidad temporal independiente del perfil y carga progresiva de nueve resultados.
- Detalle público en `/partidos/[id]`, datos mínimos del organizador y tratamiento de partidos inexistentes, cerrados o cancelados.
- Compartir partidos futuros abiertos o cerrados mediante URL limpia, copia con fallback manual, WhatsApp, Telegram, X y Web Share cuando esté disponible. El disparador del encabezado abre un popover en escritorio y un bottom sheet modal en móvil, con foco gestionado y sin desplazar la tarjeta. Etapa aprobada manualmente el 25 de noviembre de 2026; ver [documentación del módulo](../apps/web/MATCH-SHARING.md).
- Publicación autenticada en `/partidos/nuevo`: validación de fecha futura, catálogos, precio y cupos; crea el partido y su participación ORGANIZER en una transacción. Aplica la restricción de una participación activa por fecha local. El usuario confirmó manualmente que pudo publicar.
- Listado privado `/mis-partidos` con Organizados y Reservados, filtros próximos, pasados y cancelados y páginas de nueve. Reservados incluye bajas voluntarias y cancelaciones del organizador sin duplicar reinscripciones.
- Gestión privada del organizador con capacidad, permisos y control de versión. Auditoría e historial de cambios retirados de UI y API; escrituras transaccionales conservadas para una futura administración.
- MVP-05 incorpora edición y cancelación de partidos futuros propios con control de versión, diferencias reales e historial. La integración posterior permite cancelar partidos con reservas activas; ver RESERVATIONS-03 debajo. Validación completada el 20 de noviembre: 195 unitarios, 56 integraciones PostgreSQL y diez recorridos de navegador verificados; builds locales/Docker y revisión de seguridad aprobados. Evidencia en [la tarea MVP-05](tasks/finished/MVP-05-match-edit-cancel.md).

### Reservas

- Reserva de uno o varios lugares, confirmación automática y atómica, prevención de sobre-reserva y reservas propias del organizador, participación PLAYER y restricción diaria de Buenos Aires.
- Reducción de lugares antes del inicio por titular y organizador, conservando al menos un lugar y la participación PLAYER activa. Cancelación completa sin motivo del titular y cancelación individual por el organizador con motivo opcional. Liberación atómica de cupos, participación cuando corresponde e idempotencia de la cancelación por reserva concreta.
- Reinscripción sujeta a disponibilidad y regla diaria, conservando cada reserva anterior y reutilizando la participación. Historial privado con tres reservas por página.
- Reservas por cantidad, sin nombres ni registros individuales de acompañantes. Máximo de cien lugares por reserva o solicitud de espera. Versiones para detectar conflictos, cantidad original conservada y movimientos privados de reducción/cancelación, tres por página. Listado del organizador con nueve reservas confirmadas por página, sin acceso a movimientos privados del titular.
- Lista de espera y ofertas implementadas: retenciones, selección compatible, aceptación, rechazo, expiración e invalidaciones atómicas por fecha local. Reducir o cancelar reservas reasigna los lugares dentro de la misma transacción; pueden quedar inmediatamente retenidos. Las notificaciones de negocio continúan pendientes. Ver [contrato](../apps/api/WAITLIST.md).
- Etapa de cantidades validada manualmente y aprobada para commits el 26 de noviembre de 2026: 329 unitarios, 106 integraciones PostgreSQL y diez escenarios Playwright aprobados; lint, typecheck, build e imágenes Docker correctos. Migración conservativa aplicada y seeds de catálogo ejecutados, once migraciones sin pendientes y stack local saludable. Ver [RESERVATIONS-04](tasks/finished/RESERVATIONS-04-quantity-reduction.md).
- Aprobación de la etapa y solicitud de commits recibidas el 24 de noviembre. Lint, typecheck, build, 271 unitarios, 75 integraciones y cuatro recorridos Playwright aprobados; las dos suites de integración afectadas por timeouts se repitieron correctamente. Migración aplicada, seeds actualizados y stack Docker saludable. Ver [cancelación de reservas](tasks/RESERVATIONS-02.md).
- Cancelación atómica de partidos futuros con reservas activas: fuente USER/MATCH, liberación de cupos y participaciones, idempotencia y auditoría única. Motivo visible sólo a titulares afectados; las bajas voluntarias previas no otorgan acceso. El usuario confirmó manualmente la cancelación y el motivo en historial y solicitó commits el 24 de noviembre. Aprobaron 276 unitarios, 81 integraciones y seis escenarios Playwright, además de lint, typecheck, builds y seguridad. Nueve migraciones aplicadas y Docker saludable. Ver [RESERVATIONS-03](tasks/RESERVATIONS-03.md).

### Interfaz y base técnica

- Normas comunitarias públicas en `/normas`, con enlace en el pie y contacto de soporte configurable por correo. Sin buzón configurado, el canal se muestra como próximo a estar disponible. La futura bandeja administrativa y sus notificaciones no están implementadas. Ver [documentación](../apps/web/docs/community.md).
- Landing multideporte, carrusel, estados de carga/error/vacío, página 404, temas claro/oscuro/sistema y feedback efímero de éxito/error.
- Monorepo pnpm, Next.js por features y NestJS por dominio, con PostgreSQL/PostGIS y Prisma. Refactorización estructural R0–R7 completada; contratos, URLs y reglas preservados.
- Contratos frontend separados del transporte, flujos de partidos agrupados y DTO backend distribuidos por dominio. La composición opcional A1/A2 de auth/providers no se incluyó.
- Docker Compose para web/API/base, migraciones y seeds explícitos, healthcheck, request ID, errores uniformes, logs HTTP y OpenAPI.
- Base local de desarrollo `falta-gente` y contrato integrado de pruebas `falta_gente_test`, separados; las suites de persistencia sólo permiten la base de pruebas en loopback.
- Tests unitarios, integración PostgreSQL real y Playwright. La validación de esta etapa registró 174 unitarios, 46 integraciones y 13 recorridos de navegador aprobados, además de builds locales/Docker y comparación OpenAPI idéntica (22 rutas, 34 schemas).

## Pendiente del producto

1. **Refactorizar la UI.** Alcance visual y pantallas a definir en [UI-04](tasks/pending/UI-04-refactor-ui.md). No se implementó un rediseño como parte del cambio estructural.
2. **Contacto privado.** Definir/cargar el contacto y revelarlo sólo tras una reserva confirmada, con autorización backend. Los nombres y registros individuales de acompañantes quedaron fuera del alcance acordado de reservas por cantidad.
3. **Notificaciones de negocio.** Persistencia y consulta de avisos in-app, próximos partidos y eventos de reservas/cancelaciones/ofertas; correos de esos eventos. Los toasts actuales sólo son feedback de UI.
4. **Acceso Google.** OAuth y asociación segura con cuentas existentes; el acceso actual es local.
5. **Otras capacidades previstas.** Propuesta de localidades faltantes. Las acciones de compartir enlaces y destinos sociales ya están implementadas.

Las etapas de reservas, edición, cancelación y espera deben diseñarse juntas en sus puntos de concurrencia y estados antes de implementar cada entrega. No están autorizadas como trabajo adicional por este resumen.

## Corrección de renovación concurrente

El fallo preexistente de dos renovaciones con el mismo refresh fue corregido con autorización expresa: la reutilización revoca la sesión afectada y conserva otras sesiones independientes. La regresión determinista falla con el código anterior y aprueba con la corrección; integración completa 82/82 y revisión de seguridad aprobadas. Ver [AUTH-REFRESH-01](tasks/AUTH-REFRESH-01.md) y [AUDIT-01](tasks/AUDIT-01.md), validada manualmente por el usuario.

## Pendiente de preparación para integración y lanzamiento

- CI con GitHub Actions ya está implementada en `.github/workflows/ci.yml`: valida calidad, integración PostgreSQL, navegador, Docker y el gate `ci-required`. Falta comprobar la ejecución remota de la combinación integrada y completar la aceptación de FND-07.
- Completar/verificar el flujo `feature/* → dev → main` y las protecciones de integración según FND-08. Publicar esta rama no equivale a fusionarla ni cambia las protecciones.
- Conciliar las tareas Foundation antiguas con la implementación existente y cerrar los criterios que todavía falten, evitando rehacer base de datos, seeds o scripts ya presentes.
- Preparar y validar el despliegue productivo en Azure, dominios, HTTPS, correo real, secretos, migraciones controladas y recuperación. El stack Docker local validado no acredita un despliegue productivo.

## Fuera del MVP

Pagos, reserva de canchas, torneos/ligas, chat, reputación, estadísticas, geolocalización precisa, PWA y panel administrativo completo continúan fuera del alcance inicial. No son bloqueos para terminar el MVP definido.
