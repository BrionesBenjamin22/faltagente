# Revocación ante renovación concurrente

El usuario autorizó corregir la carrera preexistente de refresh y ejecutar los commits después de validar la corrección.

## Problema y corrección

Dos solicitudes podían usar el mismo refresh. Si una consultaba el registro de reutilización antes del commit de la otra y luego buscaba la sesión por el hash anterior, no encontraba ninguno de los dos y omitía revocar la sesión rotada.

`AuthService.refresh` consulta primero Session por el hash actual. Si falta, consulta UsedRefreshToken y revoca la sesión asociada. Con aislamiento ReadCommitted, una rotación ya confirmada queda visible para esta segunda consulta. Si obtiene una sesión que otra solicitud rota después, el compare-and-set existente falla y revoca esa sesión. La revocación permanece dentro de la transacción y nunca se borra `revokedAt`.

El contrato de `POST /api/v1/auth/refresh` no cambia. La reutilización devuelve 401, limpia cookies y revoca únicamente la sesión asociada al token; otras sesiones independientes permanecen válidas. Se conservan expiración, cookies Secure/HttpOnly, CSRF, Origin, CORS y rate limiting. No hay migraciones, dependencias ni cambios de UI.

## Regresión

`refresh-concurrency.e2e-spec.ts` ejecuta HTTP y PostgreSQL reales. Una barrera suspende la primera transacción después de su primera lectura mientras otra renovación confirma su commit. Luego verifica 401, ambas copias de la sesión revocadas y otra sesión independiente todavía válida. El test no sustituye resultados ni escrituras de la base.

La validación final y el estado de preparación local se registran junto a [AUDIT-01](AUDIT-01.md).

La misma regresión falla con el código original porque la sesión rotada sigue autenticada. Con la corrección aprobaron la regresión y la suite vertical completa: trece pruebas. La revisión independiente de seguridad no encontró bloqueos.
