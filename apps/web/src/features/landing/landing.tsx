import Link from "next/link";
import { MapPin, LogIn, Search } from "lucide-react";
import { BenefitsCarousel } from "./benefits-carousel";
import { SportsVisual } from "./sports-visual";
export function Landing() {
  return <>
    <section className="landing">
      <div className="hero-copy">
        <p className="hero-location"><MapPin size={18} aria-hidden="true" />Partidos en Argentina</p>
        <h1>Te falta uno.<br />A alguien le falta partido.</h1>
        <p className="hero-description">Falta Gente conecta partidos con lugares libres y personas que quieren jugar. Encontrá el deporte que quieras cerca tuyo, sin conocer al organizador ni depender de un grupo.</p>
        <div className="actions">
          <Link className="button" href="/partidos"><Search size={18} aria-hidden="true" />Buscar un partido</Link>
          <Link className="button secondary" href="/auth/login"><LogIn size={18} aria-hidden="true" />Ingresar</Link>
        </div>
        <p className="muted hero-footnote">Explorá los partidos sin crear una cuenta.</p>
      </div>
      <SportsVisual />
    </section>
    <BenefitsCarousel />
  </>;
}
