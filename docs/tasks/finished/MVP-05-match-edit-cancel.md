---
id: MVP-05
title: Edición y cancelación de partidos
status: finished
phase: mvp
depends_on: [MVP-04, REF-01]
created_at: 2026-11-19
resolved_at: 2026-11-20
---

## Alcance aprobado

Editar y cancelar partidos futuros propios, con validación parcial, control de versión,
auditoría e historial privado. Mantener el diseño existente y los controles de sesión,
CSRF y Origin. No implementar reservas, espera ni notificaciones de negocio.

## Rama y prerrequisitos

`feature/edicion-cancelacion-partidos` se creó desde `dev` (`a2fc995`). Se incorporó
por avance rápido `feature/refactor-estructural` (`a562551`), que contiene publicación
y organización modular requeridas por el plan. No se creó un commit de merge.
El usuario confirmó conservar esta base; primero se integrará la refactorización
en desarrollo y luego esta feature. `origin/dev` contiene además cambios de CI
que no se incorporan como parte de MVP-05.

## Criterios de aceptación

- PATCH privado con `expectedVersion` y diferencias reales; sin cambios no genera escrituras.
- Participantes confirmados restringen campos críticos; capacidad preserva ocupación.
- Fecha local del organizador consistente con la restricción diaria.
- Cancelación idempotente antes del inicio; con jugadores o cupos ocupados devuelve el bloqueo temporal documentado.
- Motivo privado, participación del organizador desactivada y evento único con diferencias.
- Formulario separado de edición, confirmación inline, conflictos recuperables y feedback visible.
- Historial de tres eventos, homes de nueve, invalidación de cachés por identidad.
- Integración PostgreSQL y concurrencia, pruebas frontend y navegador; revisión independiente de seguridad.
- Migraciones locales aplicadas, Docker saludable, lint, typecheck, tests y build.

## Validación

- Backend: 42 unitarios aprobados; frontend: 153 aprobados por grupos seriales,
  incluidos dos casos nuevos de carga asincrónica de catálogos activos/inactivos.
- Integración PostgreSQL: 56 casos verificados entre la suite completa y la
  repetición dirigida de migración histórica. Su timeout global se amplió de
  90 a 180 segundos por el proceso Prisma adicional; aprobó en 41 segundos.
- Revisión independiente de seguridad aprobada: [reporte](../MVP-05-security-review.md).
- Migración aditiva aplicada en `falta-gente` y `falta-gente-test`; seis migraciones
  y ninguna pendiente en ambas bases. No se cargaron datos ficticios en desarrollo.
- Builds locales API/Next.js e imágenes Docker aprobados. Contenedores locales
  actualizados con healthchecks.
- Navegador final: seis recorridos de publicación/edición/cancelación aprobados
  en 48,5 segundos, incluidos valores iniciales de los selectores y ausencia de
  requests sin cambios; cuatro regresiones de acceso/descubrimiento aprobadas en
  24,8 segundos. API real y PostgreSQL aislado; sólo el transporte de email del
  harness se sustituye. Ningún fixture se ejecutó contra la base habitual.
  Dos regresiones de descubrimiento requirieron actualizar exclusivamente los
  fixtures de desarrollo de la base aislada, cuyas fechas ya estaban vencidas.
- La inspección visual detectó selectores desincronizados al cargar el catálogo.
  Se corrigieron con valores controlados por React Hook Form, manteniendo el
  borrador. Las pruebas y capturas finales confirman Fútbol y Tolosa seleccionados,
  feedback sin cambios limpio al editar, ausencia de overflow móvil/escritorio y
  foco en confirmación/desistimiento. Artefactos en `.runtime/`, ignorado por Git.
- Lint, typecheck, builds locales API/Next.js y Docker aprobados; `git diff --check`
  limpio. Web final activada y los tres contenedores saludables. La comprobación
  desde el contenedor API confirma esquema al día. Servidor temporal de navegador
  detenido al terminar.

El usuario autorizó crear los commits de la etapa después de completar la validación.
El push requiere una solicitud específica.

## Límites de la entrega

La cancelación con jugadores activos o cupos ocupados devuelve el bloqueo temporal
aprobado hasta integrar reservas. No se incorporan reservas, espera, notificaciones
de negocio ni cambios globales de UI/auth. Se conserva la base de rama por decisión
explícita del usuario; la integración a desarrollo requiere primero los prerrequisitos
de publicación y refactorización. No se ejecutaron migraciones en producción.

## Commits de la etapa

- Backend: `feat(matches): agregar edición y cancelación transaccional en API`.
- Frontend: `feat(matches): incorporar edición y cancelación en frontend`.
- Cierre: `docs(matches): registrar validación y cierre de MVP-05`.

Los cambios se separaron por responsabilidad, incluyendo pruebas y contrato en
cada implementación y la evidencia transversal en el cierre. No se realizó push.

## Integración posterior con desarrollo

Se incorporó `origin/dev` (`b0f5f15`) en la feature para resolver los conflictos de
la PR. La prueba de migración conserva el timeout de 180 segundos y las
comprobaciones de capacidad/cancelación, junto con el helper de aislamiento de CI.
La documentación conserva las secciones de MVP-05 e integración continua.

El contrato vigente de pruebas de desarrollo usa `falta_gente_test`; el nombre
`falta-gente-test` de la evidencia anterior es histórico. La prueba de mutaciones
también utiliza el helper compartido, que valida protocolo PostgreSQL, loopback y
nombre de base antes de cualquier fixture. Se creó una base de pruebas separada
y se aplicaron las seis migraciones; no se renombraron ni borraron bases existentes.

Validación de la resolución: lint, typecheck, 18 casos del gate de CI, 60 unitarios
de API, 153 de frontend por grupos y 56 integraciones PostgreSQL aprobados.
La revisión independiente de los
conflictos confirmó que no se eliminaron verificaciones ni se relajó el aislamiento
de datos. No hay cambios en el código de aplicación respecto del build ya validado.

## Corrección del harness de navegador

La ejecución [CI 44783205349, job browser](https://github.com/BrionesBenjamin22/faltagente/actions/runs/44783205349/job/136451807152)
aprobó 15 casos y falló en el login del caso de edición con sesión revocada:
`POST /auth/login` devolvió 429. El harness compartía una aplicación Nest por
worker, acumulando los logins de casos independientes dentro del límite de
10 intentos por minuto. En CI las pruebas alcanzaron ese límite antes de terminar.

El fixture ahora inicia y cierra una aplicación real por caso, con buzón y
contadores independientes. Conserva guardas, límites, cookies y CSRF reales;
el modo de API externa conserva su ciclo de vida. El cierre se ejecuta también
ante errores de configuración o arranque mediante `try/finally`.

Se agregaron dos regresiones: el undécimo login del mismo caso debe responder
429 y el primer login del caso siguiente debe responder 401 por credenciales
inválidas, sin heredar el bloqueo previo. Ambas aprobaron. La revisión
independiente de seguridad aceptó el aislamiento; los builds API/Next.js, lint,
typecheck y las 18 pruebas del gate de CI también aprobaron.

La ejecución local completa de `pnpm test:e2e:ci`, contra `falta_gente_test` y
puertos 3002/3003, aprobó 18 casos del harness y siete públicos, con código de
salida 0 y cierre de servidores. La primera pasada también aprobó los 25 casos,
pero Windows rechazó el cierre con `taskkill` dentro del sandbox; la repetición
con permisos de cierre confirmó el ciclo completo. La corrección permanece
local, sin commit ni push; el resultado remoto requiere una ejecución posterior
con estos cambios publicados.
