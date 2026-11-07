# Validación continua del frontend

La CI compartida ejecuta lint, tipos, unitarios, build Next.js, todas las suites Chromium existentes y construcción de la imagen Docker final. No modifica rutas, componentes, hooks, validaciones de usuario ni contratos de la API.

El build de navegador fija `NEXT_PUBLIC_API_URL=http://localhost:3001/api/v1`. Las pruebas usan el frontend compilado en `http://localhost:3000` y una API real con base `falta_gente_test` aislada. No requieren credenciales de Azure ni envío real de correo.

Las suites con harness y las suites públicas se ejecutan en grupos separados para respetar el ciclo de vida de la API. Los reportes textuales se conservan siete días; capturas, trazas, videos y datos de autenticación no se publican como artefactos.

Consultar [CI](../../../docs/CI.md) para preparación, variables, controles y protección de ramas; consultar [tests](../../../tests/README.md) para escenarios cubiertos.
