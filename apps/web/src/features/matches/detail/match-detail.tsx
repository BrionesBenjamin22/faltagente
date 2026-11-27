"use client";

import Link from "next/link";
import type { ReactNode } from "react";
import { CalendarDays, Clock3, MapPin, ShieldCheck, UsersRound } from "lucide-react";
import { notFound } from "next/navigation";
import { ApiError, errorMessage } from "@/lib/http";
import { useMatchDetail } from "./use-match-detail";
import { matchPriceFormat } from "../format";
import { MatchDetailLoading } from "./match-detail-loading";
import { MatchManagement } from "./match-management";
import { MatchFeedback } from "./match-feedback";
import type { MatchDetail } from "../types";
import styles from "./match-detail.module.css";
import { ReservationPanel, ReservationActivity } from "./reservation-panel";
import { MatchSharing } from "../sharing/match-sharing";
import { getSportVariant, SportCourt, SportIcon } from "./sport-court";

const localDate = new Intl.DateTimeFormat("es-AR", { weekday: "long", day: "numeric", month: "short", timeZone: "America/Argentina/Buenos_Aires" });
const localHour = new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit", hour12: false, timeZone: "America/Argentina/Buenos_Aires" });

export function MatchDetailScreen({ id, initialData, success }: { id: string; initialData?: MatchDetail; success?: string }) {
  const query = useMatchDetail(id, initialData);
  if (query.isError && query.error instanceof ApiError && (query.error.status === 404 || query.error.status === 400)) notFound();

  return <div className={styles.page} data-match-detail>
    <MatchFeedback success={success} />
    <nav aria-label="Ruta de navegación" className={styles.breadcrumbs}>
      <Link className={styles.back} href="/partidos">Volver a partidos</Link>
      <span className={styles.breadcrumbSeparator} aria-hidden="true">›</span>
      <span>Detalle del encuentro</span>
    </nav>
    {query.isPending ? <MatchDetailLoading /> : <>
      {query.isError ? <div className="notice">
        <p className="error" role="alert">{errorMessage(query.error)}</p>
        <button type="button" className="button secondary" onClick={() => void query.refetch()} disabled={query.isFetching}>{query.isFetching ? "Reintentando…" : "Reintentar"}</button>
      </div> : null}
      {query.data ? <MatchDetailContent match={query.data}
        reservation={<ReservationPanel match={query.data} showHistory={false} />}
        activity={<ReservationActivity matchId={query.data.id} />}
        management={<MatchManagement id={id} organizerId={query.data.organizer.id} />}
      /> : null}
    </>}
  </div>;
}

/** Public sport data and protected interactions stay separate; this component only composes the presentation. */
export function MatchDetailContent({ match, reservation, activity, management }: { match: MatchDetail; reservation?: ReactNode; activity?: ReactNode; management?: ReactNode }) {
  const sport = getSportVariant(match.sport.slug);
  const start = new Date(match.startsAt);
  const hasCapacity = typeof match.totalPlaces === "number" && Number.isFinite(match.totalPlaces) && match.totalPlaces > 0;
  const capacity = hasCapacity ? match.totalPlaces! : 0;
  const availablePlaces = Math.max(0, match.availablePlaces);
  const occupied = hasCapacity ? Math.max(0, capacity - availablePlaces) : 0;
  const percentage = hasCapacity ? Math.max(0, Math.min(100, (occupied / capacity) * 100)) : 0;
  const available = availablePlaces > 0;
  const statusText = match.status === "CANCELLED" ? "Partido cancelado" : match.status === "CLOSED" ? "Partido cerrado" : available ? "Inscripciones abiertas" : "Sin cupos disponibles";
  const availabilityText = match.status !== "OPEN" ? `Lugares informados: ${match.availablePlaces}` : available ? `${match.availablePlaces} ${match.availablePlaces === 1 ? "lugar disponible" : "lugares disponibles"}` : "Sin lugares disponibles";

  return <article className={styles.article} aria-labelledby="match-title" data-sport={sport}>
    <header className={styles.hero}>
      <div className={styles.heroTop}>
        <div className={styles.heroCopy}>
          <p className={styles.heroEyebrow}><span className={styles.liveDot} aria-hidden="true"/><SportIcon sport={sport} className={styles.heroSportIcon} /> {match.location.name} · Tu próximo encuentro</p>
          <h1 id="match-title" className={styles.title}>{match.sport.name}</h1>
          <div className={styles.heroTags}>
            {match.sportFormat ? <span className={styles.format}><SportIcon sport={sport} aria-hidden="true" />{match.sportFormat.name}</span> : null}
            <span className={`${styles.statusBadge} ${match.status === "CANCELLED" ? styles.statusCancelled : ""}`}><span aria-hidden="true" className={styles.badgeDot}/> {statusText}</span>
          </div>
          <p className={styles.heroDescription}>Nos encontramos en <strong>{match.placeName}</strong> · {match.location.name}</p>
        </div>
        <div className={styles.heroArt} aria-hidden="true"><SportCourt sport={sport} /></div>
      </div>
      <div className={styles.heroStats}>
        <div className={styles.heroStat}><CalendarDays aria-hidden="true"/><div><span>Fecha</span><time dateTime={match.startsAt}>{localDate.format(start)}</time></div></div>
        <div className={styles.heroStat}><Clock3 aria-hidden="true"/><div><span>Horario</span><strong>{localHour.format(start)} h</strong></div></div>
        <div className={styles.heroStat}><MapPin aria-hidden="true"/><div><span>Localidad</span><strong>{match.location.name}</strong></div></div>
      </div>
    </header>

    <div className={styles.mainGrid}>
      <div className={styles.leftColumn}>
        <section className={styles.information} aria-labelledby="match-place">
          <div className={styles.sectionHeading}>
            <div><p className={styles.kicker}>Los detalles</p><h2 id="match-place">Todo sobre el partido.</h2><p className={styles.sectionIntro}>Lo que necesitás saber antes de sumarte.</p></div>
            <span className={styles.headingSport}><SportIcon sport={sport}/></span>
          </div>
          <div className={styles.placeCard}>
            <div className={styles.placeCopy}>
              <span className={styles.smallLabel}>Nos encontramos en</span>
              <strong className={styles.venue}>{match.placeName}</strong>
              <p>{match.address}</p>
              <p>{match.location.name}</p>
            </div>
            <div className={styles.miniCourt} aria-hidden="true"><SportCourt sport={sport}/></div>
          </div>
          <div className={styles.detailsGrid}>
            <section className={styles.detailItem} aria-labelledby="match-organizer">
              <UsersRound aria-hidden="true"/><div><span>Organiza</span><strong id="match-organizer">{match.organizer.name}</strong><small>Responsable del encuentro</small></div>
            </section>
            <section className={styles.detailItem} aria-labelledby="match-format">
              <ShieldCheck aria-hidden="true"/><div><span>Deporte y formato</span><strong id="match-format">{match.sportFormat?.name ?? match.sport.name}</strong><small>Encuentro deportivo</small></div>
            </section>
          </div>
          {match.description?.trim() ? <section className={styles.description} aria-labelledby="match-description">
            <h3 id="match-description">Sobre el partido</h3><p>{match.description}</p>
          </section> : null}
        </section>
        {activity}
      </div>

      <aside className={styles.bookingPanel} aria-label="Reserva de lugares">
        <div className={styles.bookingHeading}>
          <div><span className={styles.kicker}><SportIcon sport={sport}/> Tu próximo partido</span><h2>Sumate a jugar.</h2></div>
          <span className={styles.bookingChip}>{match.status === "CANCELLED" ? "CANCELADO" : available && match.status === "OPEN" ? "HAY LUGAR" : "SIN CUPOS"}</span>
        </div>
        <div className={styles.bookingPrice} id="match-price"><strong>{matchPriceFormat.format(Number(match.pricePerPerson))}</strong><span>por persona</span></div>
        <div className={styles.availabilityLine}><strong className={styles.availability}>{availabilityText}</strong>{hasCapacity ? <span>{occupied} de {capacity}</span> : null}</div>
        {hasCapacity ? <><div className={styles.occupancyMeter} role="progressbar" aria-label="Ocupación del partido" aria-valuemin={0} aria-valuemax={capacity} aria-valuenow={occupied}><span style={{ width: `${percentage}%` }}/></div>
          <div className={styles.occupancyFoot}><span>{occupied} lugares ocupados o protegidos</span><span>{capacity} cupos totales</span></div></> : null}
        <div className={styles.reservationSection}>{reservation}</div>
        <div className={styles.sharingArea}><MatchSharing key={`${match.id}:${match.startsAt}:${match.status}`} match={match}/></div>
      </aside>
    </div>
    {management ? <div className={styles.organizerArea}>{management}</div> : null}
  </article>;
}
