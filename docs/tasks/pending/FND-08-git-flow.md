---
id: FND-08
title: Flujo Git y protección de integración
status: pending
phase: foundation
depends_on:
  - FND-07
created_at: 2026-09-11T04:24:37-03:00
updated_at: 2026-09-11T04:24:37-03:00
started_at: null
resolved_at: null
resolution_commit: null
---

# FND-08 — Flujo Git y protección de integración

## Objetivo

Dejar preparado el flujo de trabajo definido para el proyecto.

## Dependencias

- `FND-07`.

## Estrategia

```text
feature/*
    ↓
PR
    ↓
dev
    ↓
validación
    ↓
PR
    ↓
main
    ↓
producción
```

## Tareas

- documentar flujo de ramas;
- verificar los nombres `dev` y `main`, ya renombrados por el usuario;
- tratar `main` como producción estable;
- utilizar `dev` como rama de integración;
- establecer PR obligatorio;
- requerir `ci-required` exitoso y rama actualizada antes del merge, con restricciones también para administradores;
- bloquear force push y eliminación en `dev` y `main`; no exigir aprobaciones adicionales inicialmente.

No realizar desarrollo directo sobre `main`.

## Criterios de aceptación

- flujo queda documentado;
- agentes pueden identificar claramente rama destino;
- las reglas coinciden con `AGENTS.md`.

## Estado de implementación

El flujo acordado es `feature/* → dev → main`; la rama actual de esta entrega es `feature/ci-github-actions`. El usuario realizó el renombrado. La guía [CI](../../CI.md) documenta las reglas de protección y su verificación.

La tarea permanece pendiente mientras no se comprueben el check real en un PR y las protecciones de ambas ramas en GitHub. Registrar primero una ejecución de `ci-required`, luego seleccionarlo como obligatorio. La configuración del workflow no equivale a configurar la protección remota. No modificar remotos, crear commits, publicar ramas ni hacer merges automáticamente.

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
