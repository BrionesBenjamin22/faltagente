# UI-03 — Sistema reutilizable de feedback efímero

## Contexto

Falta Gente actualmente muestra feedback visual después de ciertas acciones de sesión.

Ejemplo detectado:

```text
Sesión cerrada correctamente.
```

El problema actual es que este mensaje:

- permanece visible durante demasiado tiempo;
- sigue apareciendo después de navegar;
- puede continuar visible incluso al ingresar al formulario de login;
- genera ruido visual;
- transmite la sensación de que el estado sigue activo cuando en realidad la acción ya finalizó.

Además, en las próximas etapas del MVP aparecerán muchas acciones que necesitarán feedback equivalente:

- perfil actualizado;
- contraseña cambiada;
- partido publicado;
- partido editado;
- reserva creada;
- reserva cancelada;
- errores no críticos;
- warnings;
- información puntual.

Por lo tanto, esta tarea no debe limitarse a corregir únicamente el logout.

El objetivo es definir un sistema reutilizable de feedback efímero y utilizar el cierre de sesión como primera integración.

Esta tarea debe mantenerse acotada y no convertirse en un framework general de modales.

---

# Objetivo

Implementar una convención reutilizable de notificaciones tipo Toast para acciones informativas del sistema.

Debe permitir conceptualmente:

```text
notify.success(...)
notify.error(...)
notify.warning(...)
notify.info(...)
```

o una API equivalente consistente con la arquitectura actual.

La implementación concreta debe adaptarse al stack existente.

---

# Distinción de patrones

Desde esta task deben quedar separados tres conceptos.

## Toast / notification

Para información efímera que no requiere decisión.

Ejemplos:

```text
Sesión cerrada correctamente.
Perfil actualizado.
Partido publicado.
Reserva creada.
No pudimos completar la operación.
```

Características:

- no bloquea interacción;
- auto-dismiss;
- cierre manual;
- feedback temporal.

---

## Dialog / confirmation

Para acciones que requieren decisión explícita.

Ejemplos:

```text
¿Querés cancelar este partido?
¿Querés eliminar esta reserva?
Esta acción no se puede deshacer.
```

Características:

- requiere respuesta;
- no desaparece automáticamente;
- puede bloquear la acción hasta decidir.

NO implementar este sistema en esta task.

---

## Inline feedback

Para errores o información asociada directamente a campos/formularios.

Ejemplo:

```text
La contraseña debe tener al menos X caracteres.
```

Debe permanecer mientras siga existiendo el problema.

NO migrar este tipo de mensajes a Toast.

---

# 1. Inspección previa

Antes de modificar código, inspeccionar únicamente lo necesario para identificar:

- cómo se genera actualmente el mensaje de logout;
- dónde se almacena;
- si utiliza query params;
- router state;
- Context;
- store global;
- cookies;
- localStorage/sessionStorage;
- componentes actuales de toast/alert;
- dependencias existentes relacionadas con notifications;
- si existe Sonner, Radix Toast, shadcn toast o equivalente;
- patrón utilizado para mensajes de éxito/error.

No realizar una revisión general del sistema de autenticación.

---

# 2. Reutilizar infraestructura existente

Antes de desarrollar un sistema propio, verificar si el proyecto ya posee una solución adecuada.

Por ejemplo:

```text
Sonner
Radix Toast
shadcn/Sonner
componente propio
```

Si existe:

```text
reutilizar/adaptar
```

No introducir una nueva dependencia si no es necesaria.

---

# 3. API de aplicación

Aunque exista una librería externa, evitar que las features futuras dependan directamente de ella si puede resolverse con una abstracción pequeña.

Preferir una interfaz equivalente a:

```ts
notify.success("Partido publicado")

notify.error("No pudimos crear la reserva")

notify.warning("Quedan pocos lugares")

notify.info("Tu perfil está incompleto")
```

La API exacta puede adaptarse a las convenciones actuales del proyecto.

El objetivo es que las features utilicen una interfaz de aplicación estable.

No diseñar una abstracción excesivamente compleja.

---

# 4. Tipos de notificación

Soportar inicialmente:

```text
success
error
warning
info
```

Cada variante debe comunicar su estado mediante:

- icono;
- texto;
- tratamiento visual.

No depender exclusivamente del color.

Preferir iconografía existente en el proyecto.

Ejemplo conceptual:

```text
success  → check
error    → circle-x / alert
warning  → triangle-alert
info     → info
```

---

# 5. Anatomía del Toast

Cada Toast debe permitir conceptualmente:

```text
┌─────────────────────────────────────────┐
│ ✓  Sesión cerrada correctamente.     × │
│ ████████████████████                    │
└─────────────────────────────────────────┘
```

Debe incluir:

- icono de estado;
- mensaje;
- botón de cierre;
- indicador de tiempo restante.

No sobrecargarlo con información secundaria innecesaria.

---

# 6. Auto-dismiss

Las notificaciones deben desaparecer automáticamente.

Definir defaults centralizados.

Referencia sugerida:

```text
success → ~4 segundos
info    → ~4 segundos
warning → ~5 segundos
error   → ~6 segundos
```

No es obligatorio utilizar exactamente esos valores si la infraestructura actual ya posee defaults razonables.

Lo importante es evitar que cada feature futura defina duraciones arbitrarias.

Debe existir posibilidad de override cuando una situación concreta realmente lo requiera.

---

# 7. Barra de progreso

Agregar un indicador visual del tiempo restante.

Preferencia:

```text
barra comienza completa
→ se va vaciando
→ cuando llega a cero desaparece el Toast
```

Ejemplo conceptual:

```text
inicio
████████████████████

mitad
██████████----------

final
██------------------
```

La animación debe estar sincronizada razonablemente con el auto-dismiss.

No utilizar timers duplicados innecesariamente.

---

# 8. Cierre manual

Agregar botón:

```text
×
```

o icono equivalente.

Al presionarlo:

```text
Toast
→ desaparece inmediatamente
```

El botón debe:

- ser accesible;
- tener `aria-label`;
- tener focus visible;
- poseer touch target adecuado.

Ejemplo:

```text
aria-label="Cerrar notificación"
```

---

# 9. Pause on interaction

En desktop:

si el usuario mantiene hover sobre la notificación:

```text
pausar countdown
```

Si la notificación recibe foco mediante teclado:

```text
pausar countdown
```

Cuando termina hover/focus:

```text
continuar desde el tiempo restante
```

No reiniciar el timer completo salvo que la librería existente funcione así y modificarlo implique complejidad desproporcionada.

En mobile no existe requisito de hover.

---

# 10. Posición

## Desktop

Preferencia:

```text
top-right
```

La notificación no debe modificar el layout principal.

---

## Mobile

Preferencia:

```text
top-center
```

o una posición superior equivalente que respete:

- header;
- safe areas;
- margen horizontal.

No utilizar bottom-center como posición principal porque posteriormente Falta Gente tendrá navegación inferior mobile.

---

# 11. Stack de notificaciones

Si aparecen varias notificaciones consecutivas:

- permitir stack;
- mantener legibilidad;
- evitar ocupar una porción excesiva de pantalla.

Referencia inicial:

```text
máximo 3 visibles
```

Si la librería existente posee un comportamiento equivalente razonable, reutilizarlo.

No construir un sistema sofisticado de queues si no es necesario.

---

# 12. Duplicados

Evitar notificaciones duplicadas causadas por:

- rerenders;
- React Strict Mode;
- doble ejecución accidental;
- múltiples handlers del mismo evento.

Ejemplo a evitar:

```text
Sesión cerrada correctamente.
Sesión cerrada correctamente.
```

La estrategia de deduplicación debe ser simple.

No bloquear legítimamente dos eventos distintos sólo porque tengan textos similares.

---

# 13. Animaciones

Entrada:

```text
fade
+
pequeña traslación
```

Salida:

```text
fade
+
pequeña traslación
```

Mantener animaciones cortas y discretas.

No utilizar:

- rebotes;
- escalados exagerados;
- animaciones largas.

---

# 14. Reduced motion

Respetar:

```text
prefers-reduced-motion
```

En ese caso:

- eliminar o reducir desplazamientos;
- mantener funcionalidad;
- no comprometer auto-dismiss.

---

# 15. Accesibilidad

El sistema debe ser accesible.

Revisar:

- live regions;
- semántica `status` / `alert` según corresponda;
- navegación por teclado;
- foco visible;
- botón de cierre accesible;
- no depender sólo de color;
- no robar foco automáticamente.

Los errores importantes pueden requerir semántica distinta a mensajes de success/info.

Reutilizar comportamiento accesible de la librería existente si ya existe.

---

# 16. Primera integración: logout

Migrar:

```text
Sesión cerrada correctamente.
```

al nuevo sistema.

Flujo esperado:

```text
logout
→ revocación/cierre de sesión existente
→ redirect correspondiente
→ Toast success
→ auto-dismiss
```

El Toast debe aparecer una única vez.

---

# 17. Consumo único

Si el feedback de logout necesita transportarse a través de una redirección:

```text
set flash state
→ redirect
→ consume
→ clear
```

La fuente del evento debe consumirse inmediatamente.

El Toast puede continuar visible durante su duración normal.

---

# 18. Navegación posterior

Después de:

```text
logout
→ landing
```

si el usuario navega posteriormente:

```text
landing
→ login
```

el mensaje anterior no debe reconstruirse.

El Toast puede seguir unos segundos mientras permanezca montado el sistema global de notificaciones, pero el evento de logout ya debe haber sido consumido.

No debe aparecer nuevamente.

---

# 19. Refresh

Después de:

```text
logout
→ Toast
→ refresh
```

el mensaje no debe reaparecer.

No persistir eventos consumidos.

---

# 20. Query params

Si actualmente se utiliza algo equivalente a:

```text
/?logout=success
```

o:

```text
/login?message=logged-out
```

el parámetro debe eliminarse después de consumir el evento.

Utilizar:

```text
router.replace(...)
```

o el mecanismo equivalente actual cuando corresponda.

No dejar estado efímero permanentemente en URL.

---

# 21. Persistencia

NO guardar notificaciones transitorias en:

- localStorage;
- cookies persistentes;
- bases de datos;
- stores sin cleanup.

El feedback debe representar eventos efímeros.

---

# 22. Integraciones futuras

Esta task debe dejar preparada la infraestructura para que futuras features puedan hacer:

```text
perfil actualizado
→ success

contraseña cambiada
→ success

partido publicado
→ success

reserva creada
→ success

error no crítico
→ error

warning de negocio
→ warning
```

Pero NO migrar todavía todas esas features.

Sólo logout debe utilizarse como primera integración en esta task.

---

# 23. No convertir confirmaciones en Toast

No utilizar Toast para decisiones críticas.

Ejemplo incorrecto:

```text
Toast:
¿Seguro que querés cancelar el partido?
```

Estas acciones deben utilizar futuros Dialog/Confirmation.

No implementar ese patrón ahora.

---

# 24. No convertir errores de formulario en Toast

Ejemplo:

```text
Email inválido.
Contraseña demasiado corta.
```

debe continuar asociado al campo correspondiente.

No migrar validaciones inline.

---

# 25. Testing

Aplicar testing proporcional.

Cubrir lógica importante del sistema reutilizable.

Ejemplos:

```text
notify.success(...)
→ renderiza success
```

```text
notify.error(...)
→ renderiza error
```

```text
timeout
→ dismiss
```

```text
manual close
→ dismiss inmediato
```

```text
hover/focus
→ pause
```

cuando esa lógica sea propia y no esté completamente cubierta por una dependencia externa.

También cubrir logout:

```text
logout exitoso
→ dispara success
```

```text
evento consumido
→ no reaparece
```

```text
refresh posterior
→ no reaparece
```

No testear internals de una librería externa innecesariamente.

---

# 26. Browser / visual testing

No ejecutar:

- screenshots;
- visual regression;
- image comparison;
- inspección visual automatizada.

No agregar Playwright/Cypress únicamente para comprobar:

- posición;
- colores;
- barra de progreso;
- animación;
- responsive.

La validación visual será realizada manualmente por el desarrollador.

Playwright/Cypress queda reservado para flujos críticos que aporten valor real más adelante.

---

# 27. No modificar autenticación

No cambiar:

- access token;
- refresh token;
- cookies HttpOnly;
- CSRF;
- rotation;
- session revocation;
- refresh endpoint;
- password flows.

La semántica de logout actual debe preservarse.

El cambio está enfocado en feedback frontend.

---

# 28. Fuera de alcance

NO modificar:

- landing;
- carousel;
- header;
- selector de tema;
- Perfil;
- Seguridad;
- Apariencia;
- MatchCard;
- detalle de partido;
- filtros;
- bottom navigation;
- publicación;
- reservas;
- URL de partidos;
- IDs;
- confirmation dialogs.

No aprovechar esta tarea para crear un sistema completo de UI overlays.

---

# Definition of Done

UI-03 está completa cuando:

- existe un mecanismo reutilizable para Toast;
- soporta success/error/warning/info;
- existe una API simple de aplicación o equivalente;
- existe auto-dismiss;
- existe barra de tiempo restante;
- existe cierre manual;
- hover/focus pausa cuando corresponda;
- respeta reduced motion;
- posición desktop es adecuada;
- posición mobile es adecuada;
- no bloquea interacción;
- evita duplicados accidentales;
- logout utiliza el nuevo sistema;
- logout success aparece una sola vez;
- no reaparece después de refresh;
- no reaparece en navegaciones futuras;
- no queda persistido;
- auth continúa funcionando sin cambios;
- lint pasa;
- typecheck pasa;
- tests relevantes pasan;
- build pasa.

---

# Entregable

Reportar:

```text
TASK:
UI-03 — Sistema reutilizable de feedback efímero

STATUS:
completed | blocked | failed

CURRENT IMPLEMENTATION:
- previous logout feedback mechanism:
- root cause of persistence:

NOTIFICATION SYSTEM:
- implementation/library:
- application API:
- supported variants:
- position desktop:
- position mobile:
- max visible:

LIFECYCLE:
- default durations:
- progress indicator:
- manual close:
- pause behavior:
- deduplication:

ACCESSIBILITY:
- semantics:
- keyboard:
- focus:
- reduced motion:

LOGOUT INTEGRATION:
- trigger:
- redirect:
- consumption:
- refresh behavior:
- subsequent navigation:

AUTH PRESERVED:
- cookies:
- refresh:
- CSRF:
- revocation:

VALIDATION:
- lint:
- typecheck:
- tests:
- build:

OUT OF SCOPE PRESERVED:
- confirmation dialogs:
- inline form errors:
- landing:
- header:
- account:
- matches:

BLOCKERS:
- none | ...
```

No comenzar otra task automáticamente.