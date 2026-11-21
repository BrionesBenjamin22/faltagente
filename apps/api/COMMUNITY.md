# Normas comunitarias: alcance backend e integración futura

Esta entrega agrega una página pública y contacto por correo desde frontend. No crea endpoints, DTOs, modelos, relaciones, estados, auditoría persistida, migraciones ni seeds. No modifica autenticación, permisos ni el servicio de correo transaccional.

## Contrato actual

El frontend construye un enlace `mailto:` a partir de una dirección pública configurada. El envío se realiza fuera de la aplicación y no se observa desde la API. No hay garantía de entrega ni evento de feedback recibido. Resend y sus credenciales actuales no intervienen en este flujo.

El acceso al buzón debe limitarse a los administradores desde el proveedor de correo. No se implementa un panel administrativo ni una API de consulta en esta etapa.

## Coordinación con notificaciones

La futura recepción de feedback requiere decidir entre un formulario respaldado por API o una integración de correo entrante. Debe persistirse una recepción real antes de generar notificaciones. No generar eventos desde clics en el enlace ni introducir ahora un contrato ficticio que condicione al módulo de notificaciones.

Cuando se incorpore la bandeja, sus endpoints y notificaciones deberán validar en backend el acceso administrativo. Será necesario definir identidad/roles administrativos, privacidad del contenido, validación, protección contra abuso, trazabilidad, retención y pruebas de autorización. Los participantes de un partido no obtienen permisos administrativos por organizarlo. Las normas y el contacto seguirán siendo públicos.

La bandeja, respuestas internas, denuncias, sanciones y seguimiento de estados quedan fuera de esta entrega. [Documentación frontend](../web/docs/community.md).
