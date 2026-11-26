"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { useSession } from "@/features/auth/session";
import { ApiError, errorMessage } from "@/lib/http";
import type { Reservation } from "./reservations-service";
import { useUpdateReservationPlaces } from "./use-reservations";
import { reservationReasonSchema, retainedPlacesSchema } from "./reservation-validation";
import { MAX_RESERVATION_PLACES } from "../reservation-limits";
import styles from "./match-detail.module.css";

export function QuantityManagement({ reservation, userId, organizerId, isOrganizer = false, onClose, onSuccess, onReload }: { reservation: Reservation; userId: string; organizerId: string; isOrganizer?: boolean; onClose: () => void; onSuccess: (message: string) => void; onReload: () => Promise<unknown> }) {
  const [snapshot] = useState(reservation);
  const [confirmation, setConfirmation] = useState<{ places: number; reason?: string } | null>(null);
  const [feedback, setFeedback] = useState("");
  const [conflict, setConflict] = useState(false);
  const [reloading, setReloading] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const submitting = useRef(false);
  const mutation = useUpdateReservationPlaces(userId, snapshot.matchId, organizerId, isOrganizer);
  const session = useSession();
  const { register, handleSubmit, setError, formState: { errors } } = useForm<{ places: number; reason: string }>({ defaultValues: { places: snapshot.places, reason: "" } });
  useEffect(() => heading.current?.focus(), [confirmation]);
  async function submit(values: { places: number; reason: string }) {
    if (submitting.current || conflict) return;
    setFeedback("");
    const places = retainedPlacesSchema(snapshot.places).safeParse(confirmation?.places ?? values.places);
    if (!places.success) { setError("places", { message: places.error.issues[0].message }, { shouldFocus: true }); return; }
    if (places.data === snapshot.places) { onSuccess("No hay cambios para guardar."); return; }
    const reason = isOrganizer ? reservationReasonSchema.safeParse(confirmation?.reason ?? values.reason) : { success: true as const, data: "" };
    if (!reason.success) { setError("reason", { message: reason.error.issues[0].message }, { shouldFocus: true }); return; }
    if (!confirmation) { setConfirmation({ places: places.data, ...(reason.data ? { reason: reason.data } : {}) }); return; }
    submitting.current = true;
    try {
      await mutation.mutateAsync({ reservationId: snapshot.id, expectedVersion: snapshot.version, ...confirmation });
      onSuccess("Lugares reducidos correctamente.");
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
  return <section className={styles.section} aria-labelledby="reduce-reservation-heading">
    <h3 id="reduce-reservation-heading" ref={heading} tabIndex={-1}>{confirmation ? "Confirmar reducción" : "Reducir lugares"}</h3>
    <form noValidate onSubmit={event => void handleSubmit(submit)(event)} aria-busy={mutation.isPending || reloading}>
      <p>La reserva conserva siempre el lugar del titular. Para darlo de baja, cancelá toda la reserva.</p>
      <div className="field"><label htmlFor="retained-places">Lugares a conservar</label><input id="retained-places" type="number" min={1} max={Math.min(snapshot.places, MAX_RESERVATION_PLACES)} step={1} disabled={mutation.isPending || !!confirmation || conflict} aria-invalid={!!errors.places} aria-describedby={errors.places ? "retained-places-error" : undefined} {...register("places", { valueAsNumber: true })} />{errors.places ? <p className="error" role="alert" id="retained-places-error">{errors.places.message}</p> : null}</div>
      {isOrganizer ? <div className="field"><label htmlFor="reduction-reason">Motivo de la reducción (opcional)</label><textarea id="reduction-reason" className={styles.reservationTextarea} maxLength={500} placeholder="Contá por qué reducís estos lugares" disabled={mutation.isPending || !!confirmation || conflict} aria-invalid={!!errors.reason} {...register("reason")} /><p className="muted">Hasta 500 caracteres. El titular podrá consultarlo.</p>{errors.reason ? <p className="error" role="alert">{errors.reason.message}</p> : null}</div> : null}
      {confirmation ? <div className="notice"><p>Se liberarán {snapshot.places - confirmation.places} {snapshot.places - confirmation.places === 1 ? "lugar" : "lugares"}. La reserva conservará {confirmation.places} {confirmation.places === 1 ? "lugar" : "lugares"}, incluido el del titular.</p><p>Los lugares pueden asignarse inmediatamente a la lista de espera.</p>{confirmation.reason ? <p>Motivo: {confirmation.reason}</p> : null}</div> : null}
      {feedback ? <p className="error" role="alert">{feedback}</p> : null}
      {conflict ? <><p>La reserva cambió. Recargá y revisá sus lugares antes de continuar.</p><button type="button" className="button" disabled={reloading} onClick={() => void reload()}>{reloading ? "Recargando…" : "Recargar reserva"}</button></> : <button type="submit" className="button" disabled={mutation.isPending}>{mutation.isPending ? "Guardando…" : confirmation ? "Confirmar reducción" : "Revisar reducción"}</button>}
      <div className="actions">{confirmation && !conflict ? <button type="button" className="button secondary" disabled={mutation.isPending} onClick={() => setConfirmation(null)}>Cambiar cantidad</button> : null}<button type="button" className="button secondary" disabled={mutation.isPending || reloading} onClick={onClose}>Volver</button></div>
    </form>
  </section>;
}
