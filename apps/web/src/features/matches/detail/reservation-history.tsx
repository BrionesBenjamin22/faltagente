"use client";

import { useState } from "react";
import { errorMessage } from "@/lib/http";
import { useReservationHistory } from "./use-reservations";
import { ReservationCancellations } from "./reservation-cancellations";
import styles from "./match-detail.module.css";

const date = new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" });

export function ReservationHistory({ userId, matchId }: { userId: string; matchId: string }) {
  const [page, setPage] = useState(1);
  const [selectedReservation, setSelectedReservation] = useState<string | null>(null);
  const history = useReservationHistory(userId, matchId, page);
  return <section className={styles.section} aria-labelledby="reservation-history-heading">
    <h2 id="reservation-history-heading">Historial de reservas</h2>
    <p className="muted">Sólo vos podés consultar tus reservas y sus motivos de cancelación.</p>
    {!history.isPending && !history.isError && history.data.matchCancellation ? <div className="notice"><h3>Partido cancelado por el organizador</h3><p>Cancelado: <time dateTime={history.data.matchCancellation.cancelledAt}>{date.format(new Date(history.data.matchCancellation.cancelledAt))}</time></p>{history.data.matchCancellation.reason ? <p className={styles.reservationReason}>Motivo del organizador: <span>{history.data.matchCancellation.reason}</span></p> : <p>El organizador no indicó un motivo.</p>}</div> : null}
    {history.isPending ? <p role="status">Cargando historial de reservas…</p> : history.isError ? <>
      <p className="error" role="alert">{errorMessage(history.error)}</p>
      <button type="button" className="button secondary" disabled={history.isFetching} onClick={() => void history.refetch()}>Reintentar historial de reservas</button>
    </> : history.data.items.length === 0 ? <p>Todavía no tenés reservas en este partido.</p> : <>
      <ul className="history-list">{history.data.items.map(item => <li key={item.id}>
        <p><strong>{item.status === "CONFIRMED" ? "Confirmada" : (item.cancellationSource === "MATCH" || item.cancellationSource === "ORGANIZER") ? "Cancelada por el organizador" : "Cancelaste tu reserva"}</strong> · {item.places} {item.places === 1 ? "lugar" : "lugares"}</p>
        <p>Reservada: <time dateTime={item.createdAt}>{date.format(new Date(item.createdAt))}</time></p>
        {item.cancelledAt ? <p>Cancelada: <time dateTime={item.cancelledAt}>{date.format(new Date(item.cancelledAt))}</time></p> : null}
        {item.cancellationReason ? <p className={styles.reservationReason}>Motivo: <span>{item.cancellationReason}</span></p> : null}
        <button type="button" id={`view-cancellations-${item.id}`} className="button secondary" aria-expanded={selectedReservation === item.id} onClick={() => setSelectedReservation(current => current === item.id ? null : item.id)}>Ver bajas</button>
        {selectedReservation === item.id ? <ReservationCancellations userId={userId} matchId={matchId} reservationId={item.id} onClose={() => { setSelectedReservation(null); requestAnimationFrame(() => document.getElementById(`view-cancellations-${item.id}`)?.focus()); }} /> : null}
      </li>)}</ul>
    </>}
    {page > 1 || history.data?.items.length ? <nav className="actions" aria-label="Paginación del historial de reservas">
      <button type="button" className="button secondary" disabled={page === 1 || history.isFetching} onClick={() => setPage(current => current - 1)}>Anterior</button>
      <span aria-live="polite">Página {page}</span>
      <button type="button" className="button secondary" disabled={!history.data?.hasMore || history.isFetching || history.isError} onClick={() => setPage(current => current + 1)}>Siguiente</button>
    </nav> : null}
  </section>;
}
