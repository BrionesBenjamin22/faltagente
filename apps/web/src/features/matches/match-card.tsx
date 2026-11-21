import Link from "next/link";
import { MapPin, UsersRound } from "lucide-react";
import styles from "./match-card.module.css";
import type { Match } from "./types";
import { matchDateFormat, matchPriceFormat } from "./format";

export function MatchCard({ match }: { match: Match }) {
  const available = match.status === "OPEN" && match.availablePlaces > 0;
  return (
    <article className={`match ${styles.card}`} data-sport={match.sport.slug}>
      <time className={styles.date} dateTime={match.startsAt}>{matchDateFormat.format(new Date(match.startsAt))}</time>
      <h2>{match.venueName}</h2>
      <p>{match.sport.name}{match.sportFormat ? ` · ${match.sportFormat.name}` : ""} · {match.location.name}</p>
      <p className={`muted ${styles.address}`}><MapPin size={16} aria-hidden="true" />{match.address}</p>
      <p className={styles.price}>{matchPriceFormat.format(Number(match.pricePerPerson))} <span>por persona</span></p>
      <p className={`${styles.places} ${available ? "available" : "muted"}`}><UsersRound size={17} aria-hidden="true" />
        {match.status === "CANCELLED" ? "Partido cancelado" : available
          ? `${match.availablePlaces} ${match.availablePlaces === 1 ? "lugar disponible" : "lugares disponibles"}`
          : "Partido completo"}
      </p>
      {match.description ? <p className="muted">{match.description}</p> : null}
      <Link className={`button secondary ${styles.link}`} href={`/partidos/${match.id}`} aria-label={`Ver partido en ${match.venueName}`}>Ver partido</Link>
    </article>
  );
}
