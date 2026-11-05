# Vertical slice de Falta Gente

## Vistas

La landing ofrece `Ingresar` hacia `/auth/login`. El pie de login muestra `No tenés cuenta? Registrate`, con enlace a `/auth/register`; el registro conserva `Ya tenés cuenta? Ingresar` hacia login. Esta navegación no modifica la autenticación ni sus validaciones.

- `/`: presentación breve para visitantes; Home de partidos disponibles para usuarios autenticados, iniciado con `user.primaryLocation`. Una sesión sin localidad redirige a `/auth/location`.
- `/partidos`: descubrimiento público con el mismo listado y filtros del Home.
- `/account/profile`: edición del nombre y localidad principal, email de solo lectura, auditoría e historial con páginas de 3 cambios. Envía exclusivamente diferencias; sin cambios no llama al backend.
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

`features/auth/service.ts` define DTOs de sesión y usuario y las mutaciones de autenticación. `features/locations/service.ts` consume `GET /locations` (`{items}`) y `features/matches/service.ts` consume `GET /matches?locationId=<uuid>&page=<n>` (`{items,total,page,pageSize,hasMore}`). El backend conserva las reglas del listado y páginas de 9; el cliente ofrece carga progresiva. Fechas se muestran en `America/Argentina/Buenos_Aires`, precios en ARS.

MVP-01 generaliza el contrato de partido: `sport` contiene `{id,name,slug}` y `sportFormat` contiene `{id,name,slug}` o `null`. `MatchCard` muestra el nombre del deporte y, cuando existe, el formato recibido del backend, seguido de la localidad; no mantiene enums ni mapas de formatos deportivos. El resto de los campos públicos del partido se conserva. MVP-02 agrega descubrimiento por deporte, formato opcional y fecha local; `features/sports/service.ts` y `useSports` consumen `GET /sports` como única fuente del catálogo.

TanStack Query gestiona estado remoto; `useLocations` reutiliza el catálogo. React Hook Form controla formularios y Zod valida nombre, email, contraseña y UUID de localidad. `session.tsx` recupera sesión autoritativa, programa aviso configurable y expiración. El selector temporal conserva el provider por identidad y se representa también en la URL del descubrimiento; no actualiza el perfil. No se agregaron operaciones de reserva ni publicación a esta slice.

`components/shell.tsx` compone `SiteHeader` y `SiteFooter`, conserva el aviso de sesión, feedback y acceso rápido por teclado al contenido. `site-header.tsx` recibe únicamente el estado autenticado para presentar la navegación; `site-footer.tsx` presenta el pie compartido. La navegación pública ofrece Ingresar y Crear cuenta en todas las rutas; Partidos y Mi cuenta se muestran únicamente con sesión vigente. Estados remotos incluyen carga, vacío, error y reintento. La base es mobile-first, con etiquetas, foco visible y anuncios accesibles. Las páginas son Server Components; formularios y estado remoto son Client Components.

## Segunda iteración: cuenta y presentación

UI-02 mantiene `SiteHeader` en una sola fila: marca y Beta a la izquierda, selector de tema a la derecha. La navegación de escritorio (Partidos y cuenta con sesión, Ingresar y Crear cuenta sin sesión) se oculta por debajo del breakpoint Tailwind `sm` (640 px). No agrega rutas, menú hamburguesa ni navegación inferior. El contenedor usa clases de Tailwind y `site-header.module.css` encapsula la visibilidad de navegación: una regla local sin capa evita que el `display:flex` del `nav` global prevalezca sobre las utilidades. No modifica layout, estilos base ni contenido de cuenta.

`features/appearance/theme-menu.tsx` utiliza Radix Dropdown Menu y el hook existente `useTheme`: Claro/sol, Oscuro/luna y Sistema/monitor. Las opciones son radio items con texto y marca de selección; el botón anuncia el modo actual, ofrece un área de 44 por 44 px y conserva foco visible. Radix gestiona teclado, Escape, foco y posicionamiento mediante portal. Los estilos del menú se encapsulan en `theme-menu.module.css` y reutilizan los tokens existentes. Apariencia y header se sincronizan mediante el mismo store, eventos y clave `hyt-theme-v1`; no cambia el script previo al pintado ni el snapshot de hidratación. No existen endpoints, payloads, permisos o validaciones de dominio nuevos; el control está disponible para visitantes y usuarios autenticados. No requiere cambios backend, migraciones ni seeds.

`features/account/service.ts` consume `GET /users/me`, `PATCH /users/me` (`{name?,primaryLocationId?}`), `GET /users/me/history?page=n` y `POST /auth/password/change` (`{currentPassword,newPassword}`). El DTO privado agrega `hasLocalPassword`, `createdAt` y `updatedAt`. No se cambia email ni se introduce teléfono. Las consultas privadas usan claves que incluyen `session.user.id`; no se reutilizan datos de una cuenta al ingresar con otra. El historial muestra sólo cambios de campos, en páginas de 3.

`features/locations/location-combobox.tsx` reutiliza catálogo y búsqueda por nombre en registro, selección pendiente, Home y perfil. Usa cmdk + Radix Popover con opciones accesibles, teclado, Escape, retorno de foco y estados remotos. `components/account-menu.tsx` usa Radix Dropdown Menu: Perfil, Seguridad, Apariencia y Cerrar sesión. Los íconos son Lucide decorativos; todas las acciones tienen texto o nombre accesible. No se agregan destinos futuros.

La paleta de club azul/gris incorpora superficies translúcidas moderadas, tokens claros/oscuros y bordes de controles con contraste. No carga fuentes, imágenes ni scripts de terceros. `public/theme-init.js` aplica la preferencia antes de pintar mediante script estático del mismo origen, compatible con CSP `script-src 'self'`; no se altera la política de seguridad. `useTheme` escucha cambios de sistema y navegador; si storage está bloqueado conserva la selección sólo en memoria. `suppressHydrationWarning` se aplica exclusivamente a `html`, cuyos atributos modifica el bootstrap. Se respeta `prefers-reduced-motion`.

## Carrusel informativo de la landing

El hero conserva el título `Te falta uno. A alguien le falta partido.`, los CTAs Buscar un partido (`/partidos`) e Ingresar (`/auth/login`), y la estructura copy + recurso visual. UI-01 actualiza el eyebrow a `Partidos en Argentina` y la descripción a encontrar deportes cerca sin conocer al organizador ni depender de un grupo. `features/landing/sports-visual.tsx` reemplaza la cancha por una matriz estática 2x2 de Fútbol, Pádel, Básquet y Vóley con igual jerarquía, etiquetas y SVG locales/Lucide; no consulta ni modifica el catálogo. `landing.module.css` encapsula los ajustes de presentación sin cambiar estilos base.

Debajo del hero, `features/landing/benefits-carousel.tsx` conserva `Más fácil juntarse a jugar`: Elegí dónde jugar, Encontrá un partido y Sumá a tus compañeros. Explica localidad, deporte, lugar, fecha, horario, formato, precio y lugares libres, reserva de un lugar sin conocer al resto y varios lugares para compañeros. No implementa operaciones de reserva ni agrega enlaces a flujos futuros.

El carrusel mantiene el escenario CSS 3D y estado React local, sin dependencias nuevas ni avance automático. La tarjeta activa queda frontal y las laterales parcialmente visibles; conservan superficies opacas según tema. Las tarjetas laterales se seleccionan directamente para llevarlas al centro, sin botones Anterior/Siguiente. Conserva indicadores, swipe horizontal con Pointer Events y teclado ArrowLeft/ArrowRight/Home/End sobre el grupo enfocable. Gestos inferiores a 40 px, verticales, cancelados o cuya captura se perdió no cambian la selección. Se permiten scroll vertical y pinch zoom. Las transiciones locales duran 250 ms y se desactivan con `prefers-reduced-motion`. El contenido de las slides inactivas mantiene `aria-hidden` e `inert`, con controles accesibles sobre las tarjetas laterales; el estado se anuncia a lectores de pantalla.

Los tests de componentes cubren controles, extremos, indicadores, teclado, swipe, cancelación y ausencia de autoplay. La validación responsive y visual manual corresponde al desarrollador; UI-01 no usa screenshots, comparaciones de imágenes ni inspección visual automatizada. No modifica header, footer, tema, sesión, perfil ni pantallas de partidos. Es una presentación pública sin nuevos contratos, services, permisos, validaciones de entrada ni cambios backend o de persistencia.

## Componentes compartidos y estados

UI-01.1 contiene el overflow del carrusel en su sección y viewport mediante límites de ancho y `min-width:0`. El track usa una columna `minmax(0,1fr)` para evitar expansión por el contenido; conserva el máximo desktop de 960 px y el ancho proporcional de las tarjetas. El foco de viewport e indicadores se dibuja hacia dentro para respetar el recorte. No modifica contenido, navegación, gestos ni transiciones. La comprobación visual en 320, 375, 390 y 430 px corresponde al desarrollador; los tests existentes verifican la interacción.

Los elementos reutilizables de presentación viven en `components/`: `SiteHeader`, `SiteFooter`, menú de cuenta y `ui/`. Se mantienen separados de los services, hooks y reglas de cada feature; `Shell` conserva su composición y el aviso de sesión.

- `ui/skeleton.tsx`: `Skeleton({className?})` ofrece placeholders decorativos con `aria-hidden`, dimensiones ajustables por clase y animación deshabilitada con `prefers-reduced-motion`.
- `ui/loading-state.tsx`: `LoadingState({label,children?})` anuncia una sola etiqueta con `role=status` y `aria-live=polite`. Sus hijos son placeholders excluidos del árbol accesible; no presenta datos ficticios.
- `ui/empty-state.tsx`: `EmptyState({title,description,action?})` explica un resultado vacío real en una superficie glass y admite una acción útil fuera del anuncio. No contiene skeletons ni inventa acciones.
- `app/not-found.tsx`: 404 del App Router usando `components/ui/be-ui-404-not-found.tsx` (`NotFoundGlitch`). Código 404 grande y centrado, subtítulo `Acá no hay partido`, explicación y enlaces Volver al inicio / Buscar un partido. Sólo renderiza contenido: el layout conserva un único encabezado, main y pie. Next.js maneja el estado HTTP; la prueba de navegador verifica el 404 real. El componente permite configurar código, textos, destinos y clases. Un único ciclo RAF comparte los glifos decorativos durante 700 ms, con actualizaciones cada 45 ms y cancelación al desmontar. El nombre accesible del h1 permanece estable; los glifos y capas de color son decorativos. Motion detecta reducción de movimiento para evitar el ciclo y CSS oculta las capas. No hay autoplay, llamadas API ni persistencia.

Estas piezas reutilizan los tokens de ambos temas y no dependen de autenticación, almacenamiento, llamadas HTTP ni infraestructura nueva. La integración de loading y empty corresponde a cada feature y mantiene separados carga pendiente, resultado vacío y error.

Partidos compone `MatchesLoading` durante la consulta y `MatchCard` para los resultados reales; la tarjeta reutilizable conserva los datos generales y representa el deporte y formato opcional del contrato multideporte. Cuando falta localidad o el resultado está vacío, `EmptyState` abre el selector existente para elegir otra zona, sin modificar la localidad principal. `SessionLoading` se comparte entre Home, acceso a Cuenta y selección de localidad; `ProfileLoading` y el historial reutilizan las mismas primitivas. El historial vacío ofrece acceso al campo de nombre mediante Editar perfil. Las consultas, sus claves por identidad y los permisos permanecen intactos.

## Seguridad y configuración

`lib/http.ts` envía `credentials: include`, deshabilita caché HTTP y obtiene CSRF fresco antes de toda mutación. No lee cookies HttpOnly ni almacena credenciales en storage. No hay refresh automático: Mantener/Recuperar sesión solicita `POST /auth/refresh` y luego vuelve a consultar sesión. Expiración elimina la identidad expuesta y los endpoints protegidos deben seguir validando en backend. El error técnico del servidor no se registra; fallos 5xx reciben mensaje seguro con reintento.

Variables públicas: `NEXT_PUBLIC_API_URL` incluye `/api/v1`, por defecto `http://localhost:3001/api/v1`; `NEXT_PUBLIC_SESSION_WARNING_SECONDS`, por defecto `120`. No son secretos. Producción requiere API HTTPS y CORS explícito compatible con cookies, configurados en backend bajo dominios controlados.

## Validación

`pnpm --filter web lint`, `typecheck`, `test`, `build`. Vitest/RTL cubren registro, ubicación inicial, cambio temporal, localidad faltante, perfil e historial, aislamiento de caché entre identidades y protección de tokens de email; HTTP cubre credenciales, CSRF fresco y ausencia de renovación automática. La persistencia real, recuperación, temas y cookies del navegador se verifican en tests de integración/E2E de la slice.

`features/matches/match-card.test.tsx` verifica la presentación de Fútbol/Fútbol 5, Pádel/Dobles y Vóley sin formato. El fixture de partidos de `slice.test.tsx` utiliza el mismo contrato anidado sin modificar los escenarios de cuenta, sesión o localidad.

## MVP-02: descubrimiento multideporte

`DiscoveryFilters` extiende el Home y `/partidos` con chips horizontales de deportes, formatos dependientes y fechas Todas / Hoy / Mañana / Elegir fecha. Los datos provienen exclusivamente de `/sports`, con loading, error/reintento y catálogo vacío. Cambiar deporte elimina el formato anterior. El selector de localidad existente se reutiliza sin modificarlo; conserva los demás filtros y no envía cambios de perfil. Los chips son botones con `aria-pressed`, borde y peso de selección, foco visible y altura mínima de 44 px. El scroll se limita a cada grupo, sin animaciones nuevas ni cambios a estilos globales.

`matchesService.list(locationId,page,filters?)` envía únicamente `sportId`, `sportFormatId` y `date` presentes. TanStack Query identifica cada combinación mediante `matches,locationId,sportId,sportFormatId,date`; la página vive en `pageParam`. Al cambiar filtros, localidad o volver por el historial se conserva como máximo la primera página de la combinación de destino, evitando mezclar resultados o restaurar páginas progresivas anteriores. Las siguientes páginas siguen cargándose de nueve en nueve.

`discovery-state.ts` conserva filtros como UUID en query params `location`, `sport`, `format` y fecha calendario `date`; mantiene el pathname actual y los parámetros ajenos (por ejemplo `success`). Usa History API y escucha `popstate`, sin reemplazar el router ni agregar rutas. Ignora UUIDs o fechas de calendario inválidos; la API vuelve a validar relaciones y parámetros. Hoy/Mañana se calculan explícitamente en `America/Argentina/Buenos_Aires` independientemente de la zona del navegador. Elegir fecha usa un input nativo, sin calendario adicional.

Un resultado vacío con filtros consulta de forma diferida el total de la localidad sin filtros, con una clave independiente `matches-baseline`: permite distinguir una zona sin partidos de una combinación sin resultados. Ofrece Limpiar filtros conservando localidad, o Cambiar localidad. No oculta errores de esa consulta como un resultado vacío.

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
