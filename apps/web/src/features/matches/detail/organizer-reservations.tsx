"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { ApiError, errorMessage } from "@/lib/http";
import { useSession } from "@/features/auth/session";
import { useOrganizerReservations, useOrganizerCancelReservation } from "./use-reservations";
import { reservationReasonSchema } from "./reservation-validation";
import { QuantityManagement } from "./quantity-management";
import type { OrganizerReservation } from "./reservations-service";
import styles from "./match-detail.module.css";

export function OrganizerReservations({ userId, matchId, canCancel = false }: { userId: string; matchId: string; canCancel?: boolean }) {
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<OrganizerReservation | null>(null);
  const [action, setAction] = useState<"reduce" | "cancel">("cancel");
  const [feedback, setFeedback] = useState("");
  const result = useRef<HTMLParagraphElement>(null);
  const query = useOrganizerReservations(userId, matchId, page);
  useEffect(() => { if (feedback) result.current?.focus(); }, [feedback]);
  return <section className={styles.section} aria-labelledby="organizer-reservations-heading">
    <h2 id="organizer-reservations-heading">Reservas confirmadas</h2>
    {feedback ? <p className="notice" role="status" ref={result} tabIndex={-1}>{feedback}</p> : null}
    {query.isPending ? <p role="status">Cargando reservas confirmadas…</p> : query.isError ? <><p className="error" role="alert">{errorMessage(query.error)}</p><button type="button" className="button secondary" disabled={query.isFetching} onClick={() => void query.refetch()}>Reintentar reservas confirmadas</button></> : query.data.items.length ? <ul className="history-list">{query.data.items.map(reservation => <li key={reservation.id}>
      <p><strong>Titular: {reservation.holder.name}</strong></p><p>{reservation.places} {reservation.places === 1 ? "lugar reservado" : "lugares reservados"}</p>
      {canCancel ? <button type="button" id={`organizer-cancel-${reservation.id}`} className="button secondary" disabled={!!selected} onClick={() => { setAction("cancel"); setFeedback(""); setSelected(reservation); }}>Cancelar reserva de {reservation.holder.name}</button> : null}
      {canCancel && reservation.places > 1 ? <button type="button" id={`organizer-reduce-${reservation.id}`} className="button secondary" disabled={!!selected} onClick={() => { setAction("reduce"); setFeedback(""); setSelected(reservation); }}>Reducir lugares de {reservation.holder.name}</button> : null}
    </li>)}</ul> : <p>Todavía no hay reservas confirmadas.</p>}
    {selected && action === "cancel" ? <OrganizerReservationCancellation key={selected.id} reservation={selected} userId={userId} onClose={() => { const triggerId = `organizer-cancel-${selected.id}`; setSelected(null); requestAnimationFrame(() => document.getElementById(triggerId)?.focus()); }} onSuccess={() => { setSelected(null); setFeedback("Reserva cancelada correctamente."); }} onReload={async () => { const result = await query.refetch(); if (result.isError) throw result.error; }} /> : null}
    {selected && action === "reduce" ? <QuantityManagement key={selected.id} reservation={selected} userId={userId} organizerId={userId} isOrganizer onClose={() => { const triggerId = `organizer-reduce-${selected.id}`; setSelected(null); requestAnimationFrame(() => document.getElementById(triggerId)?.focus()); }} onSuccess={message => { setSelected(null); setFeedback(message); }} onReload={async () => { const result = await query.refetch(); if (result.isError) throw result.error; }} /> : null}
    {page > 1 || query.data?.items.length ? <nav className="actions" aria-label="Paginación de reservas confirmadas"><button type="button" className="button secondary" disabled={page === 1 || query.isFetching} onClick={() => setPage(current => current - 1)}>Anterior</button><span aria-live="polite">Página {page}</span><button type="button" className="button secondary" disabled={!query.data?.hasMore || query.isFetching || query.isError} onClick={() => setPage(current => current + 1)}>Siguiente</button></nav> : null}
  </section>;
}

export function OrganizerReservationCancellation({ reservation, userId, onClose, onSuccess, onReload }: { reservation: OrganizerReservation; userId: string; onClose: () => void; onSuccess: () => void; onReload: () => Promise<unknown> }) {
  const [snapshot] = useState(reservation);
  const [feedback, setFeedback] = useState("");
  const [conflict, setConflict] = useState(false);
  const [reloading, setReloading] = useState(false);
  const submitting = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const mutation = useOrganizerCancelReservation(userId, snapshot.matchId);
  const session = useSession();
  const { register, handleSubmit, setError, formState: { errors } } = useForm<{ reason: string }>({ defaultValues: { reason: "" } });
  useEffect(() => heading.current?.focus(), []);
  async function submit({ reason }: { reason: string }) {
    if (submitting.current || conflict) return;
    const parsed = reservationReasonSchema.safeParse(reason);
    if (!parsed.success) { setError("reason", { message: parsed.error.issues[0].message }, { shouldFocus: true }); return; }
    submitting.current = true;
    setFeedback("");
    try {
      await mutation.mutateAsync({ reservationId: snapshot.id, expectedVersion: snapshot.version, ...(parsed.data ? { reason: parsed.data } : {}) });
      onSuccess();
    } catch (error) {
      setFeedback(errorMessage(error));
      setConflict(error instanceof ApiError && error.status === 409);
      if (error instanceof ApiError && error.status === 401) await session.synchronize();
    } finally { submitting.current = false; }
  }
  async function reload() {
    setReloading(true);
    try { await onReload(); onClose(); }
    catch (error) { setFeedback(errorMessage(error)); }
    finally { setReloading(false); }
  }
  return <section className={styles.section} aria-labelledby="organizer-cancel-heading">
    <h3 id="organizer-cancel-heading" ref={heading} tabIndex={-1}>Cancelar reserva de {snapshot.holder.name}</h3>
    <p>Se liberarán {snapshot.places} {snapshot.places === 1 ? "lugar" : "lugares"}, incluido el del titular. Los lugares pueden asignarse inmediatamente a la lista de espera.</p>
    <form onSubmit={event => void handleSubmit(submit)(event)} aria-busy={mutation.isPending || reloading}>
      <div className="field"><label htmlFor="organizer-reservation-reason">Motivo de cancelación (opcional)</label><textarea id="organizer-reservation-reason" className={styles.reservationTextarea} placeholder="Contá por qué cancelás esta reserva" maxLength={500} disabled={mutation.isPending || conflict} aria-invalid={!!errors.reason} aria-describedby="organizer-reservation-reason-help" {...register("reason")} /><p id="organizer-reservation-reason-help" className="muted">Hasta 500 caracteres. El titular podrá consultarlo.</p>{errors.reason ? <p className="error" role="alert">{errors.reason.message}</p> : null}</div>
      {feedback ? <p className="error" role="alert">{feedback}</p> : null}
      {conflict ? <><p>La reserva cambió. Recargá y revisá sus lugares antes de continuar.</p><button type="button" className="button" disabled={reloading} onClick={() => void reload()}>{reloading ? "Recargando…" : "Recargar reservas"}</button></> : <button type="submit" className="button" disabled={mutation.isPending}>{mutation.isPending ? "Cancelando…" : "Confirmar cancelación de reserva"}</button>}
      <button type="button" className="button secondary" disabled={mutation.isPending || reloading} onClick={onClose}>Volver</button>
    </form>
  </section>;
}
