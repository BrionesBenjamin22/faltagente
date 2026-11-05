# Operación Compose de desarrollo

## Decisión solicitada

El usuario opera con comandos completos `docker compose -f docker-compose.yml -f docker-compose.dev.yml ...`, sin alias ni selección manual de proyecto. El archivo base fija `name: falta-gente` y el volumen lógico `postgres` produce `falta-gente_postgres`.

Al finalizar cada etapa, el agente aplica las migraciones y seeds de desarrollo correspondientes y verifica los flujos antes de entregar. No se ejecutan automáticamente al iniciar o reconstruir contenedores. Producción conserva sus pasos controlados. La regla quedó registrada en AGENTS.md, IMPLEMENTATION.md, README.md y docs/DOCKER.md.

## Regeneración autorizada

Se comprobó la pertenencia del contenedor `furvo-db-1` y el volumen `furvo_hyt-postgres` al stack heredado. Con autorización expresa del usuario se detuvo/eliminó ese contenedor, se eliminó el volumen y se retiró la red `furvo_default`. No se limpiaron recursos globales ni recursos de otros proyectos.

Se creó `falta-gente-db-1`, saludable, con volumen `falta-gente_postgres`. Los archivos de entorno locales ignorados se sincronizaron, preservando los secretos existentes: base/usuario `hyt`, puerto host 55433 y URL de contenedor por hostname `db`. Los nombres de cookies, JWT y claves persistidas de seed permanecen intactos.

La base nueva recibió las cuatro migraciones existentes y el seed explícito `--development`, que completó correctamente. La base aislada de pruebas del volumen antiguo también se eliminó con el volumen; cualquier integración futura debe recrear su base de pruebas separada.

## Comunicación Next.js/API

Compose configura `API_INTERNAL_URL=http://api:3001/api/v1` en el servidor web. El cliente HTTP usa esa URL sólo en servidor; el navegador conserva `NEXT_PUBLIC_API_URL`. Esto permite la consulta inicial y el HTTP 404 real del detalle dentro de contenedores sin cambiar autenticación, cookies ni CORS.

## Validaciones

- Compose base y base + override de desarrollo: `config --quiet` aprobado.
- Lint y typecheck globales: aprobados.
- Frontend: 89/89 tests aprobados, incluidos los siete del cliente HTTP (se conservan los dos originales).
- Migraciones: cuatro aplicadas y comprobadas mediante consulta SQL.
- Seed de desarrollo: completado.
- Reconstrucción final Docker: ambas imágenes aprobadas. El primer intento falló en web después de compilar JavaScript; la reconstrucción con caché y el estado final del código completó TypeScript, generación de páginas e imágenes sin cambios adicionales en la configuración de build. La causa del primer fallo no quedó identificada; el log de la ejecución final se conserva localmente en `.runtime/compose-build.log`.
- Herramientas dentro de la imagen API: `migrate deploy` confirmó ausencia de pendientes; el seed compilado `--development` completó correctamente al repetirlo.
- Stack completo: db, api y web saludables. Comprobaciones HTTP reales sin navegador: health 200, catálogo con cuatro deportes, dos partidos futuros de demostración en Tolosa, detalle API público correcto, detalle renderizado desde el servidor mediante API interna, detalle inexistente HTTP 404 e identificador API inválido HTTP 400.
- Se ejecutó `down` sin `-v` y posterior `up -d --wait` para verificar conservación de volumen y datos preparados.

No se realizaron capturas, pruebas visuales ni commits. Mensaje de commit sugerido: `chore(docker): simplificar operación y regenerar entorno de desarrollo`.
