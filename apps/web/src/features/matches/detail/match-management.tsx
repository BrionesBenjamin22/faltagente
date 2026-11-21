"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/features/auth/session";
import { ApiError, errorMessage } from "@/lib/http";
import { matchesService } from "../service";
import { CancelMatchPanel } from "./cancel-match";
import { HistoryChanges } from "./history-changes";

const auditDate = new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" });
const retry = (attempt: number, error: Error) => !(error instanceof ApiError && error.status < 500) && attempt < 1;

export function MatchManagement({ id, organizerId }: { id: string; organizerId: string }) {
  const session = useSession();
  if (!session.session?.authenticated || session.session.user?.id !== organizerId) return null;
  return <OrganizerManagement key={`${session.session.user.id}:${id}`} id={id} ownerId={session.session.user.id} />;
}

function OrganizerManagement({ id, ownerId }: { id: string; ownerId: string }) {
  const [page, setPage] = useState(1);
  const [cancelling, setCancelling] = useState(false);
  const [cancelled, setCancelled] = useState(false);
  const cancelButton = useRef<HTMLButtonElement>(null);
  const restoreFocus = useRef(false);
  const result = useRef<HTMLParagraphElement>(null);
  const management = useQuery({ queryKey: ["match-management", ownerId, id], queryFn: () => matchesService.management(id), retry });
  const history = useQuery({ queryKey: ["match-history", ownerId, id, page], queryFn: () => matchesService.history(id, page), retry });
  useEffect(() => { if (cancelled) result.current?.focus(); }, [cancelled]);
  useEffect(() => { if (!cancelling && restoreFocus.current) { cancelButton.current?.focus(); restoreFocus.current = false; } }, [cancelling]);
  return <>
    {cancelled ? <p className="notice" role="status" ref={result} tabIndex={-1}>Partido cancelado correctamente</p> : null}
    <div className="actions mt-6"><Link href="/mis-partidos" className="button secondary">Mis partidos</Link>{management.data?.canEdit ? <Link className="button" href={`/partidos/${id}/editar`}>Editar</Link> : null}{management.data?.canCancel ? <button ref={cancelButton} type="button" className="button secondary" disabled={cancelling} onClick={() => setCancelling(true)}>Cancelar partido</button> : null}</div>
    {management.data?.hasConfirmedParticipants && management.data.canEdit ? <p className="muted">Con participantes confirmados o lugares ocupados, sólo podés editar descripción y capacidad. La cancelación estará disponible al integrar las reservas.</p> : null}
    {cancelling && management.data ? <CancelMatchPanel initial={management.data} ownerId={ownerId} onClose={() => { restoreFocus.current = true; setCancelling(false); }} onCancelled={() => { setCancelling(false); setCancelled(true); setPage(1); }} /> : null}
    <section className="panel glass mt-6" aria-labelledby="match-audit"><h2 id="match-audit">Auditoría</h2>
      {management.isPending ? <p role="status">Cargando auditoría…</p> : management.isError ? <><p className="error" role="alert">{errorMessage(management.error)}</p><button type="button" className="button secondary" onClick={() => void management.refetch()}>Reintentar auditoría</button></> : <dl className="audit-data">
        <dt>Publicado</dt><dd><time dateTime={management.data.createdAt}>{auditDate.format(new Date(management.data.createdAt))}</time></dd>
        <dt>Última actualización</dt><dd><time dateTime={management.data.updatedAt}>{auditDate.format(new Date(management.data.updatedAt))}</time></dd>
        <dt>Versión</dt><dd>{management.data.version}</dd>
        <dt>Lugares ofrecidos a jugadores</dt><dd>{management.data.totalPlaces}</dd>
        {management.data.cancelledAt ? <><dt>Cancelado</dt><dd><time dateTime={management.data.cancelledAt}>{auditDate.format(new Date(management.data.cancelledAt))}</time></dd></> : null}
        {management.data.cancellationReason ? <><dt>Motivo de cancelación</dt><dd>{management.data.cancellationReason}</dd></> : null}
      </dl>}
    </section>
    <section className="panel glass" aria-labelledby="match-history"><h2 id="match-history">Historial de cambios</h2>
      {history.isPending ? <p role="status">Cargando historial…</p> : history.isError ? <><p className="error" role="alert">{errorMessage(history.error)}</p><button type="button" className="button secondary" onClick={() => void history.refetch()}>Reintentar historial</button></> : history.data.items.length === 0 ? <p>Todavía no hay eventos registrados.</p> : <>
        <ul className="history-list">{history.data.items.map(item => <li key={item.id}><time dateTime={item.occurredAt}>{auditDate.format(new Date(item.occurredAt))}</time><HistoryChanges item={item} /><p className="muted">Por {item.actor.name}</p></li>)}</ul>
        <div className="actions"><button type="button" className="button secondary" disabled={page === 1} onClick={() => setPage(current => current - 1)}>Anterior</button><span>Página {page}</span><button type="button" className="button secondary" disabled={!history.data.hasMore} onClick={() => setPage(current => current + 1)}>Siguiente</button></div>
      </>}
    </section>
  </>;
}
