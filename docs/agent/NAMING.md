# Identidad y convenciones de Falta Gente

## Nombre vigente

El nombre del producto es **Falta Gente**, con ambas iniciales en mayúscula y un espacio. Usarlo en documentación, interfaz, metadatos, accesibilidad, correos y descripción de la API. No usar abreviaturas de marca.

Para identificadores técnicos nuevos, usar `falta-gente` en minúsculas y con guion: paquete raíz `falta-gente`, imágenes `falta-gente-web:local` y `falta-gente-api:local`, caches de build `falta-gente-web-pnpm` y `falta-gente-api-pnpm`. Para ejemplos de dominio usar `app.falta-gente.test`, sin implicar un dominio productivo registrado. Los paquetes internos siguen siendo `web` y `api`; los scopes de commit siguen nombrando el módulo funcional, por ejemplo `docs(branding): unificar identidad de Falta Gente`.

## Compatibilidad de identificadores existentes

El cambio de marca no migra sesiones ni datos. Estos identificadores heredados se conservan de forma deliberada y no deben copiarse para funcionalidades nuevas:

| Identificador | Motivo |
| --- | --- |
| Cookies `furvo-access`, `furvo-refresh`, `furvo-browser` y variantes `__Host-` | Mantener sesiones y vinculación CSRF existentes. |
| JWT `issuer=hyt-api`, `audience=hyt-web` | Validar tokens ya emitidos. |
| Prefijo determinista del seed `hyt:` | Conservar UUIDs y evitar duplicar datos al repetir el seed. |
| Preferencia `hyt-theme-v1` y evento `hyt-theme-change` | Mantener la preferencia guardada y sincronización del tema. |
| Usuario/base de ejemplo `hyt`, bases aisladas `hyt_slice` y `hyt_slice_test` | Mantener configuración y protecciones de las suites existentes. |
| Volumen Compose `hyt-postgres` | Volver a montar los datos existentes; renombrarlo puede crear un volumen vacío. |

Los nombres concretos registrados en evidencia histórica de Docker se conservan como hechos de esas ejecuciones. Los comandos operativos vigentes usan la nueva convención; la evidencia histórica no es una plantilla de configuración.

Cambiar cualquiera de estos identificadores requiere un plan específico de migración y pruebas de compatibilidad. No renombrar carpetas locales, ramas, remotos, bases ni recursos desplegados como parte de un cambio editorial. No editar archivos de entorno privados para actualizar la marca.

## Validación del cambio de marca

Se actualizaron documentación, instrucciones del proyecto, nombre del seed de localidades, interfaz, metadatos raíz/404, etiquetas accesibles, asunto del correo de verificación y descripción OpenAPI. Sólo cambia la identidad textual; los controles de autenticación, CORS, CSRF y validación de tokens se conservan.

Pasaron `pnpm lint`, `pnpm typecheck`, `pnpm test --maxWorkers=1` (38 API y 67 frontend), `pnpm build`, la suite `test/app.e2e-spec.ts` (4 casos con Nest real, sin consultas a base de datos), la validación estática de Compose con valores ficticios y `git diff --check`. El test de correo usa un transporte simulado y verifica asunto, destinatario y enlace.

La comprobación de renderizado móvil con Chromium verificó título, encabezado, landing, etiqueta accesible del carrusel y título 404 sobre el frontend compilado. Se simuló únicamente la respuesta de sesión anónima: no se validaron autenticación real, entrega de correo ni ejecución de imágenes Docker. La búsqueda final no encontró marcas anteriores en los textos visibles actualizados. No se creó ningún commit.
