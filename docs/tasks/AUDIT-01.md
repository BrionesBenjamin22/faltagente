# Restricción de auditoría e historial de cambios

Estado: implementado y validado manualmente por el usuario el 24 de noviembre de 2026; solicitud de commits recibida. El usuario autorizó además corregir la carrera preexistente de refresh antes de ejecutar los commits.

## Resultado aprobado

Perfil y partidos no muestran auditoría ni historial de campos, ni solicitan sus rutas. `GET /api/v1/users/me/history` y `GET /api/v1/matches/:id/history` fueron retirados y devuelven 404 para todos, incluidos titulares y organizadores. Se eliminaron métodos de lectura, contratos e invalidaciones sin consumidores.

Perfil, sesión, registro/login y gestión de partidos excluyen `createdAt` y `updatedAt` mediante proyecciones explícitas. Se mantienen `version` y `expectedVersion`, capacidad, permisos y contexto de cancelación. Las acciones del organizador conservan carga, errores y reintento independientes del detalle público.

Tablas y escrituras transaccionales históricas permanecen intactas. El historial de reservas propias sigue disponible con tres elementos por página. No se implementan administración ni lista de espera.

## Validación

- Lint, typecheck, builds locales y Docker aprobados; 60 unitarios API y 220 web aprobados.
- Navegador completo: 31 escenarios aprobados (22 con harness y 9 contra API construida), incluidos edición de perfil, aislamiento entre cuentas, publicación, edición, cancelación, conflictos y reservas. Se corrigieron expectativas antiguas del footer y menú móvil. La ejecución definitiva se realizó después de integración para evitar interferencia de localidades temporales en el catálogo compartido de pruebas.
- Integración PostgreSQL final: 82/82. El fallo inicial de renovación concurrente también se reprodujo con el código original. Se corrigió con autorización expresa y se agregó una regresión determinista que falla antes de la corrección y aprueba después. Ver [AUTH-REFRESH-01](AUTH-REFRESH-01.md). La revisión independiente de seguridad aprobó la solución.
- Stack habitual reconstruido y saludable; nueve migraciones aplicadas, sin pendientes. No se requieren migraciones ni seeds nuevos. Pruebas sobre PostgreSQL aislado `falta_gente_test`.

## Pendientes

La carrera de refresh quedó corregida y la integración completa aprobó. La administración futura del historial y la lista de espera son alcances separados, todavía no implementados. Publicación de commits, PR y CI remota no forman parte de esta autorización de commits locales.
