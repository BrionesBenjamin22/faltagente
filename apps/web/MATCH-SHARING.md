# Compartir partidos

Etapa aprobada manualmente el 25 de noviembre de 2026. La funcionalidad está encapsulada en `src/features/matches/sharing/` y se integra exclusivamente en el encabezado del detalle público `/partidos/[id]`.

## Componentes e interacción

`MatchSharing` muestra un disparador Lucide `Share2` de 44 px con nombre accesible y tooltip nativo «Compartir partido». Reutiliza Radix Popover, ya instalado, para el portal, posicionamiento con detección de colisiones, cierre exterior/Escape y gestión del foco. No desplaza el contenido de la tarjeta.

Desde 600 px presenta un popover alineado al extremo derecho con las acciones en una fila. Hasta 599 px usa el mismo contenido como bottom sheet modal: backdrop, indicador superior, cierre explícito, foco contenido, bloqueo del scroll y retorno al disparador. La grilla tiene tres acciones en la primera fila y dos centradas en la segunda; si no hay soporte nativo, la cuarta acción queda centrada. Respeta el safe area inferior, permite scroll interno y elimina las animaciones con `prefers-reduced-motion`.

El estado de apertura y el listado de acciones son únicos. Los estilos permanecen en `match-sharing.module.css`, usan los tokens existentes de ambos temas y conservan áreas táctiles de al menos 44 px. Copiar y Más usan Lucide; WhatsApp, Telegram y X conservan SVG de marca locales. No se agregan dependencias ni se modifica el layout global.

## Enlaces, permisos y validaciones

`share-links.ts` contiene las funciones puras de elegibilidad, URL pública, texto y destinos. `useMatchSharing` administra Clipboard API, Web Share API, disponibilidad y feedback, sin services HTTP adicionales.

- Disponible sin sesión para partidos futuros `OPEN` o `CLOSED`, incluso completos. Se oculta al inicio o al cancelar; se revalida tras recuperar foco/visibilidad y antes de ejecutar las acciones.
- La URL usa únicamente el origen del frontend y `/partidos/{id}`. No incorpora query params ni fragmentos de la navegación actual.
- El texto incluye deporte, formato opcional, localidad y fecha de Buenos Aires. No incluye contacto privado, datos de sesión ni afirmaciones sobre cupos actuales.
- Copiar confirma «Enlace copiado correctamente» después de resolver la operación. Si falla o no hay soporte, ofrece un campo de solo lectura seleccionable para copiar manualmente.
- WhatsApp, Telegram y X usan compositores HTTPS fijos con parámetros codificados. Abren otra pestaña con `noopener noreferrer`.
- Más aparece únicamente cuando existe `navigator.share`; envía texto y URL. La cancelación nativa no muestra error; los demás fallos conservan las alternativas y muestran feedback seguro.

No hay persistencia, analítica, nuevas reglas de autorización, endpoints ni cambios en el backend. El recurso compartido conserva la visibilidad del [detalle público](../api/MATCH-DETAIL.md). No se implementan notificaciones, metadatos Open Graph específicos ni imágenes sociales.

## Pruebas

`share-links.test.ts` cubre URL limpia, codificación, fecha local, formato opcional, destinos y elegibilidad. `match-sharing.test.tsx` cubre copia asíncrona, fallback manual, soporte nativo, cancelación/error, vencimiento, revalidación, apertura/cierre, Escape, clic exterior, modalidad móvil, bloqueo del scroll y retorno del foco: 22 casos entre ambas suites.

`tests/match-sharing.spec.ts` conserva escenarios de navegador para visitante, partido completo/cerrado y organizador con compartir nativo; fue adaptado al cierre modal. La revisión visual de este ajuste quedó a cargo del usuario por solicitud expresa; no se ejecutaron comprobaciones visuales del agente para el rediseño.
