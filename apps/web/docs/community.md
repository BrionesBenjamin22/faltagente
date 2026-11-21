# Normas comunitarias y soporte

## Vista y navegación

`/normas` es pública, sin sesión ni aceptación obligatoria. Se accede desde el pie global y permite volver al Home. Presenta pautas de respeto, publicación honesta, compromiso de asistencia y aviso oportuno de cancelaciones. No agrega penalizaciones ni reputación. No constituye una sección de términos y condiciones.

La implementación vive en `src/features/community/` y se renderiza en servidor, sin requests adicionales, hooks, service remoto ni dependencias nuevas. Los estilos son locales y usan los tokens existentes, compatibles con temas claro/oscuro y pantallas móviles.

## Contacto configurable

Definir `NEXT_PUBLIC_SUPPORT_EMAIL` en `apps/web/.env.local` para desarrollo en host o en `.env` raíz para la construcción con Docker Compose. La dirección es pública y debe corresponder a un buzón real supervisado por el equipo. Nunca configurar credenciales en esta variable. Preferir `soporte@<dominio-controlado>`; no usar direcciones ficticias ni un buzón de no respuesta.

Next.js fija esta configuración durante el build: cambiar el correo requiere reconstruir la web. Compose transmite la variable como argumento al Dockerfile; el valor predeterminado está vacío.

Con una dirección válida, «Escribir a soporte» abre el cliente de correo mediante `mailto:` con asunto fijo. También se muestra la dirección para copiarla manualmente. El usuario decide el contenido y envía desde su correo. La aplicación no envía, confirma, registra ni rastrea el mensaje, y no adjunta nombre, email, identificadores, sesión ni otros datos personales automáticamente.

Si la dirección está ausente, vacía o es inválida se muestra «El canal de soporte estará disponible próximamente», sin acción de envío. Se admite una única dirección, sin parámetros adicionales ni saltos de línea. El asunto se codifica para la URL.

## Integración futura con notificaciones

El bloque actual recibe feedback general: problemas de la aplicación, quejas y sugerencias. No incorpora denuncias formales sobre personas o partidos.

La futura bandeja y sus notificaciones serán privadas para administradores. La lectura de normas y el acceso al contacto seguirán siendo públicos. Actualmente la restricción de lectura del buzón debe configurarse en el proveedor de correo; no existe bandeja administrativa en la aplicación.

Un clic en `mailto:` no equivale a una queja recibida. Para integrar el módulo de notificaciones será necesario un caso de uso backend de recepción de feedback o una integración con el buzón. Solo una recepción confirmada y persistida podrá originar una notificación administrativa. El contrato y los permisos se definirán junto con ese módulo, sin depender del componente de normas ni de sus clics.

Consultar también [el alcance backend](../../api/COMMUNITY.md).

## Validación

Tests de UI cubren contenido público, estados de correo configurado/no disponible y el enlace del pie. La validación del contacto comprueba destinatario único, asunto y rechazo de parámetros inyectados. La comprobación de navegador debe revisar acceso anónimo, navegación por teclado, móvil, temas y vuelta al Home; no enviar correos reales desde pruebas.
