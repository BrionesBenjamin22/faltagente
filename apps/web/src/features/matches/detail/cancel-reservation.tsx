"use client";

import { useEffect, useRef, useState } from "react";
import { useSession } from "@/features/auth/session";
import { ApiError, errorMessage } from "@/lib/http";
import { useCancelReservation } from "./use-reservations";
import type { Reservation } from "./reservations-service";
import styles from "./match-detail.module.css";


export function CancelReservation({ reservation, userId, organizerId, onClose, onCancelled }: { reservation: Reservation; userId: string; organizerId: string; onClose: () => void; onCancelled: () => void }) {
  const mutation = useCancelReservation(userId, reservation.matchId, organizerId);
  const [feedback, setFeedback] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const submitting = useRef(false);
  const session = useSession();
  useEffect(() => heading.current?.focus(), []);
  async function submit() {
    if (submitting.current) return;
    submitting.current = true;
    setFeedback("");
    try {
      await mutation.mutateAsync({ reservationId: reservation.id });
      onCancelled();
    } catch (error) {
      setFeedback(errorMessage(error));
      if (error instanceof ApiError && error.status === 401) await session.synchronize();
    } finally { submitting.current = false; }
  }
  return <section className={styles.section} aria-labelledby="cancel-reservation-heading">
    <h2 id="cancel-reservation-heading" tabIndex={-1} ref={heading}>Cancelar reserva</h2>
    <p>{reservation.places === 1 ? "Se liberará 1 lugar." : `Se liberarán ${reservation.places} lugares, incluidos tus acompañantes.`} Podés volver a inscribirte si hay disponibilidad.</p>
    <form onSubmit={event => { event.preventDefault(); void submit(); }} aria-busy={mutation.isPending}>
      {feedback ? <p className="error" role="alert">{feedback}</p> : null}
      <div className="actions">
        <button type="submit" className="button" disabled={mutation.isPending}>{mutation.isPending ? "Cancelando…" : "Confirmar cancelación"}</button>
        <button type="button" className="button secondary" disabled={mutation.isPending} onClick={onClose}>Volver</button>
      </div>
    </form>
  </section>;
}
