"use client";

import { useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { CalendarCheck, MapPin, Users } from "lucide-react";
import styles from "./landing.module.css";

const slides = [
  {
    title: "Elegí dónde jugar",
    body: "Explorá partidos por localidad y deporte. Consultá el lugar, la fecha, el horario, el formato, el precio y los lugares libres.",
    Icon: MapPin,
  },
  {
    title: "Encontrá un partido",
    body: "Tenés ganas de jugar. Elegí un partido y reservá tu lugar. No necesitás conocer al resto de los jugadores.",
    Icon: CalendarCheck,
  },
  {
    title: "Sumá a tus compañeros",
    body: "Si vas con amigos, podrás reservar también sus lugares en el mismo partido. Vos te anotás y sumás a los que se prenden.",
    Icon: Users,
  },
] as const;

export function BenefitsCarousel() {
  const id = useId();
  const gesture = useRef<{ id: number; x: number; y: number } | null>(null);
  const suppressClick = useRef(false);
  const track = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(0);

  function goTo(index: number) {
    setActive(Math.max(0, Math.min(slides.length - 1, index)));
  }

  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    const start = gesture.current;
    gesture.current = null;
    if (!start || start.id !== event.pointerId) return;
    const distance = event.clientX - start.x;
    const verticalDistance = Math.abs(event.clientY - start.y);
    suppressClick.current = Math.max(Math.abs(distance), verticalDistance) >= 40;
    if (Math.abs(distance) < 40 || Math.abs(distance) <= verticalDistance) return;
    setActive(current => Math.max(0, Math.min(slides.length - 1, current + (distance < 0 ? 1 : -1))));
  }

  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    const destinations: Record<string, number> = { ArrowLeft: active - 1, ArrowRight: active + 1, Home: 0, End: slides.length - 1 };
    if (event.key in destinations) { event.preventDefault(); goTo(destinations[event.key]); }
  }

  return (
    <section className={`benefits ${styles.carousel}`} aria-roledescription="carrusel" aria-labelledby={`${id}-title`}>
      <h2 id={`${id}-title`}>Más fácil juntarse a jugar</h2>
      <div
        ref={track}
        id={`${id}-track`}
        className={`benefits-track ${styles.viewport}`}
        role="group"
        aria-label="Beneficios de Falta Gente"
        tabIndex={0}
        onKeyDown={onKeyDown}
        onPointerDown={event => {
          if (event.button !== 0 || event.isPrimary === false) return;
          suppressClick.current = false;
          gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
          // Preserve a side button as the click target after a tap, while still
          // receiving the full gesture if the pointer leaves its visible edge.
          const captureTarget = event.target instanceof HTMLButtonElement ? event.target : event.currentTarget;
          captureTarget.setPointerCapture(event.pointerId);
        }}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { gesture.current = null; }}
        onLostPointerCapture={() => { gesture.current = null; }}
      >
        {slides.map(({ title, body, Icon }, index) => (
          <div key={title} className={`benefit-slide glass ${styles.slide}`} data-position={index === active ? "active" : (index - active + slides.length) % slides.length === 1 ? "right" : "left"}>
            <article role="group" aria-roledescription="diapositiva" aria-label={`${index + 1} de ${slides.length}`} aria-hidden={active !== index} inert={active !== index}>
              <Icon className="benefit-icon" size={30} aria-hidden="true" />
              <h3>{title}</h3>
              <p>{body}</p>
            </article>
            {active !== index && <button type="button" className={styles.sideSelection} aria-label={`Ver ${title}`} aria-controls={`${id}-track`} onClick={event => {
              if (suppressClick.current && event.detail !== 0) {
                suppressClick.current = false;
                return;
              }
              goTo(index);
              track.current?.focus({ preventScroll: true });
            }} />}
          </div>
        ))}
      </div>
      <div className="benefits-controls">
        <div className="benefits-indicators" role="group" aria-label="Elegir diapositiva">
          {slides.map(({ title }, index) => <button key={title} type="button" className="benefit-indicator" aria-label={`Ir a ${title}`} aria-controls={`${id}-track`} aria-current={active === index ? "true" : undefined} onClick={() => goTo(index)}><span aria-hidden="true" /></button>)}
        </div>
      </div>
      <p className="sr-only" role="status" aria-live="polite">{active + 1} de {slides.length}</p>
    </section>
  );
}
