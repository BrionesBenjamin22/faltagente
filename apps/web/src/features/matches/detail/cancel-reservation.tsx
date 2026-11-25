"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { useSession } from "@/features/auth/session";
import { ApiError, errorMessage } from "@/lib/http";
import { useCancelReservation } from "./use-reservations";
import type { Reservation } from "./reservations-service";
import styles from "./match-detail.module.css";

const reasonSchema = z.string().trim().max(500, "El motivo puede tener hasta 500 caracteres. Acortalo e intentá nuevamente.");

export function CancelReservation({ reservation, userId, organizerId, onClose, onCancelled }: { reservation: Reservation; userId: string; organizerId: string; onClose: () => void; onCancelled: () => void }) {
  const mutation = useCancelReservation(userId, reservation.matchId, organizerId);
  const { register, handleSubmit, formState: { errors }, setError } = useForm<{ reason: string }>({ defaultValues: { reason: "" } });
  const [feedback, setFeedback] = useState("");
  const heading = useRef<HTMLHeadingElement>(null);
  const submitting = useRef(false);
  const session = useSession();
  useEffect(() => heading.current?.focus(), []);
  async function submit({ reason }: { reason: string }) {
    if (submitting.current) return;
    const parsed = reasonSchema.safeParse(reason);
    if (!parsed.success) { setError("reason", { message: parsed.error.issues[0].message }); return; }
    submitting.current = true;
    setFeedback("");
    try {
      await mutation.mutateAsync({ reservationId: reservation.id, reason: parsed.data || undefined });
      onCancelled();
    } catch (error) {
      setFeedback(errorMessage(error));
      if (error instanceof ApiError && error.status === 401) await session.synchronize();
    } finally { submitting.current = false; }
  }
  return <section className={styles.section} aria-labelledby="cancel-reservation-heading">
    <h2 id="cancel-reservation-heading" tabIndex={-1} ref={heading}>Cancelar reserva</h2>
    <p>{reservation.places === 1 ? "Se liberará 1 lugar." : `Se liberarán ${reservation.places} lugares, incluidos tus acompañantes.`} Podés volver a inscribirte si hay disponibilidad.</p>
    <form onSubmit={event => void handleSubmit(submit)(event)} aria-busy={mutation.isPending}>
      <div className="field">
        <label htmlFor="reservation-cancel-reason">Motivo de cancelación (opcional)</label>
        <textarea id="reservation-cancel-reason" className={styles.reservationTextarea} placeholder="Contá por qué cancelás tu reserva" maxLength={500} disabled={mutation.isPending} aria-invalid={!!errors.reason} aria-describedby={errors.reason ? "reservation-cancel-help reservation-cancel-error" : "reservation-cancel-help"} {...register("reason")} />
        <p id="reservation-cancel-help" className="muted">Hasta 500 caracteres. El motivo sólo lo podés consultar vos.</p>
        {errors.reason ? <p id="reservation-cancel-error" className="error" role="alert">{errors.reason.message}</p> : null}
      </div>
      {feedback ? <p className="error" role="alert">{feedback}</p> : null}
      <div className="actions">
        <button type="submit" className="button" disabled={mutation.isPending}>{mutation.isPending ? "Cancelando…" : "Confirmar cancelación"}</button>
        <button type="button" className="button secondary" disabled={mutation.isPending} onClick={onClose}>Volver</button>
      </div>
    </form>
  </section>;
}
