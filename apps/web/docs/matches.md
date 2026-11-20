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
