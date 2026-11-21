---
id: FND-07
title: CI con GitHub Actions
status: pending
phase: foundation
depends_on:
  - FND-06
created_at: 2026-09-11T04:24:37-03:00
updated_at: 2026-09-11T04:24:37-03:00
started_at: null
resolved_at: null
resolution_commit: null
---

# FND-07 — CI con GitHub Actions

## Objetivo

Evitar integrar código que no haya sido validado.

## Dependencias

- `FND-06`.

## Tareas

Crear pipeline para PRs hacia `dev` y `main`.

Debe ejecutar como mínimo:

```text
install
lint
typecheck
tests
build
```

Ejecutar todas las suites existentes de integración PostgreSQL/PostGIS y navegador Chromium. Construir ambas imágenes Docker sin publicarlas. Usar bases descartables `falta_gente_test`; no conectar las suites a las bases habituales.

Utilizar caché de dependencias cuando sea apropiado, sin agregar complejidad innecesaria.

## Criterios de aceptación

- CI se ejecuta automáticamente en PR;
- cualquier validación fallida bloquea el pipeline;
- frontend y backend son validados;
- workflow no utiliza secretos hardcodeados.

## Implementación y aceptación pendiente

La implementación se realiza en `feature/ci-github-actions`, con PR hacia `dev`. El workflow `ci.yml` define `quality`, `integration`, `browser`, `docker` y el check agregado `ci-required`; los disparadores también cubren push a `dev`/`main` y ejecución manual. Ver [CI](../../CI.md).

El estado permanece pendiente hasta registrar una ejecución real exitosa en GitHub y probar un fallo deliberado y su corrección en un PR, sin integrar esa regresión. Verificar que un job omitido no apruebe el gate y que nuevos commits cancelen la ejecución previa del PR. Los resultados locales deben reportarse separadamente; no sustituyen la aceptación remota.

---

## Reglas de ejecución

Antes de modificar código:

1. leer `AGENTS.md`;
2. leer `docs/agent/TECHNICAL.md`;
3. leer `docs/agent/SECURITY.md`;
4. revisar la implementación existente;
5. verificar que las dependencias de esta tarea estén cumplidas.

No introducir reglas de negocio, entidades, servicios externos o patrones arquitectónicos no definidos sin aprobación.

## Validación y commit

Antes de realizar un commit:

```text
implementar
→ agregar/actualizar tests
→ lint
→ typecheck
→ tests
→ build cuando corresponda
→ revisar git status
→ revisar git diff
→ commit-work
→ commit
```

Si alguna validación falla:

```text
NO COMMIT
```

Corregir primero y volver a ejecutar las verificaciones.

Si la tarea no requiere tests nuevos, justificarlo explícitamente en el reporte final.
