"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useSession } from "@/features/auth/session";
import { ApiError, errorMessage } from "@/lib/http";
import { matchesService } from "../service";
import type { MatchManagement } from "../types";
import { useCancelMatch } from "../editing/use-match-mutations";
import styles from "../publication/create-match.module.css";

export function CancelMatchPanel({ initial, ownerId, onClose, onCancelled }: { initial: MatchManagement; ownerId: string; onClose: () => void; onCancelled: () => void }) {
  const [baseline, setBaseline] = useState(initial);
  const [reason, setReason] = useState("");
  const [feedback, setFeedback] = useState("");
  const [conflict, setConflict] = useState(false);
  const [reloading, setReloading] = useState(false);
  const [finished, setFinished] = useState(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const mutation = useCancelMatch(ownerId, baseline.id);
  const session = useSession();
  const router = useRouter();
  useEffect(() => heading.current?.focus(), []);
  const busy = mutation.isPending || reloading || finished;
  async function showError(error: unknown) {
    if (error instanceof ApiError && error.status === 401) { await session.synchronize(); router.replace("/auth/login"); }
    if (error instanceof ApiError && error.code === "MATCH_VERSION_CONFLICT") setConflict(true);
    setFeedback(errorMessage(error));
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (busy || conflict || !baseline.canCancel) return;
    if (reason.trim().length > 500) { setFeedback("El motivo puede tener hasta 500 caracteres. Acortalo e intentá nuevamente."); return; }
    setFeedback("");
    try {
      await mutation.mutateAsync({ expectedVersion: baseline.version, reason: reason.trim() });
      setFinished(true);
      onCancelled();
    } catch (error) {
      await showError(error);
    }
  }
  return <section className="panel glass mt-6" aria-labelledby="cancel-match-heading">
    <h2 id="cancel-match-heading" ref={heading} tabIndex={-1}>Cancelar partido</h2>
    <p>El partido dejará de aparecer entre los partidos disponibles. Se conservará en Mis partidos. Esta acción no se puede deshacer.</p>
    <p>Se cancelarán {baseline.activePlayerCount} {baseline.activePlayerCount === 1 ? "reserva confirmada" : "reservas confirmadas"} que ocupan {baseline.occupiedPlaces} {baseline.occupiedPlaces === 1 ? "lugar" : "lugares"}.</p>
    <form onSubmit={submit} aria-busy={busy}>
      <div className="field"><label htmlFor="cancel-reason">Motivo (opcional)</label><textarea id="cancel-reason" className={styles.textarea} placeholder="Contá por qué se cancela el partido" maxLength={500} value={reason} disabled={busy} onChange={event => setReason(event.target.value)} aria-describedby="cancel-reason-help" /><p id="cancel-reason-help" className="muted">Hasta 500 caracteres. Podrán consultarlo quienes tengan una reserva confirmada al cancelar el partido.</p></div>
      {feedback ? <p className="error" role="alert">{feedback}</p> : null}
      {conflict ? <div className="notice"><p>El partido cambió. Conservamos tu motivo. Recargá la versión actual para revisarla antes de confirmar.</p><button className="button secondary" type="button" disabled={busy} onClick={async () => {
        setReloading(true);
        try { const current = await matchesService.management(baseline.id); setBaseline(current); setConflict(false); setFeedback(current.canCancel ? "" : "Este partido ya no se puede cancelar. Volvé al detalle para consultar su estado."); }
        catch (error) { await showError(error); }
        finally { setReloading(false); }
      }}>Recargar versión actual</button></div> : null}
      <div className="actions"><button type="submit" className="button" disabled={busy || conflict || !baseline.canCancel}>{busy ? "Cancelando…" : "Confirmar cancelación"}</button><button type="button" className="button secondary" disabled={busy} onClick={onClose}>Volver</button></div>
    </form>
  </section>;
}
