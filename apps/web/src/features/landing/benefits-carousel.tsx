"use client";

import { useId, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { CalendarCheck, ChevronLeft, ChevronRight, MapPin, UserPlus } from "lucide-react";
import { StepIllustration } from "./step-illustration";
import styles from "./benefits-carousel.module.css";

const slides = [
  { title: "Elegí dónde jugar", body: "Explorá partidos por localidad y deporte. Filtrá por fecha, horario, formato, precio y lugares disponibles.", chip: "Cerca tuyo", labels: ["En tu zona", "Localidad elegida"], Icon: MapPin },
  { title: "Encontrá tu partido", body: "¿Tenés ganas de jugar? Revisá los encuentros disponibles y elegí el que mejor se adapte a vos.", chip: "Partidos disponibles", labels: ["Hay lugares", "Elegí el horario"], Icon: CalendarCheck },
  { title: "Sumate a jugar", body: "Reservá tu lugar y, si querés, anotá a tus compañeros. Ya estás más cerca de entrar a la cancha.", chip: "Lugar reservado", labels: ["Reserva confirmada", "¡Nos vemos en la cancha!"], Icon: UserPlus },
] as const;

export function BenefitsCarousel() {
  const id = useId();
  const gesture = useRef<{ id: number; x: number; y: number } | null>(null);
  const [active, setActive] = useState(0);
  function goTo(index: number) { setActive((index + slides.length) % slides.length); }
  function move(direction: number) { setActive(current => (current + direction + slides.length) % slides.length); }
  function onPointerUp(event: PointerEvent<HTMLDivElement>) {
    const start = gesture.current;
    gesture.current = null;
    if (!start || start.id !== event.pointerId) return;
    const distance = event.clientX - start.x;
    if (Math.abs(distance) >= 40 && Math.abs(distance) > Math.abs(event.clientY - start.y)) move(distance < 0 ? 1 : -1);
  }
  function onKeyDown(event: KeyboardEvent<HTMLDivElement>) {
    if (event.target !== event.currentTarget) return;
    if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
      event.preventDefault(); move(event.key === "ArrowRight" ? 1 : -1);
    } else if (event.key === "Home" || event.key === "End") {
      event.preventDefault(); goTo(event.key === "Home" ? 0 : slides.length - 1);
    }
  }
  return (
    <section className={styles.section} aria-roledescription="carrusel" aria-labelledby="como-funciona">
      <div className={styles.container}>
        <header className={styles.header}>
          <div>
            <p className={styles.overline}>CÓMO FUNCIONA</p>
            <h2 id="como-funciona" tabIndex={-1}>Jugar juntos es <span>más fácil.</span></h2>
            <p className={styles.intro}>Sin grupos interminables ni planes que se caen. Encontrá un partido y sumate en pocos pasos.</p>
          </div>
          <p className={styles.summary}><strong>3 pasos</strong> para entrar a la cancha</p>
        </header>
        <div id={`${id}-track`} className={styles.viewport} role="group" aria-label="Cómo funciona Falta Gente" tabIndex={0}
          onKeyDown={onKeyDown}
          onPointerDown={event => {
            if (event.button !== 0 || event.isPrimary === false) return;
            gesture.current = { id: event.pointerId, x: event.clientX, y: event.clientY };
            event.currentTarget.setPointerCapture(event.pointerId);
          }}
          onPointerUp={onPointerUp}
          onPointerCancel={() => { gesture.current = null; }}
          onLostPointerCapture={() => { gesture.current = null; }}>
          <div className={styles.track} style={{ transform: `translateX(-${active * 100}%)` }}>
            {slides.map(({ title, body, chip, labels, Icon }, index) => (
              <article key={title} className={styles.slide} role="group" aria-roledescription="diapositiva" aria-label={`${index + 1} de ${slides.length}`} aria-hidden={active !== index} inert={active !== index}>
                <div className={styles.content}>
                  <span className={styles.step}>PASO 0{index + 1} / 03</span>
                  <h3>{title}</h3><p>{body}</p>
                  <span className={styles.chip}><Icon size={15} aria-hidden="true" />{chip}</span>
                </div>
                <StepIllustration Icon={Icon} labels={labels} />
              </article>
            ))}
          </div>
        </div>
        <div className={styles.controls}>
          <span className={styles.hint}>Tres pasos. Un partido más cerca.</span>
          <div className={styles.navigation}>
            <button className={styles.arrow} type="button" aria-label="Paso anterior" aria-controls={`${id}-track`} onClick={() => move(-1)}><ChevronLeft size={20} aria-hidden="true" /></button>
            <div className={styles.indicators} role="group" aria-label="Elegir diapositiva">
              {slides.map(({ title }, index) => <button key={title} type="button" className={styles.indicator} aria-label={`Ir a ${title}`} aria-controls={`${id}-track`} aria-current={active === index ? "true" : undefined} onClick={() => goTo(index)}><span aria-hidden="true" /></button>)}
            </div>
            <button className={styles.arrow} type="button" aria-label="Paso siguiente" aria-controls={`${id}-track`} onClick={() => move(1)}><ChevronRight size={20} aria-hidden="true" /></button>
          </div>
        </div>
        <p className="sr-only" role="status" aria-live="polite">{active + 1} de {slides.length}</p>
        <div className={styles.closing}><p>La próxima jugada <span>empieza acá.</span></p></div>
      </div>
    </section>
  );
}
