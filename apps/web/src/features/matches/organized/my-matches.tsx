"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import { useSession } from "@/features/auth/session";
import { SessionLoading } from "@/features/auth/session-loading";
import { EmptyState } from "@/components/ui/empty-state";
import { ApiError, errorMessage } from "@/lib/http";
import { matchesService } from "../service";
import type { OrganizedMatchFilter } from "../types";
import { MatchCard } from "../match-card";
import { MatchesLoading } from "../matches-loading";

const filters: { value: OrganizedMatchFilter; label: string }[] = [{ value: "upcoming", label: "Próximos" }, { value: "past", label: "Pasados" }, { value: "cancelled", label: "Cancelados" }];

export function MyMatchesScreen() {
  const session = useSession();
  const router = useRouter();
  const authenticated = !!session.session?.authenticated;
  useEffect(() => {
    if (!session.isPending && !session.isError && !authenticated) router.replace("/auth/login");
  }, [session.isPending, session.isError, authenticated, router]);
  if (session.isPending) return <SessionLoading />;
  if (session.isError) return <><p className="error" role="alert">{errorMessage(session.error)}</p><button type="button" className="button secondary" onClick={() => void session.refetch()}>Reintentar sesión</button></>;
  if (!authenticated) return <p role="status">Ingresá para consultar tus partidos.</p>;
  return <MyMatchesList key={session.session?.user?.id} ownerId={session.session?.user?.id ?? ""} />;
}

function MyMatchesList({ ownerId }: { ownerId: string }) {
  const [filter, setFilter] = useState<OrganizedMatchFilter>("upcoming");
  const [page, setPage] = useState(1);
  const session = useSession();
  const router = useRouter();
  const query = useQuery({ queryKey: ["organized-matches", ownerId, filter, page], queryFn: () => matchesService.organized(filter, page), retry: (attempt, error) => !(error instanceof ApiError && error.status < 500) && attempt < 1 });
  useEffect(() => {
    if (query.error instanceof ApiError && query.error.status === 401) {
      void session.synchronize();
      router.replace("/auth/login");
    }
  }, [query.error, router, session]);
  return <>
    <h1>Mis partidos</h1><p className="muted">Los partidos que organizás, en todas las localidades.</p>
    <div className="actions mb-6"><Link href="/partidos/nuevo" className="button">Publicar partido</Link><Link href="/partidos" className="button secondary">Volver a partidos</Link></div>
    <div className="actions mb-6" role="group" aria-label="Estado de mis partidos">{filters.map(item => <button key={item.value} type="button" className={`button${filter === item.value ? "" : " secondary"}`} aria-pressed={filter === item.value} onClick={() => { setFilter(item.value); setPage(1); }}>{item.label}</button>)}</div>
    {query.isPending ? <MatchesLoading /> : query.isError ? <><p className="error" role="alert">{errorMessage(query.error)}</p><button type="button" className="button secondary" onClick={() => void query.refetch()}>Reintentar mis partidos</button></> : query.data.items.length === 0 ? <EmptyState title={filter === "upcoming" ? "Todavía no tenés partidos próximos" : filter === "past" ? "Todavía no tenés partidos pasados" : "No tenés partidos cancelados"} description="Acá se muestran únicamente los partidos que organizás." action={<Link href="/partidos/nuevo" className="button secondary">Publicar partido</Link>} /> : <>
      <p className="muted">{query.data.total} {query.data.total === 1 ? "partido" : "partidos"}</p>
      <div className="match-grid">{query.data.items.map(match => <MatchCard key={match.id} match={match} />)}</div>
      <div className="actions"><button type="button" className="button secondary" disabled={page === 1} onClick={() => setPage(current => current - 1)}>Anterior</button><span>Página {page}</span><button type="button" className="button secondary" disabled={!query.data.hasMore} onClick={() => setPage(current => current + 1)}>Siguiente</button></div>
    </>}
  </>;
}
