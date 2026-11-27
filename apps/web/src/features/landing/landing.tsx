import Link from "next/link";
import { ArrowRight, MapPin, Search } from "lucide-react";
import { BenefitsCarousel } from "./benefits-carousel";
import { SportsVisual } from "./sports-visual";
import styles from "./landing.module.css";

export function Landing() {
  return <>
    <section className={styles.hero} data-landing-hero aria-labelledby="landing-title">
      <div className={styles.heroContent}>
        <div className={styles.heroCopy}>
          <p className={styles.eyebrow}><MapPin size={17} aria-hidden="true" />Partidos en Argentina</p>
          <h1 id="landing-title">Te falta uno.<br />A alguien le falta partido.</h1>
          <p className={styles.description}>Encontrá partidos cerca tuyo, completá equipos
            y sumate a jugar.
          </p>
          <div className={styles.heroActions}>
            <Link className="button" href="/partidos"><Search size={18} aria-hidden="true" />Buscar un partido <ArrowRight size={17} aria-hidden="true" /></Link>
            <Link className="button secondary" href="/auth/login">Ingresar</Link>
          </div>
          <p className={styles.footnote}>Explorá los partidos sin crear una cuenta.</p>
        </div>
        <div className={styles.heroSports}>
          <SportsVisual />
        </div>
      </div>
    </section>
    <BenefitsCarousel />
  </>;
}
