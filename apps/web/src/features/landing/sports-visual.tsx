import { Volleyball } from "lucide-react";
import styles from "./landing.module.css";

const sports = [
  { name: "Fútbol", symbol: <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" aria-hidden="true"><circle cx="24" cy="24" r="19" /><path d="m24 15 9 7-4 10H19l-4-10 9-7ZM24 15V5M33 22l9-4M29 32l6 7M19 32l-6 7M15 22l-9-4" /></svg> },
  { name: "Pádel", symbol: <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true"><ellipse cx="24" cy="18" rx="13" ry="15" /><path d="M21 33v10h6V33M19 13h.01M29 13h.01M24 18h.01M19 23h.01M29 23h.01" /></svg> },
  { name: "Básquet", symbol: <svg viewBox="0 0 48 48" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><circle cx="24" cy="24" r="19" /><path d="M5 24h38M24 5v38M11 10c17 7 17 21 0 28M37 10c-17 7-17 21 0 28" /></svg> },
  { name: "Vóley", symbol: <Volleyball size={48} strokeWidth={1.8} aria-hidden="true" /> },
];

export function SportsVisual() {
  return <div className={styles.sportsVisual}>
    <ul className={styles.sportsGrid} aria-label="Deportes disponibles">
      {sports.map(({ name, symbol }) => <li key={name} className={styles.sport}>{symbol}<span>{name}</span></li>)}
    </ul>
    <p className={styles.caption}>Nos vemos para jugar.</p>
  </div>;
}
