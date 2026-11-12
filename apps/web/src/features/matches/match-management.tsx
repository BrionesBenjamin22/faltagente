"use client";

import { useState } from "react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/features/auth/session";
import { ApiError, errorMessage } from "@/lib/http";
import { matchesService } from "./service";

const auditDate = new Intl.DateTimeFormat("es-AR", { dateStyle: "medium", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" });
const retry = (attempt: number, error: Error) => !(error instanceof ApiError && error.status < 500) && attempt < 1;

export function MatchManagement({ id, organizerId }: { id: string; organizerId: string }) {
  const session = useSession();
  if (!session.session?.authenticated || session.session.user?.id !== organizerId) return null;
  return <OrganizerManagement key={`${session.session.user.id}:${id}`} id={id} ownerId={session.session.user.id} />;
}

function OrganizerManagement({ id, ownerId }: { id: string; ownerId: string }) {
  const [page, setPage] = useState(1);
  const management = useQuery({ queryKey: ["match-management", ownerId, id], queryFn: () => matchesService.management(id), retry });
  const history = useQuery({ queryKey: ["match-history", ownerId, id, page], queryFn: () => matchesService.history(id, page), retry });
  return <>
    <div className="actions mt-6"><Link href="/mis-partidos" className="button secondary">Mis partidos</Link></div>
    <section className="panel glass mt-6" aria-labelledby="match-audit"><h2 id="match-audit">Auditoría</h2>
      {management.isPending ? <p role="status">Cargando auditoría…</p> : management.isError ? <><p className="error" role="alert">{errorMessage(management.error)}</p><button type="button" className="button secondary" onClick={() => void management.refetch()}>Reintentar auditoría</button></> : <dl className="audit-data">
        <dt>Publicado</dt><dd><time dateTime={management.data.createdAt}>{auditDate.format(new Date(management.data.createdAt))}</time></dd>
        <dt>Última actualización</dt><dd><time dateTime={management.data.updatedAt}>{auditDate.format(new Date(management.data.updatedAt))}</time></dd>
        <dt>Versión</dt><dd>{management.data.version}</dd>
        <dt>Lugares ofrecidos a jugadores</dt><dd>{management.data.totalPlaces}</dd>
      </dl>}
    </section>
    <section className="panel glass" aria-labelledby="match-history"><h2 id="match-history">Historial de cambios</h2>
      {history.isPending ? <p role="status">Cargando historial…</p> : history.isError ? <><p className="error" role="alert">{errorMessage(history.error)}</p><button type="button" className="button secondary" onClick={() => void history.refetch()}>Reintentar historial</button></> : history.data.items.length === 0 ? <p>Todavía no hay eventos registrados.</p> : <>
        <ul className="history-list">{history.data.items.map(item => <li key={item.id}><time dateTime={item.occurredAt}>{auditDate.format(new Date(item.occurredAt))}</time><p>Partido publicado</p><p className="muted">Por {item.actor.name}</p></li>)}</ul>
        <div className="actions"><button type="button" className="button secondary" disabled={page === 1} onClick={() => setPage(current => current - 1)}>Anterior</button><span>Página {page}</span><button type="button" className="button secondary" disabled={!history.data.hasMore} onClick={() => setPage(current => current + 1)}>Siguiente</button></div>
      </>}
    </section>
  </>;
}
