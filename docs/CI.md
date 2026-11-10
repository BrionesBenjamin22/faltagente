# Integración continua

## Objetivo y flujo Git

La integración continua valida cambios de frontend, backend, base de datos y empaquetado antes de integrarlos. El flujo es `feature/* → PR → dev → PR → main`. Crear cada rama de trabajo desde `dev`; `main` representa producción estable. La implementación inicial vive en `feature/ci-github-actions` y se integra por PR hacia `dev`.

El usuario renombró las ramas a `dev` y `main`. No es necesario volver a renombrarlas ni modificar el remoto. Un resultado exitoso cubre los comportamientos comprobados por las suites; agregar pruebas de regresión cuando cambie un comportamiento.

## Workflow y controles

El contrato está en [ci.yml](../.github/workflows/ci.yml). Se ejecuta en PR abiertos, reabiertos y actualizados hacia `dev` y `main`, en push a ambas ramas y manualmente mediante `workflow_dispatch`. Los cambios documentales también ejecutan todos los controles. La ejecución manual estará disponible desde GitHub cuando el workflow llegue a la rama predeterminada.

Los runners usan Ubuntu 24.04, Node indicado en `.nvmrc` y pnpm indicado en `packageManager`. La instalación utiliza `pnpm install --frozen-lockfile`; la caché del almacén pnpm se identifica por el lockfile. Cada nuevo commit cancela la ejecución anterior del mismo PR.

| Job | Responsabilidad | Límite |
| --- | --- | --- |
| `quality` | Generar Prisma, lint, tipos, unitarios y builds de web/API. | 20 minutos |
| `integration` | Aplicar migraciones en PostgreSQL/PostGIS vacío y ejecutar integración API real. | 20 minutos |
| `browser` | Compilar web/API y ejecutar todos los recorridos existentes con Chromium. Depende de `quality`. | 30 minutos |
| `docker` | Construir las imágenes finales de web y API, en matriz, sin publicarlas. | 30 minutos por imagen |
| `ci-required` | Exigir éxito de todos los jobs anteriores, incluidas ambas imágenes. | 5 minutos |

El gate se ejecuta incluso si alguna dependencia falla y rechaza resultados omitidos, cancelados o fallidos. Unitarios e integración usan un worker para evitar agotamiento de recursos y carreras entre fixtures. Los builds de navegador son propios de su runner; no se intercambian bases ni procesos entre jobs.

## Datos, servicios y navegador

Integración y navegador tienen servicios independientes `postgis/postgis:16-3.5`, con healthcheck y base descartable `falta_gente_test`, usuario `falta_gente_test` y conexión por loopback. Los valores de conexión son exclusivos de esos servicios de CI y no otorgan acceso a otros entornos. Nunca conectar estas suites a la base habitual de desarrollo ni a producción.

Las protecciones de las suites aceptan únicamente `falta_gente_test` en loopback. Por decisión explícita del usuario, los nombres de pruebas anteriores dejan de admitirse; no se renombran bases persistidas de desarrollo ni producción. Consultar [la preparación y cobertura de tests](../tests/README.md).

Antes de probar se genera Prisma y se aplica `prisma migrate deploy`. Navegador además ejecuta el seed existente de desarrollo sobre su base descartable, con `NODE_ENV=development`, para disponer del catálogo y los partidos demostrativos requeridos.

`pnpm test:ci` ejecuta la validación automatizada de la configuración de CI; `pnpm test:e2e:ci` orquesta las suites de navegador. Playwright usa Chromium y un worker. El frontend compilado inicia en `http://localhost:3000`; su API pública se configura al compilar como `http://localhost:3001/api/v1`. Cada servidor debe responder antes de iniciar pruebas, con espera acotada y cierre de procesos al finalizar.

Las suites tienen dos ciclos de vida y se ejecutan separadas:

1. `vertical-slice`, `account-recovery` y `multisport-discovery` utilizan el harness: cada worker levanta la API Nest compilada y reemplaza únicamente el envío de correo por memoria. El puerto 3001 debe estar libre al iniciar.
2. Después de cerrar el harness, se inicia la API compilada, se espera `/health` y se ejecutan `auth-validation` y `landing-carousel` contra esa API disponible.

El transporte de correo real no se prueba. La API compilada utiliza configuración local `development`: la configuración productiva exige HTTPS y proveedor real de correo. El frontend utiliza su build productivo. No se debilitan cookies, sesiones, CORS ni CSRF para ejecutar CI. El ejecutor rechaza puertos ocupados antes de iniciar servicios y cierra sus procesos al finalizar.

Las pruebas respetan UI-02: el header móvil oculta la navegación de cuenta. Registro y descubrimiento conservan cobertura móvil; los pasos que abren el menú de cuenta verifican primero que esté oculto en móvil y cambian al breakpoint desktop. La landing usa los textos actuales y mantiene los casos de teclado y swipe del carrusel.

## Permisos y diagnóstico

El workflow usa `contents: read`, checkout sin credenciales persistentes y acciones fijadas por SHA. No utiliza `pull_request_target`, credenciales Azure, claves de correo ni secretos productivos. Los datos de prueba se generan dentro del entorno descartable.

Ante un fallo, revisar primero el job y el paso indicado en GitHub Actions. Los reportes textuales de pruebas se conservan siete días. No se publican bases, archivos de entorno, buzones de prueba, trazas de autenticación, videos ni capturas. Las capturas explícitas que algunas pruebas escriben en `.runtime/` permanecen locales al runner y no se suben como artefactos.

Un error de migración debe corregirse conservando las migraciones históricas. Un timeout de servidor requiere revisar arranque, puerto y variables; no aumentar tiempos o relajar expectativas sin identificar la causa. Una instalación fallida por lockfile requiere sincronizarlo con los manifiestos.

## Protección de ramas y aceptación remota

El archivo YAML ejecuta verificaciones; el bloqueo de merges requiere configuración adicional en GitHub. Después de publicar la rama mediante el flujo autorizado y registrar una ejecución real, configurar para **ambas** ramas `dev` y `main`:

- PR obligatorio, con cero aprobaciones exigidas inicialmente.
- Check obligatorio `ci-required`, emitido por GitHub Actions, con rama actualizada antes de integrar.
- Restricciones aplicadas también a administradores, sin bypass.
- Force push y eliminación de ramas bloqueados.

Comprobar que una regresión deliberada en un PR de prueba hace fallar CI y bloquea el merge; corregirla y verificar que la misma revisión queda habilitada. Comprobar también el rechazo de jobs omitidos y la cancelación de una ejecución anterior al agregar commits. No integrar el fallo deliberado en `dev` ni en `main`.

La protección remota y la primera ejecución real quedan pendientes hasta que el workflow se publique y se pruebe en GitHub. Mantener FND-07 y FND-08 pendientes mientras falte esa evidencia; no declarar concluida la integración únicamente por haber creado el YAML. No se crean commits, se publica la rama, se abre un PR ni se hace merge automáticamente.

El repositorio canónico es `BrionesBenjamin22/faltagente`. Si `origin` todavía usa el nombre anterior, coordinar su actualización por separado; esta implementación no modifica remotos automáticamente.

## Despliegue

Azure es el destino acordado para el despliegue. La elección de servicios, recursos, identidad, registro de imágenes, dominios y mecanismo de CD corresponde a la siguiente etapa. Esta CI construye imágenes sin publicarlas y no despliega aplicaciones. Las migraciones productivas siguen siendo un paso controlado independiente; los seeds ficticios son exclusivos de desarrollo y pruebas.

## Evidencia local del 7 de noviembre de 2026

Validación final aprobada: lint, typecheck, 168 unitarios (54 API y 114 web), 18 tests del gate, 42 integraciones PostgreSQL/PostGIS, 17 E2E Chromium (10 harness y 7 públicos), builds Nest/Next y construcción de ambas imágenes Docker finales. Los 16 casos nuevos del guard están incluidos en los 54 unitarios API. Ambos archivos YAML se parsearon correctamente y `git diff --check` aprobó.

Se aplicaron las cuatro migraciones desde cero y el seed de desarrollo explícito sobre `falta_gente_test`. El navegador usó los puertos 3100/3101 para no interferir con el stack habitual; el frontend se compiló con esa URL de API. El ejecutor rechazó correctamente puertos ocupados y, tras la ejecución final, ambos puertos quedaron libres.

La primera validación concurrente tuvo un timeout unitario y errores de integración durante la recuperación de PostgreSQL. Se detuvieron los builds concurrentes y las suites completas se repitieron exitosamente sin aumentar timeouts ni alterar aserciones de dominio. Los E2E desactualizados se alinearon con UI-02 y los textos vigentes; no se modificaron componentes de producción. La revisión estática independiente de seguridad no encontró bloqueos.

Host de validación: Windows, Node 22.22.3 y pnpm 10.33.2; imágenes Linux con la versión Node ya definida por los Dockerfiles. La ejecución Ubuntu de GitHub y las protecciones remotas todavía requieren el PR autorizado. No se crearon commits ni se publicaron ramas.

Por pedido del usuario, al finalizar se detuvo todo el stack mediante `docker compose -f docker-compose.yml -f docker-compose.dev.yml stop` y se retiró la base descartable. La comprobación final no encontró contenedores, procesos de Falta Gente, builds CI ni Playwright activos. El volumen `falta-gente_postgres` se conservó.
