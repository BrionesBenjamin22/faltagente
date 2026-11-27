# Lista de espera

## Vistas y componentes

La feature `src/features/waitlist` incorpora `WaitlistPanel` al detalle autenticado del partido, `OrganizerWaitlist` a su gestión y `MyWaitlist` a la sección En espera de Mis partidos. No agrega rutas, layout global ni interfaz de notificaciones.

El ingreso aparece para partidos completos y futuros de otro organizador. Permite solicitar una cantidad entera entre uno y el menor valor entre 100 y la capacidad publicada. Una solicitud en espera permite salir con confirmación. Una oferta muestra su vencimiento, cuenta regresiva y acciones de aceptación o rechazo; rechazar requiere confirmación. El botón de aceptación se deshabilita al llegar al plazo visible. Backend conserva la autoridad sobre vigencia, titularidad, cupos y participación diaria.

Tras aceptar, la reserva se muestra mediante el flujo habitual de cantidades, con cantidad original y versión, sin nombres ni registros individuales de acompañantes. Salir, rechazar o vencer finaliza la solicitud; un nuevo ingreso obtiene nueva antigüedad. Las respuestas terminales y los errores muestran feedback visible. La gestión y En espera paginan de a nueve. El organizador ve nombre del titular, cantidad y estado sin contacto.

## Service, tipos, hooks y validaciones

- `service.ts`: ingreso, consulta propia, salida por ID concreto, listado del organizador, listado propio, aceptación y rechazo; usa cookies, CSRF nuevo por mutación y transporte privado sin caché.
- `types.ts`: solicitudes, ofertas y páginas según el [contrato backend](../../api/WAITLIST.md).
- `validation.ts`: cantidad entera positiva hasta el menor valor entre la capacidad publicada y `MAX_RESERVATION_PLACES = 100`, mediante Zod y la constante de la feature de reservas.
- `hooks.ts`: `useOwnWaitlist`, `useWaitlistAction`, claves por usuario/partido y actualización coordinada de caché mediante `refreshWaitlist`.
- `waitlist.module.css`: estilos locales para estados, ofertas, confirmaciones y listados responsive.

Las solicitudes activas del detalle se consultan cada diez segundos y al recuperar foco; no se usan WebSockets. Las transiciones refrescan reservas, disponibilidad y gestión. Ingresar, salir, aceptar, rechazar, publicar, reservar, reducir lugares, cancelar y editar invalidan las cachés relacionadas. La reducción o cancelación de una reserva puede asignar inmediatamente sus lugares liberados a una oferta compatible; la disponibilidad visible puede continuar en cero. Las mutaciones bloquean duplicados mientras están pendientes. Una sesión vencida utiliza la sincronización existente; los conflictos refrescan el estado para poder reintentar.

La edición respeta `hasActiveWaitlist` para bloquear campos críticos y calcula capacidad mínima como confirmados más retenidos. Gestión diferencia reservas confirmadas y lugares protegidos por ofertas. No confunde la oferta con una reserva ya confirmada.

## Permisos, accesibilidad y pruebas

Los visitantes conservan el acceso público al detalle; operar requiere sesión. Los permisos reales se verifican en API. Las confirmaciones gestionan el foco, los mensajes son visibles y los formularios incluyen etiquetas y estados de carga. Los listados y paneles mantienen el estilo existente.

`waitlist.test.tsx` cubre cantidad y máximo de 100, ingreso, salida por solicitud concreta, aceptación, plazo, rechazo, errores recuperables, paginación, En espera y CSRF. Tres pruebas Playwright en `tests/waitlist.spec.ts` verifican cupos protegidos y reserva, salida/reingreso/rechazo y vencimiento con reasignación real. `tests/reservation-places.spec.ts` agrega la liberación parcial por cantidad seguida de una oferta compatible y su aceptación. También se mantienen las pruebas de reserva, edición y Mis partidos.

El envío de correo y las notificaciones in-app quedan a cargo del módulo futuro; ver el contrato de eventos del backend y la [validación de etapa](../../../docs/WAITLIST.md).
