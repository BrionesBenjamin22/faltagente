# MVP-03 — Revisión de seguridad del detalle de partido

Estado: pass. Sin bloqueos de seguridad en el alcance revisado.

## Superficies y evidencia

- `apps/api/src/matches/matches.module.ts`: `GET /api/v1/matches/:id`, `MatchIdDto`, consulta `MatchesService.detail` y proyección pública compartida.
- `apps/api/src/matches/match-detail-response.dto.ts`: contrato específico del detalle.
- `apps/web/src/app/partidos/[id]/page.tsx` y feature matches: carga pública, caché por ID, errores, navegación y renderizado de datos remotos.
- `apps/api/test/matches-detail.e2e-spec.ts` y tests de detalle/ruta frontend: cobertura de privacidad, validación, estados y texto remoto.

Se leyó `docs/agent/SECURITY.md` completo y las reglas pertinentes de `PRODUCT.md` y `TECHNICAL.md`. La revisión comprende código y tests; la ejecución de suites y verificaciones generales corresponde a la validación independiente del equipo.

## Hallazgos

No se encontraron hallazgos critical, high o incumplimientos explícitos de SECURITY.md. Sin hallazgos pendientes medium o low.

Una observación informativa sobre disponibilidad en partidos cerrados/cancelados se resolvió durante la revisión: la pantalla muestra el estado y «Lugares informados», sin presentar esos cupos como disponibles para reservar.

## Controles verificados

- El organizador se selecciona con `select: { id: true, name: true }`. No se consulta ni serializa email, hash, sesión, tokens, historial o localidad privada del perfil. Las relaciones deportivas y la localidad tienen proyecciones explícitas.
- El test API compara exactamente toda la respuesta y las claves del organizador, usando un fixture con email, hash, localidad principal y verificación privados; comprueba ausencia de email y hash en JSON. Esto detecta exposición accidental de campos adicionales.
- El ID pasa por `@IsUUID()` y el ValidationPipe global antes de consultarse mediante `findUnique({ where: { id } })`. No se construye SQL a partir del ID. El frontend codifica el segmento API mediante `encodeURIComponent`.
- Un UUID desconocido produce 404; un ID inválido produce 400. El filtro HTTP existente entrega `{ code, message, requestId }` y oculta detalles internos de errores inesperados. Hay tests API para ambos escenarios.
- El detalle es público por requisito del producto: visitar un ID ajeno no proporciona acceso a un recurso privado. La respuesta mínima es idéntica para visitantes y usuarios con sesión; no deriva autorización de un userId suministrado por el cliente.
- OPEN, CLOSED y CANCELLED son legibles por URL estable según el pedido explícito. Se preserva el estado persistido, incluso para partidos pasados; el listado mantiene su exclusión de cancelados. No se exponen motivos privados de cancelación ni participantes.
- Descripción, organizador, deporte y lugar se interpolan como texto JSX. No se utiliza HTML remoto; el test frontend verifica que una descripción con etiqueta script y un nombre con etiqueta b se renderizan como texto.
- La query key `matches/detail/id` almacena únicamente datos públicos. La carga del servidor reutiliza el mismo contrato público y no reenvía cookies de sesión. No se agregan mutaciones ni operaciones que requieran transacciones o idempotencia.

## Auth, sesión, CSRF y CORS

Sin cambios en autenticación, cookies, sesiones, CSRF o CORS. El endpoint es GET de solo lectura y conserva middlewares HTTP, Helmet y rate limiting globales. No se agregan tokens en almacenamiento del navegador.

## Logs y secretos

No se agregan logs de bodies, datos personales, credenciales ni nuevas variables secretas. El logger y tratamiento global de errores existentes permanecen intactos.

## Tests y recomendación

Ejecutar los tests API nuevos contra PostgreSQL local aislado y los tests frontend de detalle, ruta y tarjeta. La revisión comprobó que incluyen contrato público exacto, formato nullable, disponibilidad cero, estados cerrados/cancelados, UUID inválidos, 404 y renderizado seguro. No se requieren pruebas visuales ni capturas para esta revisión.

Recomendación al Orchestrator: aceptar el alcance de seguridad, sujeto a completar las verificaciones funcionales del módulo. No hay riesgos nuevos que requieran aceptación del usuario ni bloqueos de seguridad abiertos.
