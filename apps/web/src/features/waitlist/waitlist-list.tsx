"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { errorMessage } from "@/lib/http";
import { matchDateFormat } from "@/features/matches/format";
import { waitlistService } from "./service";
import type { EntryStatus } from "./types";
import styles from "./waitlist.module.css";

const statusText: Record<EntryStatus, string> = { WAITING: "En espera", OFFERED: "Oferta pendiente de respuesta", COMPLETED: "Solicitud finalizada", LEFT: "Solicitud retirada", EXPIRED: "Solicitud vencida", INVALIDATED: "Solicitud sin vigencia" };

export function OrganizerWaitlist({ id, userId }: { id: string; userId: string }) {
  const [page, setPage] = useState(1);
  const query = useQuery({ queryKey: ["waitlist", "organizer", userId, id, page], queryFn: () => waitlistService.organizer(id, page), retry: false, refetchOnWindowFocus: true, refetchInterval: 10_000 });
  return <section className={styles.panel} aria-labelledby="organizer-waitlist-heading"><h2 id="organizer-waitlist-heading">Lista de espera del partido</h2><p className="muted">Las ofertas se asignan automáticamente a la solicitud que mejor aprovecha los lugares libres; ante empate, a la más antigua.</p>
    {query.isPending ? <p role="status">Cargando lista de espera…</p> : query.isError ? <><p className="error" role="alert">{errorMessage(query.error)}</p><button className="button secondary" disabled={query.isFetching} onClick={() => void query.refetch()}>Reintentar lista del partido</button></> : <>
      {!query.data.items.length ? <p>No hay solicitudes activas en esta página.</p> : <ul className={styles.list}>{query.data.items.map(entry => <li key={entry.id}><strong>{entry.user.name}</strong><p>{entry.places} {entry.places === 1 ? "lugar solicitado" : "lugares solicitados"}. {statusText[entry.status]}.</p></li>)}</ul>}
      {query.data.total > 0 || page > 1 ? <Pagination page={page} hasMore={query.data.hasMore} onPage={setPage} label="Páginas de la lista de espera del partido" /> : null}
    </>}
  </section>;
}

export function MyWaitlist({ userId }: { userId: string }) {
  const [page, setPage] = useState(1);
  const query = useQuery({ queryKey: ["waitlist", "lists", userId, page], queryFn: () => waitlistService.lists(page), retry: false, staleTime: 0, refetchOnWindowFocus: true, refetchInterval: 10_000 });
  return <section aria-label="Mis listas de espera">
    {query.isPending ? <p role="status">Cargando tus listas de espera…</p> : query.isError ? <><p role="alert" className="error">{errorMessage(query.error)}</p><button className="button secondary" disabled={query.isFetching} onClick={() => void query.refetch()}>Reintentar mis listas de espera</button></> : <>
      {!query.data.items.length ? <><p>No tenés solicitudes activas en esta página.</p><Link className="button secondary" href="/partidos">Buscar partidos</Link></> : <><p className="muted">{query.data.total} {query.data.total === 1 ? "solicitud" : "solicitudes"}</p><ul className={styles.list}>{query.data.items.map(entry => <li key={entry.id}><h2><Link href={`/partidos/${entry.matchId}`}>{entry.match.venueName}</Link></h2><p>{entry.match.sport.name}{entry.match.sportFormat ? `, ${entry.match.sportFormat.name}` : ""}. {entry.match.location.name}.</p><time dateTime={entry.match.startsAt}>{matchDateFormat.format(new Date(entry.match.startsAt))}</time><p>{entry.places} {entry.places === 1 ? "lugar solicitado" : "lugares solicitados"}.</p>{entry.status === "OFFERED" && entry.offer ? <p className="notice">Tenés una oferta. Revisá el detalle para responder antes de que venza.</p> : <p className="muted">{statusText[entry.status]}.</p>}<Link className="button secondary" href={`/partidos/${entry.matchId}`}>{entry.status === "OFFERED" ? "Ver oferta" : "Ver solicitud"}</Link></li>)}</ul></>}
      {query.data.total > 0 || page > 1 ? <Pagination page={page} hasMore={query.data.hasMore} onPage={setPage} label="Páginas de mis listas de espera" /> : null}
    </>}
  </section>;
}
function Pagination({ page, hasMore, onPage, label }: { page: number; hasMore: boolean; onPage: (page: number) => void; label: string }) {
  return <nav className="actions" aria-label={label}><button type="button" className="button secondary" disabled={page === 1} onClick={() => onPage(page - 1)}>Anterior</button><span>Página {page}</span><button type="button" className="button secondary" disabled={!hasMore} onClick={() => onPage(page + 1)}>Siguiente</button></nav>;
}
