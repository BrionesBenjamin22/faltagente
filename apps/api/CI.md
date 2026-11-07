# Validación continua del backend

El workflow compartido valida lint, tipos, unitarios, build Nest y construcción de la imagen Docker final. La integración ejecuta NestJS y Prisma contra PostgreSQL/PostGIS real y descartable, después de aplicar todas las migraciones desde una base vacía.

La base y el usuario de pruebas se llaman `falta_gente_test`. Las protecciones rechazan hosts remotos y otros nombres para evitar mutaciones sobre desarrollo o producción. No se alteran endpoints, payloads, reglas de dominio, sesiones ni permisos de la API.

Los tests de navegador utilizan la API compilada: el harness sustituye únicamente email durante sus suites; las suites públicas posteriores usan una API iniciada por el orquestador. Los seeds ficticios se ejecutan explícitamente sólo en la base aislada del job de navegador. Ningún paso de CI ejecuta migraciones productivas ni publica imágenes.

Consultar [CI](../../docs/CI.md) para jobs, variables, diagnóstico y aceptación remota; consultar [tests](../../tests/README.md) para ejecución local y cobertura.
