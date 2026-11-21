"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useSession } from "@/features/auth/session";
import { ApiError, errorMessage } from "@/lib/http";
import { reservationsService } from "./reservations-service";
import type { MatchDetail } from "../types";
import styles from "./match-detail.module.css";
const messages: Record<string, string> = {
  MATCH_FULL: "Ya no quedan suficientes lugares. Revisá la disponibilidad e intentá nuevamente.",
  MATCH_UNAVAILABLE: "Este partido ya no admite inscripciones.",
  OWN_MATCH: "No podés inscribirte en tu propio partido.",
  DAILY_PARTICIPATION_CONFLICT: "Ya tenés una participación confirmada para esa fecha.",
  RESERVATION_ALREADY_EXISTS: "Ya tenés una inscripción en este partido.",
};
export function ReservationPanel({ match }: { match: MatchDetail }) {
  const { session, isPending, isError, synchronize } = useSession();
  const userId = session?.authenticated ? session.user?.id : undefined;
  return <section className={styles.reservation} aria-label="Inscripción al partido">
    {isPending ? <p role="status">Consultando sesión…</p> : isError ? <>
      <p role="alert">No pudimos consultar tu sesión.</p>
      <button className="button secondary" onClick={() => void synchronize()}>Reintentar</button>
    </> : userId ? <UserReservation key={`${userId}:${match.id}`} match={match} userId={userId} /> : <>
      <p>Ingresá para reservar uno o varios lugares.</p>
      <Link className="button" href="/auth/login">Ingresar para inscribirme</Link>
    </>}
  </section>;
}
function UserReservation({ match, userId }: { match: MatchDetail; userId: string }) {
  const client = useQueryClient();
  const key = ["reservations", "me", userId, match.id];
  const [places, setPlaces] = useState(1);
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const delay = Date.parse(match.startsAt) - Date.now();
    if (delay <= 0) return;
    const timer = setTimeout(() => setNow(Date.now()), Math.min(delay + 1, 2_147_483_647));
    return () => clearTimeout(timer);
  }, [match.startsAt, now]);
  const mine = useQuery({ queryKey: key, queryFn: () => reservationsService.mine(match.id), retry: false, staleTime: 0 });
  const booking = useMutation({
    mutationFn: () => reservationsService.create(match.id, places),
    onSuccess: async reservation => {
      client.setQueryData(key, reservation);
      await client.invalidateQueries({ queryKey: ["matches"] });
    },
    onError: async error => {
      if (error instanceof ApiError && error.status === 409) await Promise.all([
        client.invalidateQueries({ queryKey: ["matches"] }),
        client.invalidateQueries({ queryKey: key }),
      ]);
    },
  });
  if (mine.isPending) return <p role="status">Consultando inscripción…</p>;
  if (mine.isError) return <><p role="alert">{errorMessage(mine.error)}</p><button className="button secondary" disabled={mine.isFetching} onClick={() => void mine.refetch()}>Reintentar</button></>;
  if (mine.data) return <div role="status"><p>Inscripción confirmada</p><p>{mine.data.places} {mine.data.places === 1 ? "lugar reservado" : "lugares reservados"}.</p></div>;
  if (match.organizer.id === userId) return <p>Organizás este partido. No podés reservar lugares en él.</p>;
  if (match.status !== "OPEN" || Date.parse(match.startsAt) <= now) return <p>Este partido ya no admite inscripciones.</p>;
  if (match.availablePlaces < 1) return <p>El partido está completo.</p>;
  return <form onSubmit={event => { event.preventDefault(); if (!booking.isPending && Number.isInteger(places) && places >= 1 && places <= match.availablePlaces) booking.mutate(); }}>
    <div className={styles.reservationControls}>
    <button className={`button ${styles.reservationButton}`} type="submit" disabled={booking.isPending || !Number.isInteger(places) || places < 1 || places > match.availablePlaces}>{booking.isPending ? "Confirmando…" : "Inscribirme"}</button>
    <div className={styles.reservationQuantity}><label htmlFor="reservation-places">Cantidad de lugares</label>
      <input id="reservation-places" type="number" min={1} max={match.availablePlaces} step={1} required value={places} disabled={booking.isPending} onChange={event => { setPlaces(Number(event.target.value)); booking.reset(); }} />
    </div>
    </div>
    <p className={`muted ${styles.reservationHint}`}>La confirmación es automática. Podés reservar para vos y tus acompañantes.</p>
    {booking.isError ? <p className="error" role="alert">{booking.error instanceof ApiError ? messages[booking.error.code] ?? errorMessage(booking.error) : errorMessage(booking.error)}</p> : null}

  </form>;
}