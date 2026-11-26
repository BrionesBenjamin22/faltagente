"use client";

import { useEffect, useRef, useState } from "react";
import { errorMessage } from "@/lib/http";
import { useReservationCancellations } from "./use-reservations";
import styles from "./match-detail.module.css";

const date = new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" });

export function ReservationCancellations({ userId, matchId, reservationId, onClose }: { userId: string; matchId: string; reservationId: string; onClose: () => void }) {
  const [page, setPage] = useState(1);
  const heading = useRef<HTMLHeadingElement>(null);
  const query = useReservationCancellations(userId, matchId, reservationId, page);
  useEffect(() => { heading.current?.focus(); }, []);
  return <section className={styles.section} aria-labelledby={`cancellations-${reservationId}`}>
    <h3 id={`cancellations-${reservationId}`} tabIndex={-1} ref={heading}>Bajas de la reserva</h3>
    {query.isPending ? <p role="status">Cargando bajas…</p> : query.isError ? <><p className="error" role="alert">{errorMessage(query.error)}</p><button type="button" className="button secondary" disabled={query.isFetching} onClick={() => void query.refetch()}>Reintentar bajas</button></> : query.data.items.length ? <ul className="history-list">{query.data.items.map(item => <li key={item.id}>
      <p><strong>{item.remainingPlaces === 0 ? "Cancelación total" : "Reducción de lugares"}</strong></p><p><time dateTime={item.occurredAt}>{date.format(new Date(item.occurredAt))}</time></p>
      <p>{item.previousPlaces - item.remainingPlaces} {item.previousPlaces - item.remainingPlaces === 1 ? "lugar liberado" : "lugares liberados"}. Lugares conservados: {item.remainingPlaces}.</p>
      {item.source === "MATCH" || item.source === "ORGANIZER" ? <p>{item.remainingPlaces > 0 ? "Reducción realizada por el organizador." : "Cancelada por el organizador."}</p> : null}
      {item.reason ? <p className={styles.reservationReason}>Motivo: <span>{item.reason}</span></p> : null}
    </li>)}</ul> : <p>Esta reserva no tiene bajas registradas.</p>}
    {page > 1 || query.data?.items.length ? <nav className="actions" aria-label="Paginación de bajas"><button type="button" className="button secondary" disabled={page === 1 || query.isFetching} onClick={() => setPage(current => current - 1)}>Anterior</button><span aria-live="polite">Página {page}</span><button type="button" className="button secondary" disabled={!query.data?.hasMore || query.isFetching || query.isError} onClick={() => setPage(current => current + 1)}>Siguiente</button></nav> : null}
    <button type="button" className="button secondary" onClick={onClose}>Cerrar bajas</button>
  </section>;
}
