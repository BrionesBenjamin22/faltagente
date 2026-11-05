import Link from "next/link";
import type { Match } from "./service";
import { matchDateFormat, matchPriceFormat } from "./format";

export function MatchCard({ match }: { match: Match }) {
  const available = match.availablePlaces > 0;
  return (
    <article className="match">
      <time dateTime={match.startsAt}>{matchDateFormat.format(new Date(match.startsAt))}</time>
      <h2>{match.venueName}</h2>
      <p>{match.sport.name}{match.sportFormat ? ` · ${match.sportFormat.name}` : ""} · {match.location.name}</p>
      <p className="muted">{match.address}</p>
      <p>{matchPriceFormat.format(Number(match.pricePerPerson))} por persona</p>
      <p className={available ? "available" : "muted"}>
        {available
          ? `${match.availablePlaces} ${match.availablePlaces === 1 ? "lugar disponible" : "lugares disponibles"}`
          : "Partido completo"}
      </p>
      {match.description ? <p className="muted">{match.description}</p> : null}
      <Link className="button secondary" href={`/partidos/${match.id}`} aria-label={`Ver partido en ${match.venueName}`}>Ver partido</Link>
    </article>
  );
}
