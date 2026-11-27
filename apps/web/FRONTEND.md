# Vertical slice de Falta Gente

## Vistas

La landing ofrece `Ingresar` hacia `/auth/login`. El pie de login muestra `No tenés cuenta? Registrate`, con enlace a `/auth/register`; el registro conserva `Ya tenés cuenta? Ingresar` hacia login. Esta navegación no modifica la autenticación ni sus validaciones.

- `/`: presentación breve para visitantes; Home de partidos de todas las localidades para usuarios autenticados, priorizando `user.primaryLocation` sin filtrar automáticamente. Una sesión sin localidad redirige a `/auth/location`.
- `/partidos`: descubrimiento público con el mismo listado y filtros del Home.
- `/account/profile`: edición del nombre y localidad principal, email de solo lectura y feedback visible. No muestra ni consulta auditoría o historial de cambios. Envía exclusivamente diferencias; sin cambios no llama al backend.
- `/account/security`: contraseña actual, nueva y confirmación. El backend revoca todas las sesiones; el cliente limpia datos privados y vuelve al login con mensaje de éxito.
- `/account/appearance`: tema claro, oscuro o sistema. Persiste exclusivamente una preferencia visual en `hyt-theme-v1`; no contiene datos de autenticación.
- `/auth/register`: nombre, email, contraseña (8 a 128 caracteres) y localidad de catálogo. Registro crea sesión y dirige al Home.
- `/auth/login`: ingreso y restauración de datos mediante `/auth/session`.
- `/auth/location`: requiere sesión vigente; completa únicamente la localidad faltante mediante `PATCH /users/me/location`.
- `/auth/forgot-password`: solicitud con respuesta genérica para evitar enumeración.
- `/auth/reset-password#token=...` y `/auth/verify-email#token=...`: capturan el token en memoria, retiran el fragmento de la URL y requieren confirmación explícita. Un nuevo enlace en la misma pantalla reemplaza el token y limpia el formulario; una respuesta anterior no altera el enlace nuevo. Referrer policy `no-referrer`, sin indexación.

Por decisión temporal del usuario, las contraseñas de registro, restablecimiento y cambio aceptan entre 8 y 128 caracteres. `passwordSchema` centraliza la política y las ayudas muestran el mismo rango. Login conserva su validación de presencia en frontend (mínimo 1 y máximo 128); el DTO del backend valida el rango de 8 a 128 también al ingresar.

`features/auth/auth-form.tsx` separa encabezado, descripción, campos, acción principal y pie con recuperación de cuenta. Los espacios del formulario se definen explícitamente, sin párrafos de error vacíos. Los errores de campo mantienen su mensaje y `aria-invalid`; los controles reutilizados (`input`, `select`, selector de localidad) muestran un borde rojo según esa señal, conservando el foco visible. `aria-describedby` referencia exclusivamente ayudas y errores presentes, incluyendo la ayuda de contraseña sólo durante el registro. Los errores generales del servidor permanecen en un aviso global, sin atribuirlos a un campo. No cambia el contrato, validación ni manejo de sesión.

Los enlaces nuevos abiertos sobre la misma pantalla se capturan también mediante `hashchange`: se retira el fragmento, se limpia el formulario y su resultado anterior. Las respuestas de una solicitud anterior no borran el token ni alteran el resultado del enlace nuevo. No se ejecutan mutaciones al navegar al enlace.

## Módulos y contratos

`features/auth/types.ts` define los contratos de sesión y usuario; `features/auth/service.ts` conserva las mutaciones de autenticación. `features/locations/service.ts` consume `GET /locations` (`{items}`) y `features/matches/service.ts` consume `GET /matches?page=<n>` (`{items,total,page,pageSize,hasMore}`), con `locationId` y `preferredLocationId` opcionales. El backend conserva las reglas de visibilidad y páginas de 9; el cliente ofrece carga progresiva. Fechas se muestran en `America/Argentina/Buenos_Aires`, precios en ARS.

MVP-01 generaliza el contrato de partido: `sport` contiene `{id,name,slug}` y `sportFormat` contiene `{id,name,slug}` o `null`. `MatchCard` muestra el nombre del deporte y, cuando existe, el formato recibido del backend, seguido de la localidad; no mantiene enums ni mapas de formatos deportivos. El resto de los campos públicos del partido se conserva. MVP-02 agrega descubrimiento por deporte, formato opcional y fecha local; `features/sports/service.ts` y `useSports` consumen `GET /sports` como única fuente del catálogo.

TanStack Query gestiona estado remoto; `useLocations` reutiliza el catálogo. React Hook Form controla formularios y Zod valida nombre, email, contraseña y UUID de localidad. `session.tsx` recupera sesión autoritativa, programa aviso configurable y expiración. El filtro temporal de localidad se representa en la URL del descubrimiento; no usa la selección automática del provider ni actualiza el perfil. No se agregaron operaciones de reserva ni publicación a esta slice.

`components/shell.tsx` compone `SiteHeader` y `SiteFooter`, conserva el aviso de sesión, feedback y acceso rápido por teclado al contenido. `site-header.tsx` recibe únicamente el estado autenticado para presentar la navegación; `site-footer.tsx` presenta el pie compartido. La navegación pública ofrece Ingresar y Crear cuenta en todas las rutas; Partidos y Mi cuenta se muestran únicamente con sesión vigente. Estados remotos incluyen carga, vacío, error y reintento. La base es mobile-first, con etiquetas, foco visible y anuncios accesibles. Las páginas son Server Components; formularios y estado remoto son Client Components.

## Segunda iteración: cuenta y presentación

`SiteHeader` mantiene una sola fila: marca y Beta a la izquierda, cuenta y tema a la derecha. Con sesión vigente, Mi cuenta está disponible también en móvil con ícono, nombre accesible y área táctil de 44 por 44 px. Desde 640 px aparecen además el nombre del usuario y Partidos; los enlaces públicos Ingresar y Crear cuenta conservan su presentación de escritorio. `site-header.module.css` y `account-menu.module.css` encapsulan estas reglas. El menú conserva Perfil, Seguridad, Apariencia y Cerrar sesión, el bloqueo de salida durante operaciones pendientes y el feedback del flujo existente.

`Shell` monta una única instancia de `components/back-to-top.tsx`: muestra Volver arriba al alcanzar una altura de pantalla, abajo a la derecha, con área táctil de 48 por 48 px y separación del área segura. `back-to-top.module.css` usa los tokens del tema y una capa inferior a menús y notificaciones. La activación desplaza al inicio suavemente, o de inmediato con movimiento reducido. Por teclado devuelve el foco a la marca sin otro desplazamiento. El componente mantiene sólo el booleano de visibilidad, usa un listener pasivo y revisa scroll, resize y restauración de posición al cambiar de ruta; limpia listeners y el frame pendiente al desmontar.

`components/account-notice.tsx` y su módulo CSS comparten la presentación de los avisos de recuperar/mantener sesión y verificar email. Separan título, descripción, acciones y feedback anunciado mediante `role=status`; en móvil las acciones se distribuyen debajo del texto. Sobre la landing, el aviso de recuperación conserva márgenes de 20 px y ancho máximo de 1080 px. `Shell` ubica el feedback dentro del aviso cuando está visible y conserva el mensaje independiente si ya desapareció. Home mantiene el reenvío de verificación, deshabilita su botón mientras envía y muestra Enviando…; el resultado queda debajo de las acciones. No cambian la autenticación, services, permisos, contratos backend, migraciones ni seeds.

Las pruebas de componentes cubren menú completo, bloqueo de logout, renovación y recuperación, feedback único, reenvío pendiente, umbral de scroll, resize, navegación, limpieza, movimiento reducido y foco. La validación en navegador cubrió 320, 375, 640 y 1280 px, ambos temas, respuestas de error y reintentos con transporte de autenticación simulado; el stack Docker y los catálogos se comprobaron con servicios reales. El usuario aprobó los ajustes tras su revisión manual. El prototipo de animaciones quedó fuera de esta entrega y no hay ruta `/dev/animations`.

`features/appearance/theme-menu.tsx` utiliza Radix Dropdown Menu y el hook existente `useTheme`: Claro/sol, Oscuro/luna y Sistema/monitor. Las opciones son radio items con texto y marca de selección; el botón anuncia el modo actual, ofrece un área de 44 por 44 px y conserva foco visible. Radix gestiona teclado, Escape, foco y posicionamiento mediante portal. Los estilos del menú se encapsulan en `theme-menu.module.css` y reutilizan los tokens existentes. Apariencia y header se sincronizan mediante el mismo store, eventos y clave `hyt-theme-v1`; no cambia el script previo al pintado ni el snapshot de hidratación. No existen endpoints, payloads, permisos o validaciones de dominio nuevos; el control está disponible para visitantes y usuarios autenticados. No requiere cambios backend, migraciones ni seeds.

`features/account/service.ts` consume `GET /users/me`, `PATCH /users/me` (`{name?,primaryLocationId?}`) y `POST /auth/password/change` (`{currentPassword,newPassword}`). El DTO privado conserva `hasLocalPassword` y excluye `createdAt` y `updatedAt`. No se cambia email ni se introduce teléfono. Las consultas privadas usan claves que incluyen `session.user.id`; no se reutilizan datos de una cuenta al ingresar con otra. El historial de campos se registra internamente en backend, sin ruta de lectura disponible.

`features/locations/location-combobox.tsx` reutiliza catálogo y búsqueda por nombre en registro, selección pendiente, Home y perfil. Usa cmdk + Radix Popover con opciones accesibles, teclado, Escape, retorno de foco y estados remotos. `components/account-menu.tsx` usa Radix Dropdown Menu: Perfil, Seguridad, Apariencia y Cerrar sesión. Los íconos son Lucide decorativos; todas las acciones tienen texto o nombre accesible. No se agregan destinos futuros.

La paleta de club azul/gris incorpora superficies translúcidas moderadas, tokens claros/oscuros y bordes de controles con contraste. No carga fuentes, imágenes ni scripts de terceros. `public/theme-init.js` aplica la preferencia antes de pintar mediante script estático del mismo origen, compatible con CSP `script-src 'self'`; no se altera la política de seguridad. `useTheme` escucha cambios de sistema y navegador; si storage está bloqueado conserva la selección sólo en memoria. `suppressHydrationWarning` se aplica exclusivamente a `html`, cuyos atributos modifica el bootstrap. Se respeta `prefers-reduced-motion`.

## Carrusel informativo de la landing

El hero conserva el título `Te falta uno. A alguien le falta partido.`, el eyebrow `Partidos en Argentina`, los CTAs Buscar un partido (`/partidos`) e Ingresar (`/auth/login`), el fondo, la tipografía, los espaciados y los cuatro deportes de `features/landing/sports-visual.tsx`. La refactorización inferior elimina únicamente la franja redundante de tres pasos al final del hero; no cambia su contenido principal, navbar, autenticación ni rutas.

Debajo del hero, `features/landing/benefits-carousel.tsx` presenta el encabezado `Jugar juntos es más fácil.` con ancla `#como-funciona` y los pasos Elegí dónde jugar, Encontrá tu partido y Sumate a jugar. Cada tarjeta contiene número, título, descripción y etiqueta contextual; `step-illustration.tsx` construye las ilustraciones decorativas con Lucide y CSS. Las referencias a localidades, disponibilidad y reservas son informativas: no consultan ni simulan operaciones del sistema.

El carrusel usa estado React local y muestra una tarjeta completa dentro de un viewport recortado, sin perspectiva ni tarjetas laterales visibles. Las flechas externas, los tres indicadores y ArrowLeft/ArrowRight navegan circularmente; Home/End seleccionan los extremos. Pointer Events reconoce gestos horizontales de al menos 40 px e ignora los verticales, cancelados o cuya captura se perdió. `touch-action:pan-y pinch-zoom` permite desplazamiento vertical y zoom. La transición horizontal dura 450 ms, se desactiva con `prefers-reduced-motion` y no tiene avance automático. Las tarjetas inactivas usan `aria-hidden` e `inert`; la posición se anuncia mediante `role=status`. Los controles conservan foco visible y áreas táctiles de 44 px.

`benefits-carousel.module.css` alinea encabezado, tarjetas y cierre en un ancho máximo de 1160 px, con márgenes de 24 px y de 18 px hasta 480 px. Hasta 760 px la ilustración aparece encima del texto, se ocultan el indicador secundario y la frase de ayuda, y se centran los controles. El borde superior, el degradado y las superficies reutilizan tokens de los temas claro y oscuro. El cierre `La próxima jugada empieza acá.` es texto sin acciones. No se aplica ocultamiento horizontal al documento ni se agregan dependencias.

`components/site-footer.tsx` conserva un único enlace a `/normas`. Su módulo CSS activa la variante de landing sólo cuando existe `[data-landing-hero]`: marca real de Falta Gente, mensaje central y enlaces Cómo funciona (`#como-funciona`) y Normas comunitarias. En móvil se organiza verticalmente. Las demás pantallas conservan la presentación anterior del footer; no se modifica `Shell` ni el layout global.

Los tests unitarios cubren contenido, flechas, navegación circular, indicadores, teclado, gestos, cancelación y ausencia de autoplay. Se actualizaron las expectativas de `tests/landing-carousel.spec.ts`, sin ejecutar pruebas de navegador por indicación del usuario. Lint, TypeScript y build de API y web aprobados; 202 tests frontend y 60 backend aprobados, estos últimos con un worker tras un timeout concurrente. El usuario aprobó formalmente el aspecto y el ajuste tras su revisión manual. El contenedor web quedó reconstruido y saludable; no hay migraciones pendientes ni seeds adicionales necesarios. No cambian contratos, services, permisos, validaciones de entrada ni persistencia.

## Componentes compartidos y estados

La refactorización inferior sustituye la solución de UI-01.1 por un track flex con tarjetas de base 100%, `min-width:0` y recorte limitado al viewport. Los estilos anteriores del carrusel en `globals.css` ya no se aplican al componente y su limpieza queda fuera del alcance; no se modifican estilos base.

Los elementos reutilizables de presentación viven en `components/`: `SiteHeader`, `SiteFooter`, menú de cuenta y `ui/`. Se mantienen separados de los services, hooks y reglas de cada feature; `Shell` conserva su composición y el aviso de sesión.

- `ui/skeleton.tsx`: `Skeleton({className?})` ofrece placeholders decorativos con `aria-hidden`, dimensiones ajustables por clase y animación deshabilitada con `prefers-reduced-motion`.
- `ui/loading-state.tsx`: `LoadingState({label,children?})` anuncia una sola etiqueta con `role=status` y `aria-live=polite`. Sus hijos son placeholders excluidos del árbol accesible; no presenta datos ficticios.
- `ui/empty-state.tsx`: `EmptyState({title,description,action?})` explica un resultado vacío real en una superficie glass y admite una acción útil fuera del anuncio. No contiene skeletons ni inventa acciones.
- `app/not-found.tsx`: 404 del App Router usando `components/ui/be-ui-404-not-found.tsx` (`NotFoundGlitch`). Código 404 grande y centrado, subtítulo `Acá no hay partido`, explicación y enlaces Volver al inicio / Buscar un partido. Sólo renderiza contenido: el layout conserva un único encabezado, main y pie. Next.js maneja el estado HTTP; la prueba de navegador verifica el 404 real. El componente permite configurar código, textos, destinos y clases. Un único ciclo RAF comparte los glifos decorativos durante 700 ms, con actualizaciones cada 45 ms y cancelación al desmontar. El nombre accesible del h1 permanece estable; los glifos y capas de color son decorativos. Motion detecta reducción de movimiento para evitar el ciclo y CSS oculta las capas. No hay autoplay, llamadas API ni persistencia.

Estas piezas reutilizan los tokens de ambos temas y no dependen de autenticación, almacenamiento, llamadas HTTP ni infraestructura nueva. La integración de loading y empty corresponde a cada feature y mantiene separados carga pendiente, resultado vacío y error.

Partidos compone `MatchesLoading` durante la consulta y `MatchCard` para los resultados reales; la tarjeta reutilizable conserva los datos generales y representa el deporte y formato opcional del contrato multideporte. Sin localidad se consulta el listado general. Cuando el resultado está vacío, `EmptyState` informa la ausencia de partidos o permite limpiar filtros, sin modificar la localidad principal. `SessionLoading` se comparte entre Home, acceso a Cuenta y selección de localidad; `ProfileLoading` reutiliza las mismas primitivas. El perfil conserva sus consultas con identidad y permisos, sin consulta adicional de historial.

## Seguridad y configuración

`lib/http.ts` envía `credentials: include`, deshabilita caché HTTP y obtiene CSRF fresco antes de toda mutación. No lee cookies HttpOnly ni almacena credenciales en storage. No hay refresh automático: Mantener/Recuperar sesión solicita `POST /auth/refresh` y luego vuelve a consultar sesión. Expiración elimina la identidad expuesta y los endpoints protegidos deben seguir validando en backend. El error técnico del servidor no se registra; fallos 5xx reciben mensaje seguro con reintento.

Variables públicas: `NEXT_PUBLIC_API_URL` incluye `/api/v1`, por defecto `http://localhost:3001/api/v1`; `NEXT_PUBLIC_SESSION_WARNING_SECONDS`, por defecto `120`. No son secretos. Producción requiere API HTTPS y CORS explícito compatible con cookies, configurados en backend bajo dominios controlados.

## Validación

`pnpm --filter web lint`, `typecheck`, `test`, `build`. Vitest/RTL cubren registro, ubicación inicial, cambio temporal, localidad faltante, perfil e historial, aislamiento de caché entre identidades y protección de tokens de email; HTTP cubre credenciales, CSRF fresco y ausencia de renovación automática. La persistencia real, recuperación, temas y cookies del navegador se verifican en tests de integración/E2E de la slice.

`features/matches/match-card.test.tsx` verifica la presentación de Fútbol/Fútbol 5, Pádel/Dobles y Vóley sin formato. El fixture de partidos de `src/test/integration/vertical-slice.test.tsx` utiliza el mismo contrato anidado sin modificar los escenarios de cuenta, sesión o localidad.

## MVP-02: descubrimiento multideporte

`DiscoveryFilters` extiende el Home y `/partidos` con chips horizontales de deportes, formatos dependientes y fechas Todas / Hoy / Mañana / Elegir fecha. Los datos provienen exclusivamente de `/sports`, con loading, error/reintento y catálogo vacío. Cambiar deporte elimina el formato anterior. El selector de localidad existente se reutiliza sin modificarlo; conserva los demás filtros y no envía cambios de perfil. Los chips son botones con `aria-pressed`, borde y peso de selección, foco visible y altura mínima de 44 px. El scroll se limita a cada grupo, sin animaciones nuevas ni cambios a estilos globales.

`matchesService.list(locationId,page,filters?,preferredLocationId?)` envía únicamente los filtros presentes y omite `locationId` si está vacío. La localidad principal se envía como preferencia de orden, sin agregarse a la URL como filtro. TanStack Query identifica cada combinación mediante `matches,locationId,sportId,sportFormatId,date,preferredLocationId`; la página vive en `pageParam`. Al cambiar filtros, localidad o volver por el historial se conserva como máximo la primera página de la combinación de destino, evitando mezclar resultados o restaurar páginas progresivas anteriores. Las siguientes páginas siguen cargándose de nueve en nueve. «Todas las localidades» quita sólo la localidad; «Limpiar filtros» elimina localidad, deporte, formato y fecha.

`features/matches/discovery/discovery-state.ts` conserva filtros como UUID en query params `location`, `sport`, `format` y fecha calendario `date`; mantiene el pathname actual y los parámetros ajenos (por ejemplo `success`). Usa History API y escucha `popstate`, sin reemplazar el router ni agregar rutas. Ignora UUIDs o fechas de calendario inválidos; la API vuelve a validar relaciones y parámetros. Hoy/Mañana se calculan explícitamente en `America/Argentina/Buenos_Aires` independientemente de la zona del navegador. Elegir fecha usa un input nativo, sin calendario adicional.

Un resultado vacío con filtros consulta de forma diferida el total general sin filtros, con una clave independiente `matches-baseline` que incluye la preferencia: permite distinguir ausencia global de partidos de una combinación sin resultados. Ofrece Limpiar filtros incluso cuando el único filtro es la localidad. No oculta errores de esa consulta como un resultado vacío.

`features/matches/discovery.test.tsx` cubre catálogo, selección deporte/formato, cambio incompatible, todos, fecha local y calendario inválido, localidad temporal, caché/paginación, restauración de historial, loading, reintentos y ambos vacíos. No agrega publicación, detalle, reservas ni navegación futura. Auth, cookies y CSRF mantienen los contratos previos.

## UI-03: feedback efímero

`features/notifications/notifications.tsx` contiene `NotificationProvider` y el hook `useNotify`. El provider se monta una vez dentro de `Providers`, por encima de la sesión, y mantiene las notificaciones exclusivamente en memoria. Reutiliza Lucide y Motion ya instalados; los estilos están encapsulados en `notifications.module.css` y utilizan los tokens de ambos temas.

### API y ciclo de vida

```tsx
const notify = useNotify();
notify.success("Partido publicado.");
notify.error("Lo sentimos! No pudimos completar la operación. Intente nuevamente.");
notify.warning("Quedan pocos lugares.");
notify.info("Su perfil está incompleto.");
notify.success("Perfil actualizado.", { id: eventId, duration: 5000 });
```

Los ejemplos muestran la API disponible; la primera y única integración actual es logout. Las duraciones centralizadas son 4000 ms para success/info, 5000 ms para warning y 6000 ms para error. `duration` acepta un override positivo y finito cuando esté justificado. Se muestran hasta tres notificaciones activas; una cuarta descarta la más antigua, con una salida breve de 150 ms y sin cola.

`id` permite deduplicar la repetición accidental de un evento mientras esté activo, incluidos efectos en Strict Mode. Los eventos legítimos usan IDs distintos o dejan que se genere uno; no se deduplica por texto. Cada instancia tiene una clave interna independiente para evitar que un aviso saliente cierre uno nuevo con el mismo ID.

Un reloj por aviso actualiza cada 50 ms tanto la barra descendente como el vencimiento. Hover y foco de teclado pausan el tiempo; sólo se reanuda cuando terminan ambos, desde el tiempo restante. El cierre manual elimina inmediatamente el aviso activo e inicia su salida breve. Los temporizadores se limpian al desmontar.

### Presentación y accesibilidad

La pila tiene posición fija superior derecha desde 700 px; en mobile ocupa el ancho disponible con márgenes de 16 px y separación superior de 88 px más safe area. No modifica el layout y permite interactuar fuera de las tarjetas. Cada variante comunica su estado con icono, texto y tratamiento visual. Error usa `role="alert"`; las demás variantes, `role="status"`. Los iconos son decorativos y la variante tiene una etiqueta para lectores de pantalla.

El cierre ofrece un objetivo de 44 px, `aria-label="Cerrar notificación"` y foco visible. No se toma el foco automáticamente. `prefers-reduced-motion` elimina el desplazamiento y reduce la transición a cero; la barra y el vencimiento siguen funcionando con el mismo reloj.

### Integración de logout y límites

Después del POST de logout, la limpieza de caché y la consulta de sesión existentes, se emite `notify.success("Sesión cerrada correctamente.", { id: "session-logout" })`. Antes, ese texto quedaba en `feedback` de sesión y Shell lo mostraba sin vencimiento al navegar. Ahora se emite directamente desde el handler exitoso, sin flash pendiente, query params, cookies ni storage. Navegar no reconstruye el evento; recargar o remontar el provider descarta las notificaciones. En Home, la sesión visitante muestra la landing; las rutas protegidas conservan su navegación existente.

Los errores de logout y el feedback de renovación conservan su presentación inline. Los Toasts no reemplazan validaciones de campos ni confirmaciones que requieren una decisión. No cambian endpoints, payloads, permisos, CSRF, credenciales, revocación, cookies ni refresh; no hay cambios backend, migraciones o seeds específicos.

### Pruebas

`features/notifications/notifications.test.tsx` cubre variantes, límite activo, duraciones y override, barra, pausa combinada, cierre, deduplicación en Strict Mode, eventos legítimos y remontaje. Aísla la animación de Motion para verificar el reloj propio. `features/auth/logout-feedback.test.tsx` cubre éxito único, navegación y remontaje sin reconstrucción, fallo seguro y conservación del POST con credenciales y CSRF. La carrera de reutilización de ID durante la salida se verificó mediante revisión de código. UI-03 reserva la comprobación visual al desarrollador y no agrega capturas, regresión visual ni Playwright.

## Compartir partidos

El detalle integra `features/matches/sharing/` en el encabezado. Reutiliza Radix Popover para el popover de escritorio y el bottom sheet modal responsive, con acciones comunes y sin nuevos servicios HTTP. Consultar [MATCH-SHARING.md](MATCH-SHARING.md) para enlaces, disponibilidad, permisos, feedback, accesibilidad y pruebas de la etapa aprobada.

## Base remota Neon

El frontend continúa consumiendo la API NestJS mediante `NEXT_PUBLIC_API_URL`; no recibe credenciales PostgreSQL ni consulta Neon directamente. Para una prueba local separada, la web puede ejecutarse en `http://localhost:3100` y apuntar a `http://localhost:3101/api/v1`, con la API iniciada mediante `pnpm neon:start`. Las variables de origen y puerto de la API deben coincidir con esas direcciones. `API_INTERNAL_URL` permite configurar el acceso desde el servidor Next.js cuando corresponda. `NEXT_PUBLIC_API_URL` debe estar configurada antes de compilar la web o iniciar desarrollo.

La etapa no cambia vistas, services, hooks, permisos ni validaciones frontend. El recorrido pendiente consiste en cargar deportes y localidades, seleccionar una localidad y un deporte y verificar la respuesta de partidos desde Neon. La prueba en navegador quedó bloqueada por el handshake PostgreSQL; el usuario autorizó el commit de la preparación con esa validación pendiente. Consultar [configuración, comandos y evidencia backend](../api/NEON.md).
