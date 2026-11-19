# Estado de Falta Gente

Revisión del 19 de noviembre de 2026, contrastada con módulos, rutas, modelos y documentación del repositorio. Las reglas de `agent/PRODUCT.md` describen el alcance objetivo; no todas están implementadas. Algunas tareas Foundation siguen marcadas como pendientes pese a tener implementación parcial o completa: sus etiquetas no sustituyen esta revisión del código.

## Implementado

### Cuenta y acceso

- Registro y login con email y contraseña; selección de localidad principal y recuperación de cuentas que todavía no la tienen.
- Sesiones mediante cookies Secure/HttpOnly, rotación de refresh, renovación explícita, aviso de expiración y logout. CSRF, validación de Origin, CORS restringido y rate limiting.
- Verificación de email, reenvío y recuperación/restablecimiento de contraseña con enlaces de uso único. Integración de envío mediante Resend; su entrega real depende de la configuración del entorno.
- Perfil propio editable: nombre y localidad, payload de diferencias, auditoría e historial privado de tres eventos por página.
- Cambio de contraseña con revocación de todas las sesiones y enlaces pendientes.

### Descubrimiento y partidos

- Catálogos persistidos de localidades y deportes: Fútbol, Pádel, Básquet y Vóley, con formatos deportivos cuando corresponden.
- Descubrimiento público y Home autenticado: filtros por localidad, deporte, formato y fecha local de Buenos Aires, con estado en URL y navegación atrás/adelante.
- Localidad temporal independiente del perfil y carga progresiva de nueve resultados.
- Detalle público en `/partidos/[id]`, datos mínimos del organizador y tratamiento de partidos inexistentes, cerrados o cancelados.
- Publicación autenticada en `/partidos/nuevo`: validación de fecha futura, catálogos, precio y cupos; crea el partido y su participación ORGANIZER en una transacción. Aplica la restricción de una participación activa por fecha local. El usuario confirmó manualmente que pudo publicar.
- Listado privado `/mis-partidos` de partidos organizados, con filtros próximos, pasados y cancelados y páginas de nueve. Que pueda mostrar un estado cancelado no significa que exista una acción de cancelación.
- Capacidad, versión, auditoría e historial de publicación privados del organizador, paginado de tres eventos. Todavía no hay edición ni cancelación.

### Interfaz y base técnica

- Landing multideporte, carrusel, estados de carga/error/vacío, página 404, temas claro/oscuro/sistema y feedback efímero de éxito/error.
- Monorepo pnpm, Next.js por features y NestJS por dominio, con PostgreSQL/PostGIS y Prisma. Refactorización estructural R0–R7 completada; contratos, URLs y reglas preservados.
- Contratos frontend separados del transporte, flujos de partidos agrupados y DTO backend distribuidos por dominio. La composición opcional A1/A2 de auth/providers no se incluyó.
- Docker Compose para web/API/base, migraciones y seeds explícitos, healthcheck, request ID, errores uniformes, logs HTTP y OpenAPI.
- Bases locales `falta-gente` y `falta-gente-test`, separadas; las suites de persistencia sólo permiten la base de pruebas en loopback.
- Tests unitarios, integración PostgreSQL real y Playwright. La validación de esta etapa registró 174 unitarios, 46 integraciones y 13 recorridos de navegador aprobados, además de builds locales/Docker y comparación OpenAPI idéntica (22 rutas, 34 schemas).

## Pendiente del producto

1. **Refactorizar la UI.** Alcance visual y pantallas a definir en [UI-04](tasks/pending/UI-04-refactor-ui.md). No se implementó un rediseño como parte del cambio estructural.
2. **Editar y cancelar partidos.** Permisos del organizador, diferencias reales, historial, reglas sobre campos críticos cuando haya reservas, límites de capacidad y cancelación antes del inicio con motivo.
3. **Reservar lugares.** Uno o varios cupos, confirmación atómica, prevención de sobre-reserva, prohibición de reservar el propio partido y creación de Participation PLAYER con la regla diaria. Cancelar reservas y liberar cupos de forma atómica. El modelo de participación por sí solo no implementa reservas.
4. **Acompañantes y contacto privado.** Nombres opcionales de acompañantes; definir/cargar el contacto y revelarlo sólo tras una reserva confirmada, con autorización backend.
5. **Lista de espera y ofertas.** Alta/baja, cantidad de lugares, selección por mejor aprovechamiento y antigüedad, oferta de 15 minutos, aceptación/rechazo/expiración e invalidaciones atómicas de otras ofertas/listas del mismo día al confirmar participación.
6. **Completar Mis partidos.** Reservados e historial de participación como jugador, además de los organizados ya disponibles.
7. **Notificaciones de negocio.** Persistencia y consulta de avisos in-app, próximos partidos y eventos de reservas/cancelaciones/ofertas; correos de esos eventos. Los toasts actuales sólo son feedback de UI.
8. **Acceso Google.** OAuth y asociación segura con cuentas existentes; el acceso actual es local.
9. **Otras capacidades previstas.** Propuesta de localidades faltantes y acciones de compartir (copiar enlace y destinos sociales). Ya existe la URL pública estable; no hay controles específicos para compartir.

Las etapas de reservas, edición, cancelación y espera deben diseñarse juntas en sus puntos de concurrencia y estados antes de implementar cada entrega. No están autorizadas como trabajo adicional por este resumen.

## Pendiente de preparación para integración y lanzamiento

- CI con GitHub Actions: no hay workflow versionado en `.github/`; automatizar lint, typecheck, tests, integración y build según FND-07.
- Completar/verificar el flujo `feature/* → dev → main` y las protecciones de integración según FND-08. Publicar esta rama no equivale a fusionarla ni cambia las protecciones.
- Conciliar las tareas Foundation antiguas con la implementación existente y cerrar los criterios que todavía falten, evitando rehacer base de datos, seeds o scripts ya presentes.
- Preparar y validar el despliegue productivo, dominios, HTTPS, correo real, secretos, migraciones controladas y recuperación. El stack Docker local validado no acredita un despliegue productivo.

## Fuera del MVP

Pagos, reserva de canchas, torneos/ligas, chat, reputación, estadísticas, geolocalización precisa, PWA y panel administrativo completo continúan fuera del alcance inicial. No son bloqueos para terminar el MVP definido.
