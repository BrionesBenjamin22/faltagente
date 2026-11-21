# Inscripción a partidos

## Alcance

El detalle público permite a usuarios autenticados reservar uno o varios lugares publicados. `Match.availablePlaces` representa las vacantes restantes. El organizador y los integrantes ya confirmados fuera de la aplicación no se descuentan nuevamente.

La inscripción confirma una reserva, crea una participación PLAYER y descuenta cupos en una transacción. La reserva propia permanece visible al recargar. No permite sobre reservas, reservas del organizador, partidos cerrados/cancelados/iniciados ni dos participaciones activas en la misma fecha local de Buenos Aires. Repetir una solicitud idéntica devuelve la reserva original.

La interfaz incluye acceso a login para visitantes, cantidad de lugares, estado pendiente, confirmación persistente y errores recuperables. Detalle y listados actualizan su disponibilidad después de reservar o detectar un conflicto de cupos. Las consultas privadas se separan por usuario y partido.

## Contrato y límites

Ver `apps/api/RESERVATIONS.md`. Esta entrega incorpora creación y consulta propia. Cancelación, nombres de acompañantes, contactos, email de confirmación y lista de espera siguen pendientes.

## Validación y preparación local

Validación del 20 de noviembre de 2026:

- Build Nest/Next aprobado.
- 182 unitarios aprobados (54 API y 128 web), ejecutados con un worker y workspaces en secuencia. La ejecución inicial paralela agotó tiempos en tests existentes; la repetición secuencial pasó sin alterar sus límites.
- 27 pruebas específicas de interfaz aprobadas (14 inscripción y 13 detalle).
- 6 integraciones de reservas aprobadas contra PostgreSQL real aislado `falta_gente_test`: cupos, carreras, idempotencia, fecha local, propiedad, validación, sesión, CSRF y Origin.
- 1 recorrido Chromium aprobado con build productivo, API real y PostgreSQL aislado: visitante, login, reserva de 2/3 lugares, disponibilidad restante, recarga, consulta privada y participación PLAYER. El harness sustituye únicamente el transporte de email; no se envían emails reales.
- Lint/tipos web y lint/tipos del código backend de producción aprobados. Lint y typecheck globales siguen bloqueados por marcadores de un merge ajeno detectado al inicio en `apps/api/test/profile-security.e2e-spec.ts` (líneas 50, 55 y 69). No se modifica ese conflicto ni los cambios previamente staged. La integración completa no se declara aprobada.
- Diff propio revisado, sin errores de whitespace; sin dependencias nuevas ni commit.

Se aplicaron las cinco migraciones, incluida `20261120170000_match_reservations`, en desarrollo `hyt` y en la base descartable `falta_gente_test`. Se ejecutaron explícitamente los seeds de desarrollo en ambas: catálogo con 4 deportes, 20 ubicaciones y 4 partidos futuros en la base habitual; sin reservas ficticias. No quedaron migraciones pendientes ni se borraron datos. Los fixtures de navegador se eliminaron y los servidores de prueba se cerraron. PostgreSQL local permanece preparado en Docker.

La descarga de Chromium requirió instalación de los binarios de Playwright, sin modificar dependencias ni lockfile. Los comandos pnpm se ejecutaron fuera del sandbox porque NVM no puede leer allí su almacén de confianza. No se deshabilitó el firewall de NVM.
## Ajuste visual solicitado

Por la preferencia final del usuario, la inscripción queda al pie de la tarjeta del partido, después de sus datos y descripción. El botón Inscribirme queda a la izquierda, con la cantidad de lugares a su lado; los controles admiten ajuste de línea en pantallas pequeñas. Se retiró el panel separado inferior. Se conservan confirmación, estados y validaciones existentes.

Aprobaron 28 tests específicos, lint y typecheck web, además del diff propio. No cambió el esquema ni se requieren nuevos seeds: Prisma confirmó que la base de desarrollo sigue al día. El contenedor web se reconstruyó de forma independiente y quedó saludable. Se comprobó HTTP 200 y la sección de inscripción al pie, dentro de la tarjeta.

La primera exportación de la imagen web interrumpió el motor Docker. Su arranque WSL informó un disco ocupado; se recuperó con reinicio de WSL tras verificar que no había otras distribuciones activas. No se eliminaron volúmenes ni datos. Tras reconstruir web, los tres servicios quedaron saludables; PostgreSQL conserva cinco migraciones aplicadas, cuatro deportes, veinte ubicaciones y cuatro partidos.

## Traslado a la rama de trabajo

Se respaldaron y verificaron por SHA-256 los 21 archivos pendientes en `.runtime/falta-gente-inscripcion-backup-22185380`. Se canceló el merge inconcluso de main en pr-7, se preservaron las inscripciones en un stash y se cambió a `feature/inscripcion-partidos`. La rama se adelantó por fast-forward a `origin/dev` (b0f5f15), que ya contenía las PR aceptadas de CI, publicación y refactorización. No se crearon commits ni se publicaron cambios.

Al reaplicar el stash se resolvieron los conflictos de schema, documentación y detalle conservando ambas funcionalidades. Los archivos de inscripción del frontend ahora viven en `features/matches/detail/`, usan los contratos compartidos y mantienen la inscripción al pie junto con la gestión del organizador. Backend importa el DTO extraído y los fixtures respetan totalPlaces. Una nueva prueba cubre la carrera publicación/reserva del mismo día.

Se verificó que no existían reservas ni jugadores activos antes de aplicar la migración histórica de publicación, que incluye una protección explícita para ese caso. Las bases locales de desarrollo y pruebas tienen las seis migraciones aplicadas; no se borraron datos ni se requieren nuevos catálogos. El respaldo y el stash se conservan como recuperación. El conflicto antiguo de perfil ya no existe en esta base actualizada.
Validación posterior al traslado: lint y typecheck globales, build, 56 tests unitarios API, 151 tests web y el recorrido Chromium de inscripción aprobados. La integración completa obtuvo 51/53: fallaron dos casos de concurrencia de autenticación. En repetición aislada del archivo vertical-slice aprobaron 10/11; persiste refresh concurrente con respuesta 500 en lugar de 401. No se modificó autenticación para este traslado ni se declara toda la suite aprobada. Las siete pruebas de reservas aprobaron. El servidor web temporal se cerró; los contenedores del usuario no se detuvieron. Sin commit ni push.
## Preparación del commit sobre dev actualizado

Se incorporaron edición/cancelación y normas comunitarias desde dev. La inscripción conserva su ubicación al pie dentro de la tarjeta y las reglas atómicas del backend. La cancelación de partidos con jugadores continúa bloqueada explícitamente por MVP-05; no se agregan cancelación de reservas ni lista de espera.

La validación final detectó P2028 en concurrencia de publicación y autenticación. PrismaService ahora permite hasta 10 segundos para adquirir una transacción, manteniendo el timeout de ejecución predeterminado; los controles de dominio, locks y cookies no cambian. Las pruebas de perfil reinician su almacenamiento real de throttling entre casos mediante su método de limpieza, sin sustituir el guard. Una prueba adicional exige 429 después de diez intentos de login dentro del mismo caso.

Aprobaron lint y typecheck globales, 60 tests unitarios API, 195 tests web y 65 integraciones PostgreSQL. Build de API y web en Docker aprobado; API reconstruida nuevamente tras el ajuste de Prisma. Desarrollo y pruebas tienen siete migraciones aplicadas. Se comprobó catálogo con cuatro deportes y veinte ubicaciones, sin necesidad de nuevos seeds. Las comprobaciones HTTP de health, inicio, normas y detalle devolvieron 200; el detalle contiene la inscripción. El diagnóstico temporal de excepciones se retiró y no se incluyen logs ni archivos de entorno.

Por autorización explícita del usuario se prepara el commit sin la skill commit-work, no disponible en este entorno. Se conservan los respaldos y stashes locales; no se realiza push.
La repetición final de perfil aprobó 6/6, incluida la comprobación explícita del límite real de login. Lint y tipos API se repitieron correctamente tras ese test. Los tres contenedores quedaron saludables y health devolvió 200.
