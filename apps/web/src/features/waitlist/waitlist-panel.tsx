"use client";

import { useEffect, useRef, useState } from "react";
import { useForm } from "react-hook-form";
import { errorMessage } from "@/lib/http";
import { useOwnWaitlist, useWaitlistAction } from "./hooks";
import { waitlistPlacesSchema } from "./validation";
import type { WaitlistEntry } from "./types";
import { MAX_RESERVATION_PLACES } from "@/features/matches/reservation-limits";
import styles from "./waitlist.module.css";

export function WaitlistPanel({ id, userId, canJoin, maximum }: { id: string; userId: string; canJoin: boolean; maximum: number }) {
  const query = useOwnWaitlist(userId, id);
  const mutation = useWaitlistAction(id);
  const [confirm, setConfirm] = useState<"leave" | "reject" | null>(null);
  const [feedback, setFeedback] = useState("");
  const result = useRef<HTMLParagraphElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  const { register, handleSubmit, setError, clearErrors, formState: { errors } } = useForm<{ places: number }>({ defaultValues: { places: 1 } });
  useEffect(() => { if (feedback) result.current?.focus(); }, [feedback]);
  useEffect(() => { if (!confirm && restoreFocus.current) { trigger.current?.focus(); restoreFocus.current = false; } }, [confirm]);
  const entry = query.data;
  const active = entry?.status === "WAITING" || entry?.status === "OFFERED";
  async function act(action: Parameters<typeof mutation.mutateAsync>[0], success: string) {
    if (mutation.isPending) return;
    setFeedback("");
    try { await mutation.mutateAsync(action); setConfirm(null); setFeedback(success); }
    catch { /* Mutation error remains visible with the current request and retry controls. */ }
  }
  if (query.isPending) return <p role="status">Consultando lista de espera…</p>;
  if (query.isError) return <div className={styles.panel}><p className="error" role="alert">{errorMessage(query.error)}</p><button type="button" className="button secondary" disabled={query.isFetching} onClick={() => void query.refetch()}>Reintentar lista de espera</button></div>;
  if (!active && !canJoin && !entry && !feedback) return null;
  return <section className={styles.panel} aria-labelledby="waitlist-heading" aria-busy={mutation.isPending}>
    <h2 id="waitlist-heading">Lista de espera</h2>
    {feedback ? <p className="notice" role="status" tabIndex={-1} ref={result}>{feedback}</p> : null}
    {active && entry ? <>
      {entry.status === "OFFERED" && entry.offer ? <>
        <h3>Tenés una oferta</h3>
        <p>{entry.places} {entry.places === 1 ? "lugar protegido para vos" : "lugares protegidos para vos y tus acompañantes"}. Aceptá antes del vencimiento para confirmar tu reserva.</p>
        <OfferCountdown expiresAt={entry.offer.expiresAt} />
        <div className="actions">
          <AcceptOffer expiresAt={entry.offer.expiresAt} disabled={mutation.isPending || !!confirm} onAccept={() => void act({ kind: "accept", offerId: entry.offer!.id }, "Oferta aceptada. Reserva confirmada correctamente")} />
          <button type="button" className="button secondary" ref={trigger} disabled={mutation.isPending || !!confirm} onClick={() => { mutation.reset(); setConfirm("reject"); }}>Rechazar oferta</button>
        </div>
      </> : <><p>Estás en espera por {entry.places} {entry.places === 1 ? "lugar" : "lugares"}.</p><p className="muted">Si se libera un cupo compatible, tendrás hasta 15 minutos para aceptar. Consultá esta pantalla o «En espera» en Mis partidos.</p></>}
      {entry.status === "WAITING" ? <button type="button" className="button secondary" ref={trigger} disabled={mutation.isPending || !!confirm} onClick={() => { mutation.reset(); setConfirm("leave"); }}>Salir de la lista</button> : null}
      {confirm ? <ConfirmExit key={`${entry.id}:${confirm}`} kind={confirm} busy={mutation.isPending} onCancel={() => { restoreFocus.current = true; setConfirm(null); }} onConfirm={() => void act(confirm === "leave" ? { kind: "leave", entryId: entry.id } : { kind: "reject", offerId: entry.offer!.id }, confirm === "leave" ? "Saliste de la lista de espera correctamente" : "Oferta rechazada correctamente")} /> : null}
    </> : <>
      {entry ? <p>{terminalMessage(entry)}</p> : null}
      {canJoin ? <form noValidate onSubmit={handleSubmit(({ places }) => {
        const parsed = waitlistPlacesSchema(maximum).safeParse(places);
        if (!parsed.success) { setError("places", { message: parsed.error.issues[0].message }, { shouldFocus: true }); return; }
        void act({ kind: "join", places: parsed.data }, "Entraste en la lista de espera correctamente");
      })}>
        <p>El partido está completo.</p><p>Solicitá los lugares que necesitás; entrar en la lista todavía no confirma una reserva.</p>
        <div className={styles.quantity}><label htmlFor="waitlist-places">Cantidad de lugares en espera</label><input id="waitlist-places" type="number" min={1} max={Math.min(MAX_RESERVATION_PLACES, maximum)} step={1} disabled={mutation.isPending} aria-invalid={!!errors.places} aria-describedby={errors.places ? "waitlist-places-error" : undefined} {...register("places", { valueAsNumber: true, onChange: () => { clearErrors("places"); mutation.reset(); } })} /></div>
        {errors.places ? <p className="error" id="waitlist-places-error" role="alert">{errors.places.message}</p> : null}
        <button type="submit" className="button" disabled={mutation.isPending}>{mutation.isPending ? "Ingresando…" : "Entrar en lista de espera"}</button>
      </form> : null}
    </>}
    {mutation.isError ? <p className="error" role="alert">{errorMessage(mutation.error)}</p> : null}
  </section>;
}

function terminalMessage(entry: WaitlistEntry) {
  if (entry.offer?.status === "REJECTED") return "Rechazaste la oferta. Si el partido sigue completo, podés volver a entrar con una nueva solicitud.";
  if (entry.status === "EXPIRED" && !entry.offer) return "Tu solicitud terminó porque el partido ya comenzó.";
  if (entry.status === "EXPIRED" || entry.offer?.status === "EXPIRED") return "Tu solicitud terminó porque la oferta venció. Si el partido sigue completo, podés volver a entrar con una nueva solicitud.";
  if (entry.status === "LEFT") return "Ya no estás en esta lista de espera.";
  if (entry.offer?.status === "ACCEPTED") return "Tu oferta fue aceptada. Consultá tu reserva en Mis partidos.";
  return "Tu solicitud ya no está activa. El partido cambió o ya tenés una participación confirmada en esa fecha.";
}

function useRemaining(expiresAt: string) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { const timer = setInterval(() => setNow(Date.now()), 1_000); return () => clearInterval(timer); }, []);
  return Math.max(0, Math.ceil((Date.parse(expiresAt) - now) / 1_000));
}
function OfferCountdown({ expiresAt }: { expiresAt: string }) {
  const seconds = useRemaining(expiresAt);
  return <p className={styles.deadline}>{seconds ? <>Tiempo restante: <span role="timer" aria-live="off">{Math.floor(seconds / 60)}:{String(seconds % 60).padStart(2, "0")}</span>. Vence a las <time dateTime={expiresAt}>{new Intl.DateTimeFormat("es-AR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(expiresAt))}</time>.</> : "El plazo de la oferta terminó. Estamos actualizando su estado."}</p>;
}
function AcceptOffer({ expiresAt, disabled, onAccept }: { expiresAt: string; disabled: boolean; onAccept: () => void }) {
  const seconds = useRemaining(expiresAt);
  return <button type="button" className="button" disabled={disabled || seconds === 0} onClick={onAccept}>Aceptar oferta</button>;
}
function ConfirmExit({ kind, busy, onCancel, onConfirm }: { kind: "leave" | "reject"; busy: boolean; onCancel: () => void; onConfirm: () => void }) {
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => heading.current?.focus(), []);
  return <section className="notice" aria-labelledby="waitlist-confirm-heading"><h3 id="waitlist-confirm-heading" ref={heading} tabIndex={-1}>{kind === "leave" ? "¿Salir de la lista de espera?" : "¿Rechazar la oferta?"}</h3><p>Tu solicitud finalizará. Si volvés a entrar, tendrás una nueva antigüedad.</p><div className="actions"><button type="button" className="button" disabled={busy} onClick={onConfirm}>{busy ? "Procesando…" : kind === "leave" ? "Confirmar salida" : "Confirmar rechazo"}</button><button type="button" className="button secondary" disabled={busy} onClick={onCancel}>{kind === "leave" ? "Seguir en espera" : "Mantener oferta"}</button></div></section>;
}
