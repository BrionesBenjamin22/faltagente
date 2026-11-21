# UI-SPORTS-01 — Identidad deportiva inicial

Rama: feature/diseno-deportivo. Alcance: paleta compartida, marca del encabezado, hero público, representación de deportes y tarjetas de partidos. No cambia contratos, filtros, navegación, sesión ni reglas de inscripción.

## Dirección visual

Identidad de club barrial: fondo claro #f2f6f1, texto verde profundo #16392b, verde cancha #19613f, superficie blanca #ffffff y cupo libre amarillo #f4d66b. Tema oscuro con fondo #12271e y controles claros #c6e8a0. El amarillo identifica el lugar libre de la ilustración; los cuatro deportes conservan igual jerarquía en su listado.

Tipografía del hero Impact/Arial Narrow con fallback sans-serif, cuerpo Segoe UI/Arial, sin descargas externas. Composición: texto y acciones alineados a izquierda, cancha a derecha en escritorio; apilados en móvil. La cancha es decorativa, dibujada con CSS, con cinco jugadores y un lugar libre. La lista accesible de deportes permanece separada de esa decoración.

Las tarjetas conservan contenido y enlace, con fecha separada, franja por deporte, dirección y cupos con iconos decorativos y mayor jerarquía del precio. Los temas usan tokens compartidos. No se agregan dependencias ni imágenes remotas.

## Validación

Lint y typecheck web aprobados. Pasaron 16 tests existentes de landing, carrusel, shell y tarjetas. Revisión independiente de accesibilidad, contraste y navegación sin bloqueos. Chromium comprobó tamaños 320, 390, 768 y 1440, temas claro/oscuro, ausencia de errores JavaScript y overflow horizontal; descubrimiento mostró dos tarjetas reales de Tolosa. La revisión visual detectó recorte del texto del carrusel en 320 y se ajustó altura automática en pantallas de hasta 420; se agregó una regresión Playwright para ese caso.

No se agregan tests unitarios de estilos que reflejen la implementación. La regresión de navegador verifica el contenido visible y su geometría real. El backend no cambia, por lo que no corresponde repetir su suite. La base de desarrollo conserva siete migraciones aplicadas, sin pendientes ni necesidad de seeds. Sin commit ni push.
Build Docker final aprobado y web reconstruida. La regresión Playwright de 320 px aprobó 1/1; las capturas finales de 320 claro y 390 oscuro confirman el párrafo dentro de la tarjeta, sin recortes ni desbordamiento. Sin errores JavaScript. No se modificaron datos.
