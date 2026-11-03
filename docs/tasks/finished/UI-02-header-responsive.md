---
id: UI-02
title: Header responsive y selector de tema visible
status: finished
phase: ui
depends_on: []
created_at: null
updated_at: 2026-11-03T18:59:12-03:00
started_at: null
resolved_at: 2026-11-03T18:59:12-03:00
resolution_commit: null
---
# UI-02 — Header responsive y selector de tema visible

## Contexto

Falta Gente ya posee:

- navegación superior;
- acceso a Partidos;
- menú de cuenta/perfil;
- configuración de apariencia;
- modos claro, oscuro y sistema.

Actualmente el header funciona correctamente en desktop, pero en mobile la distribución no es adecuada.

En viewport reducido aparecen simultáneamente:

```text
Falta Gente Beta
Partidos
Benjamín / Cuenta
```

y los elementos terminan ocupando demasiado espacio vertical o quedando distribuidos de forma poco clara.

Además, el cambio de tema existe únicamente dentro de:

```text
Cuenta
→ Apariencia
```

pero se desea que sea una acción global accesible directamente desde el header.

El objetivo de esta tarea es ajustar únicamente:

```text
header responsive
+
theme quick toggle
```

No rediseñar navegación completa.

---

# Estado actual

## Desktop

El header contiene conceptualmente:

```text
Falta Gente Beta

Partidos

Benjamín / Cuenta
```

La estructura actual resulta aceptable para desktop.

No es necesario rediseñarla completamente.

---

## Mobile

Actualmente los mismos elementos del desktop se comprimen o reorganizan en un espacio reducido.

Esto produce una jerarquía incorrecta.

El usuario termina viendo algo similar a:

```text
Falta Gente Beta

Partidos        Benjamín
```

o una distribución equivalente.

Este comportamiento debe eliminarse.

---

# Estado deseado

## Desktop

Mantener una estructura equivalente a:

```text
┌──────────────────────────────────────────────┐
│ Falta Gente Beta      Partidos    ☾   Benjamín │
└──────────────────────────────────────────────┘
```

El orden exacto puede ajustarse a los componentes existentes.

Debe mantenerse:

- marca;
- navegación actual;
- acceso a cuenta;
- nuevo acceso rápido a tema.

No incorporar todavía navegación adicional.

---

## Mobile

El header debe simplificarse a:

```text
┌───────────────────────────────┐
│ Falta Gente  Beta         ☾   │
└───────────────────────────────┘
```

En mobile deben ocultarse del header:

```text
Partidos
Benjamín
menú de cuenta
```

No deben apilarse debajo de la marca.

No deben ocupar una segunda fila.

El header mobile debe ser compacto y de una sola línea cuando el viewport lo permita.

---

# 1. Marca

Mantener:

```text
Falta Gente
```

y badge:

```text
Beta
```

La marca debe quedar alineada correctamente en desktop y mobile.

En mobile:

- evitar wraps entre `Falta Gente` y `Beta` cuando haya espacio suficiente;
- evitar tamaños desproporcionados;
- mantener legibilidad.

No rediseñar logo ni branding.

---

# 2. Selector rápido de tema

Agregar un control global visible en el header.

Debe representar el modo actual mediante iconografía.

Estados:

```text
light
→ icono de sol

dark
→ icono de luna

system
→ icono de sistema / monitor / equivalente
```

Preferir iconos de la librería ya utilizada por el proyecto, por ejemplo Lucide si está disponible.

No agregar una nueva dependencia sólo para estos iconos.

---

# 3. Comportamiento del selector

El control debe permitir cambiar entre:

```text
light
dark
system
```

Reutilizar la lógica existente de apariencia.

NO crear un segundo sistema de estado de tema.

La fuente de verdad debe seguir siendo la misma que utiliza:

```text
Cuenta
→ Apariencia
```

Cambiar el tema desde el header debe actualizar también lo que se muestra posteriormente en Apariencia.

Cambiarlo desde Apariencia debe reflejarse inmediatamente en el icono del header.

---

# 4. Interacción

Preferencia de interacción:

```text
click / tap
→ abrir pequeño menú
```

con:

```text
Claro
Oscuro
Sistema
```

Ejemplo conceptual:

```text
☾

┌──────────────┐
│ ☀ Claro      │
│ ☾ Oscuro     │
│ ◐ Sistema    │
└──────────────┘
```

Esto es preferible a hacer cycle automático entre tres estados porque:

- el comportamiento es explícito;
- el usuario sabe qué está seleccionando;
- evita tener que hacer varios taps para llegar al modo deseado.

Si el proyecto ya posee un patrón Radix/shadcn apropiado, reutilizarlo.

---

# 5. Accesibilidad del control

El botón debe tener:

- `aria-label` descriptivo;
- estado accesible;
- navegación por teclado;
- foco visible;
- touch target adecuado.

Ejemplo conceptual:

```text
aria-label="Cambiar tema"
```

Las opciones deben poder seleccionarse sin mouse.

No depender únicamente del icono para transmitir el estado dentro del menú.

---

# 6. Desktop navigation

Mantener el comportamiento actual de:

```text
Partidos
Cuenta
```

No agregar:

- Historial;
- Mis partidos;
- bottom navigation;
- nuevas rutas.

Esta tarea no define navegación definitiva.

---

# 7. Mobile navigation

En mobile:

ocultar del header:

```text
Partidos
Cuenta / Benjamín
```

No sustituir todavía esos elementos por bottom navigation.

La bottom navigation se implementará cuando sus destinos funcionales estén definidos.

Por ahora, esta task sólo debe evitar que la navegación desktop se comprima incorrectamente.

---

# 8. No crear menú hamburguesa

NO introducir:

```text
hamburger menu
drawer
sidebar mobile
```

en esta etapa.

La navegación mobile definitiva todavía no está cerrada.

Mantener el ajuste mínimo.

---

# 9. Responsive behavior

Revisar el breakpoint actual del header.

No hardcodear comportamiento exclusivamente para un modelo de teléfono.

El header debe funcionar correctamente en:

```text
mobile pequeño
mobile grande
tablet
desktop
```

Preferir breakpoints ya utilizados en Tailwind/proyecto.

No agregar media queries aisladas si puede resolverse con las convenciones existentes.

---

# 10. Altura y spacing

El header mobile debe ocupar el menor espacio razonable.

Objetivo:

```text
marca + tema
```

en una sola fila.

Evitar:

- paddings verticales excesivos;
- segunda línea;
- elementos centrados de forma inconsistente;
- espacios vacíos generados por elementos ocultos.

---

# 11. Sticky behavior

Si el header actualmente es sticky, conservarlo.

No cambiar esta decisión salvo que exista un bug concreto.

El selector de tema debe funcionar correctamente dentro de un header sticky.

---

# 12. Cuenta > Apariencia

NO eliminar la sección:

```text
Cuenta
→ Apariencia
```

Puede seguir existiendo como configuración explícita.

El cambio consiste en agregar un acceso rápido.

No duplicar lógica.

---

# 13. Estado persistido

Mantener el mecanismo actual de persistencia del tema.

No cambiar:

- storage;
- hydration;
- detección de sistema;

salvo que exista un problema directamente relacionado con el nuevo control.

No ampliar el alcance hacia refactorizaciones de appearance provider.

---

# 14. Evitar flash de tema

Verificar que agregar el control no introduzca un cambio visible incorrecto durante hydration.

No realizar un rediseño de SSR/theme si actualmente funciona correctamente.

Si existe un comportamiento de hidratación ya resuelto, reutilizarlo.

---

# 15. Testing

Aplicar testing proporcional.

Agregar o adaptar tests para verificar:

```text
modo actual
→ icono correcto
```

```text
seleccionar Claro
→ theme = light
```

```text
seleccionar Oscuro
→ theme = dark
```

```text
seleccionar Sistema
→ theme = system
```

También verificar la lógica responsive a nivel de clases/renderizado cuando sea razonable.

No ejecutar:

- screenshots;
- visual regression;
- image comparison;
- validación responsive mediante capturas.

No agregar Playwright/Cypress únicamente para comprobar disposición visual del header.

La validación visual mobile/desktop será realizada manualmente por el desarrollador.

---

# 16. Fuera de alcance

NO modificar en esta task:

- landing;
- carousel;
- MatchCard;
- filtros;
- detalle de partido;
- Perfil;
- Seguridad;
- feedback de sesión;
- mensajes toast;
- bottom navigation;
- Historial;
- Mis partidos;
- URLs;
- IDs;
- publicación;
- reservas.

No aprovechar el cambio para refactorizar el shell completo.

---

# Definition of Done

UI-02 está completa cuando:

- desktop conserva navegación existente;
- existe un selector de tema visible en el header;
- el icono representa correctamente claro/oscuro/sistema;
- el selector utiliza la lógica existente de Apariencia;
- header y sección Apariencia permanecen sincronizados;
- mobile muestra únicamente marca + Beta + selector de tema;
- `Partidos` no aparece en header mobile;
- `Benjamín/Cuenta` no aparece en header mobile;
- no existe segunda fila innecesaria;
- no se agregó hamburger menu;
- no se agregó bottom navigation;
- foco y teclado funcionan;
- touch target es adecuado;
- lint pasa;
- typecheck pasa;
- tests relevantes pasan;
- build pasa.

---

# Entregable

Reportar:

```text
TASK:
UI-02 — Header responsive y selector de tema visible

STATUS:
completed | blocked | failed

HEADER DESKTOP:
- brand:
- navigation:
- account:
- theme control:

HEADER MOBILE:
- visible:
- hidden:
- layout:

THEME:
- source of truth:
- menu:
- persistence:
- synchronization:

ACCESSIBILITY:
- keyboard:
- focus:
- aria:

VALIDATION:
- lint:
- typecheck:
- tests:
- build:

OUT OF SCOPE PRESERVED:
- landing:
- matches:
- account content:
- session feedback:
- bottom navigation:

BLOCKERS:
- none | ...
```

No comenzar UI-03 automáticamente.
## Resultado de implementación

TASK: UI-02 — Header responsive y selector de tema visible

STATUS: completed

HEADER DESKTOP:
- brand: Falta Gente y Beta conservados.
- navigation: Partidos con sesión; Ingresar y Crear cuenta sin sesión.
- account: menú existente conservado en desktop.
- theme control: acceso visible para visitantes y usuarios autenticados.

HEADER MOBILE:
- visible: marca, Beta y selector de tema.
- hidden: navegación y cuenta por debajo de 640 px.
- layout: una fila flex sin wrap, padding vertical de 8 px, control de 44 px; sin hamburguesa ni bottom navigation.

THEME:
- source of truth: useTheme existente; sin segundo store.
- menu: Radix Dropdown Menu, opciones radio Claro/sol, Oscuro/luna, Sistema/monitor.
- persistence: hyt-theme-v1, bootstrap y snapshot SSR existentes conservados.
- synchronization: tests verifican ambos sentidos con Apariencia, remount y evento storage.

ACCESSIBILITY:
- keyboard: apertura, flechas, selección con Enter, Escape y retorno de foco verificados.
- focus: conserva foco visible global; opciones con indicador de selección y texto.
- aria: botón anuncia el modo, Radix aporta expanded y menuitemradio/checked; iconos decorativos.

VALIDATION:
- lint: pnpm lint aprobado; lint web repetido después de agregar tests, aprobado.
- typecheck: pnpm typecheck aprobado; typecheck web repetido, aprobado.
- tests: backend 38/38; frontend 106/106 con pnpm --filter web test --maxWorkers=2; header/tema 14/14 incluidos.
- ejecución inicial concurrente: timeout de arranque backend y espera de catálogo frontend; las repeticiones indicadas pasaron sin modificar esos módulos ni sus tests.
- build: pnpm build aprobado; imagen web final compilada correctamente mediante Docker.
- revisión: git diff --check aprobado. Revisión React de estructura, hooks, accesibilidad y dependencias; sin dependencias nuevas.
- responsive: tests de integración de clase y revisión de cascada CSS. CSS Module sin capa evita que nav global prevalezca sobre hidden de Tailwind. La disposición visual mobile/desktop queda para revisión manual del desarrollador, como pide esta tarea; no se ejecutaron capturas ni comparación de imágenes.
- database: Prisma migrate status dentro de api confirma 4 migraciones y esquema actualizado. Sin cambios de esquema ni seeds necesarios.
- runtime: docker compose -f docker-compose.yml -f docker-compose.dev.yml build web y up -d --no-deps --force-recreate --wait web. Servicio web saludable; HTTP /, API /health y /api/v1/sports responden 200. HTML servido incluye selector de tema.

OUT OF SCOPE PRESERVED:
- landing: conservada.
- matches: conservados.
- account content: conservado.
- session feedback: conservado.
- bottom navigation: no agregada.
- layout global, router, auth, hooks compartidos y estilos base: sin cambios.

BLOCKERS:
- none.

Documentación: apps/web/FRONTEND.md. Backend sin cambios de contratos o comportamiento.
No se creó commit ni se inició UI-03. Mensaje sugerido: feat(header): adaptar navegación responsive y agregar selector de tema

Las fechas históricas de creación/inicio no estaban registradas; permanecen en null. resolution_commit permanece null porque no se solicitó ejecutar un commit.
