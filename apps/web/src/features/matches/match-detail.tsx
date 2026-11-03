"use client";

import Link from "next/link";
import { notFound } from "next/navigation";
import { ApiError, errorMessage } from "@/lib/http";
import { useMatchDetail } from "./hooks";
import { matchDateFormat, matchPriceFormat } from "./format";
import { MatchDetailLoading } from "./match-detail-loading";
import type { MatchDetail } from "./service";
import styles from "./match-detail.module.css";

export function MatchDetailScreen({ id, initialData }: { id: string; initialData?: MatchDetail }) {
  const query = useMatchDetail(id, initialData);
  if (query.isError && query.error instanceof ApiError && (query.error.status === 404 || query.error.status === 400)) notFound();

  return <div className={styles.page}>
    <Link className={styles.back} href="/partidos"><span aria-hidden="true">←</span> Volver a partidos</Link>
    {query.isPending ? <MatchDetailLoading /> : <>
      {query.isError ? <div className="notice">
        <p className="error" role="alert">{errorMessage(query.error)}</p>
        <button type="button" className="button secondary" onClick={() => void query.refetch()} disabled={query.isFetching}>{query.isFetching ? "Reintentando…" : "Reintentar"}</button>
      </div> : null}
      {query.data ? <MatchDetailContent match={query.data} /> : null}
    </>}
  </div>;
}

export function MatchDetailContent({ match }: { match: MatchDetail }) {
  const available = match.availablePlaces > 0;
  return <article className={styles.article} aria-labelledby="match-title">
    <header>
      <div className={styles.sports}>
        <h1 id="match-title" className={styles.title}>{match.sport.name}</h1>
        {match.sportFormat ? <span className={styles.format}>{match.sportFormat.name}</span> : null}
      </div>
      <time className={styles.date} dateTime={match.startsAt}>{matchDateFormat.format(new Date(match.startsAt))}</time>
      {match.status !== "OPEN" ? <p className={styles.status}>{match.status === "CANCELLED" ? "Partido cancelado" : "Partido cerrado"}</p> : null}
      <p className={`${styles.availability} ${available && match.status === "OPEN" ? "available" : "muted"}`}>
        {match.status !== "OPEN" ? `Lugares informados: ${match.availablePlaces}` : available ? `${match.availablePlaces} ${match.availablePlaces === 1 ? "lugar disponible" : "lugares disponibles"}` : "Sin lugares disponibles"}
      </p>
    </header>
    <section className={styles.section} aria-labelledby="match-place">
      <h2 id="match-place">Lugar</h2>
      <p className={styles.venue}>{match.placeName}</p>
      <p>{match.address}</p>
      <p className="muted">{match.location.name}</p>
    </section>
    <div className={`${styles.section} ${styles.facts}`}>
      <section aria-labelledby="match-price">
        <h2 id="match-price">Precio</h2>
        <p className={styles.price}>{matchPriceFormat.format(Number(match.pricePerPerson))}</p>
        <p className="muted">por persona</p>
      </section>
      <section aria-labelledby="match-organizer">
        <h2 id="match-organizer">Organiza</h2>
        <p>{match.organizer.name}</p>
      </section>
    </div>
    {match.description?.trim() ? <section className={styles.section} aria-labelledby="match-description">
      <h2 id="match-description">Sobre el partido</h2>
      <p className={styles.description}>{match.description}</p>
    </section> : null}
  </article>;
}
