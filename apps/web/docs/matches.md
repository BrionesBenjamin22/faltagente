# Partidos: listado y detalle público

## Vistas y navegación

`/partidos` permite descubrir partidos. `MatchCard` ofrece un enlace accesible Ver partido hacia `/partidos/[id]`. El enlace Volver a partidos siempre lleva al listado, incluso al acceder directamente por URL.

El detalle funciona para visitantes y usuarios autenticados, sin depender de la sesión. Muestra deporte y formato opcional, fecha y hora de Buenos Aires, estado, disponibilidad, lugar, dirección, localidad, precio ARS por persona, nombre público del organizador y descripción no vacía. CLOSED y CANCELLED conservan su estado explícito y muestran el número de lugares como dato informativo sin ofrecerlos como disponibles. No hay acciones de reserva, publicación ni perfil público.

## Contrato y service

`matchesService.detail(id)` utiliza el cliente HTTP compartido: `GET /api/v1/matches/:id`. El identificador se codifica como segmento URL. `MatchDetail` es independiente del tipo de listado: usa `placeName` y agrega `organizer: { id, name }`, además de admitir CANCELLED. `sportFormat` y `description` son nullable. No incluye email, contacto, historial ni auditoría privada.

## Componentes, hooks y estados

La página Server Component consulta el service y resuelve 404/400 mediante `notFound()` y la página 404 existente. No incorpora `loading.tsx` de ruta: la comprobación de existencia ocurre antes de comenzar a transmitir el detalle, preservando HTTP 404. Los errores recuperables pasan al componente cliente para reintento.

`useMatchDetail` administra TanStack Query con clave `["matches", "detail", id]`, caché pública durante 30 segundos y datos iniciales del servidor para evitar una consulta duplicada al montar. Los errores 4xx no se reintentan automáticamente; errores recuperables tienen un reintento y acción explícita Reintentar. `MatchDetailScreen` conserva datos disponibles si falla una actualización. `MatchDetailLoading` reutiliza LoadingState y Skeleton; `MatchDetailContent` contiene la presentación. `format.ts` comparte formato monetario y de fecha con MatchCard.

## Permisos, validación y accesibilidad

La API valida UUID y es la autoridad sobre visibilidad y estados. El frontend convierte identificadores inexistentes o malformados en la convención 404. Todos los textos remotos se renderizan como texto JSX escapado, sin HTML inyectado. No se alteran auth, cookies, CSRF ni hooks compartidos. La interfaz conserva tokens, fuentes y foco existentes, con una columna móvil y agrupación de precio/organizador en pantallas mayores.

## Pruebas

`match-detail.test.tsx` cubre campos públicos, formato opcional, descripción ausente/vacía, disponibilidad, CLOSED/CANCELLED, escaping, loading, error y reintento, 404 y datos iniciales sin doble fetch. `match-detail-route.test.tsx` cubre la resolución 404 del Server Component y recuperación ante fallo API; `match-card.test.tsx` comprueba el enlace al detalle. La validación visual y responsive se realiza manualmente, sin capturas ni pruebas visuales automatizadas.
# Publicación y partidos propios

`/partidos/nuevo` requiere sesión vigente y permite publicar sin email verificado. El formulario usa deportes/formatos y localidades reales, valida fechas futuras en horario de Buenos Aires, precio decimal no negativo y cupos enteros positivos. Incluye placeholders, labels, errores asociados a campos, foco al primer error y feedback recuperable conservando valores. Se envía CSRF mediante el transporte existente. El alta regresa a `/?success=match-created`; no agrega reglas de reservas.

`/mis-partidos` muestra sólo publicaciones del usuario, en todas las localidades, con filtros próximos/pasados/cancelados y nueve elementos por página. Cambiar filtro reinicia la página. La caché privada incluye identidad, filtro y página. Accesos desde el contenido de partidos; no se cambia layout ni navegación global.

`types.ts` define los contratos de creación, gestión, historial y listado propio; `service.ts` conserva el transporte. `publication/use-create-match.ts` coordina la mutación e invalidación de listados y `detail/use-match-detail.ts` la consulta pública. `publication/create-validation.ts` centraliza validación y conversión del formulario a payload; `publication/create-match.tsx` implementa formulario y control de sesión. `organized/my-matches.tsx` presenta filtros y paginación. La sesión vencida vuelve al login; no hay renovación silenciosa.

El detalle público mantiene su contrato. `match-management.tsx` consulta auditoría e historial únicamente para el organizador autenticado, con claves de caché por usuario/partido y páginas de tres eventos. Las autorizaciones se aplican otra vez en backend. Se muestra actor y fecha de publicación. Edición y cancelación quedan para etapas posteriores.

Tests del formulario y detalle cubren validaciones, payload, errores, sesión y privacidad. `tests/match-create.spec.ts` recorre publicación, regreso al home, listado propio y detalle con API/PostgreSQL reales, además de reintentos y revocación de sesión.

## Organización interna

Los flujos de partidos se agrupan en `src/features/matches/discovery/`, `publication/`, `detail/` y `organized/`, con sus componentes, estilos, validaciones, hooks y pruebas locales. Las rutas de Next.js conservan sus URLs y delegan en esos flujos. `match-card.tsx`, `matches-loading.tsx`, `format.ts`, `service.ts` y `types.ts` permanecen en la raíz porque se comparten dentro del módulo.

`local-date.ts` contiene únicamente `validLocalDate` y `localDate`: funciones puras compartidas por descubrimiento y publicación sin importar React ni History API. Los contratos de sesión y usuario viven en `features/auth/types.ts`; el historial de perfil en `features/account/types.ts`. Los providers globales, la sesión temporal, los controles CSRF, las claves de caché y las reglas de paginación mantienen su implementación.

La suite transversal se encuentra en `src/test/integration/vertical-slice.test.tsx`; conserva el mismo harness y los mismos escenarios de sesión, cuenta, apariencia, descubrimiento y navegación. Las notificaciones de `features/notifications/` son feedback de interfaz en memoria; no representan notificaciones persistidas del dominio.
# Edición y cancelación (MVP-05)

`/partidos/[id]/editar` exige sesión y carga exclusivamente `GET /matches/:id/management`. La respuesta privada mantiene todos los datos junto a `version`; la UI no combina la versión con el detalle público. Una denegación del backend no expone el formulario. La sesión vencida se sincroniza y vuelve a Login.

El formulario comparte `MatchFormFields` con publicación y conserva sus validaciones mediante `createMatchSchema`. Los selectores de deporte, formato y localidad se vinculan al estado del formulario para conservar la opción visible cuando terminan de cargar los catálogos, incluidos los valores históricos inactivos. `matchEditInput` valida solamente diferencias efectivas: recorta textos, compara importes/capacidad numéricamente, preserva segundos de la fecha original y permite mantener catálogos inactivos y datos heredados sin cambios. Sólo descripción y formato pueden vaciarse con `null`. Sin diferencias muestra `No hay cambios para guardar` y no solicita CSRF ni PATCH; el aviso desaparece al volver a editar.

`PATCH /matches/:id` recibe `{expectedVersion,...diferencias}`; luego navega al detalle con `success=match-updated`. `MatchFeedback` consume el parámetro desde la URL y muestra una sola vez `Partido actualizado correctamente`. No almacena credenciales ni usa almacenamiento persistente para el feedback.

La API decide `canEdit`, `canCancel`, `hasConfirmedParticipants` y `canAdjustCapacity`. Con participantes/cupos ocupados se deshabilitan los datos críticos y se explica que sólo se permiten descripción y capacidad. La ocupación y los permisos siguen siendo reglas del backend. La capacidad nunca se reduce por debajo de `occupiedPlaces`; la inconsistencia de cupos impide ajustar capacidad.

Desde el detalle, `CancelMatchPanel` muestra advertencia y motivo opcional de hasta 500 caracteres. Mueve el foco al encabezado, devuelve el foco al botón al desistir y enfoca el resultado al confirmar. `POST /matches/:id/cancel` envía `{expectedVersion,reason}` por el cliente HTTP existente con cookies y CSRF. Evita doble envío, conserva el motivo ante errores y mantiene el resultado en el detalle. El motivo sólo se presenta en la gestión privada del organizador.

`MATCH_VERSION_CONFLICT` conserva el formulario/motivo, bloquea reenvíos y ofrece `Recargar versión actual`. La edición sólo sustituye el baseline después de esa acción explícita; nunca sobrescribe ni reintenta automáticamente. La recarga advierte que se descartan cambios de edición sin guardar; el motivo de cancelación se conserva.

`use-match-mutations` invalida detalle, descubrimiento, baseline público, listados del titular y gestión. Reinicia el historial y su página visible a uno. Gestión e historial conservan claves con identidad: `[match-management,ownerId,id]` y `[match-history,ownerId,id,page]`. El historial muestra `PUBLISHED`, `UPDATED` y `CANCELLED`, con nombres de relaciones, fechas Buenos Aires, importes y cambios antes/después; la API pagina de tres eventos.

Pruebas: `editing/edit-match.test.tsx`, `detail/match-management.test.tsx` y `tests/match-edit-cancel.spec.ts` cubren diferencias, errores, restricciones, concurrencia optimista, foco, navegación, cancelación, feedback consumido, sesión y vista móvil/escritorio. No se modifican layout, auth, estilos base ni componentes globales.
