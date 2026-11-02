"use client";
import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useInfiniteQuery, useQuery, useQueryClient, type InfiniteData } from "@tanstack/react-query";
import { useSession } from "@/features/auth/session";
import { authService } from "@/features/auth/service";
import { useLocations } from "@/features/locations/hooks";
import { errorMessage } from "@/lib/http";
import { matchesService, type MatchFilters, type MatchPage } from "./service";
import { Landing } from "@/features/landing/landing";
import { DiscoveryFilters } from "./discovery-filters";
import { parseDiscovery, useDiscoverySearch, writeDiscovery } from "./discovery-state";
import { EmptyState } from "@/components/ui/empty-state";
import { SessionLoading } from "@/features/auth/session-loading";
import { MatchesLoading } from "./matches-loading";
import { MatchCard } from "./match-card";
import styles from "./discovery-filters.module.css";

export function Home({ success, discovery = false }: { success?: string; discovery?: boolean }) {
  const session = useSession(); const router = useRouter();
  useEffect(() => { if (session.session?.authenticated && !session.session.user?.primaryLocation) router.replace("/auth/location"); }, [session.session, router]);
  if (session.isPending) return <SessionLoading />;
  if (session.isError) return <><p role="alert">{errorMessage(session.error)}</p><button className="button" onClick={() => void session.refetch()}>Reintentar</button></>;
  if (session.session?.authenticated && !session.session.user?.primaryLocation) return <p role="status">Vamos a configurar su localidad…</p>;
  if (!session.session?.authenticated && !discovery) return <Landing />;
  return <HomeList key={session.session?.user?.id ?? "visitor"} success={success} />;
}
function HomeList({ success }: { success?: string }) {
  const [feedback, setFeedback] = useState("");
  const [sending, setSending] = useState(false);
  const session = useSession(); const locations = useLocations();
  const [initialLocation] = useState(session.selectedHomeLocation);
  const client = useQueryClient();
  const search = useDiscoverySearch();
  const { locationId, ...filters } = parseDiscovery(search);
  const selected = locationId ?? initialLocation;
  const filtered = !!(filters.sportId || filters.date);
  useEffect(() => {
    if (!locationId && initialLocation) writeDiscovery({ ...parseDiscovery(window.location.search), locationId: initialLocation }, true);
  }, [locationId, initialLocation]);
  const matches = useInfiniteQuery({ queryKey: ["matches", selected, filters.sportId, filters.sportFormatId, filters.date], queryFn: ({ pageParam }) => matchesService.list(selected, pageParam, filters), initialPageParam: 1, getNextPageParam: last => last.hasMore ? last.page + 1 : undefined, enabled: !!selected });
  // Only consult the baseline when needed to distinguish an empty zone from empty filters.
  const baseline = useQuery({ queryKey: ["matches-baseline", selected], queryFn: () => matchesService.list(selected, 1), enabled: !!selected && filtered && matches.data?.pages[0].total === 0 });
  function resetPages(location: string, next: MatchFilters) {
    const queryKey = ["matches", location, next.sportId, next.sportFormatId, next.date];
    void client.cancelQueries({ queryKey, exact: true });
    client.setQueryData<InfiniteData<MatchPage>>(queryKey, data => data ? { pages: data.pages.slice(0, 1), pageParams: data.pageParams.slice(0, 1) } : data);
  }
  useEffect(() => {
    function resetHistoryPages() {
      const next = parseDiscovery(window.location.search);
      const queryKey = ["matches", next.locationId ?? initialLocation, next.sportId, next.sportFormatId, next.date];
      void client.cancelQueries({ queryKey, exact: true });
      client.setQueryData<InfiniteData<MatchPage>>(queryKey, data => data ? { pages: data.pages.slice(0, 1), pageParams: data.pageParams.slice(0, 1) } : data);
    }
    window.addEventListener("popstate", resetHistoryPages);
    return () => window.removeEventListener("popstate", resetHistoryPages);
  }, [client, initialLocation]);
  function changeFilters(next: MatchFilters) { resetPages(selected, next); writeDiscovery({ ...next, locationId: selected || undefined }); }
  function changeLocation(next: string) { resetPages(next, filters); session.selectHomeLocation(next); writeDiscovery({ ...filters, locationId: next }); }
  const locality = locations.data?.find(location => location.id === selected)?.name ?? session.session?.user?.primaryLocation?.name;
  const messages: Record<string, string> = { registered: "Cuenta creada correctamente.", login: "Sesión iniciada correctamente.", location: "Localidad guardada correctamente." };
  function openLocationSelector() {
    const control = document.getElementById("home-location");
    control?.focus();
    control?.click();
  }
  return <>{success && messages[success] ? <p className="notice" role="status">{messages[success]}</p> : null}
    <h1 className={styles.heading}>Partidos disponibles</h1><p className="muted">Encontrá un lugar para jugar cerca tuyo.</p>
    {session.session?.authenticated && session.session.user && !session.session.user.emailVerified ? <section className="notice"><p>Verificá tu email con el enlace que enviamos a tu correo.</p><button className="button secondary" disabled={sending} onClick={async () => { setSending(true); try { await authService.resendVerification(); setFeedback("Si corresponde, recibirá un nuevo enlace de verificación."); } catch (error) { setFeedback(errorMessage(error)); } finally { setSending(false); } }}>Reenviar enlace</button>{feedback ? <p role="status" className="mt-4">{feedback}</p> : null}</section> : null}
    <DiscoveryFilters filters={filters} locationId={selected} authenticated={!!session.session?.authenticated} onFilters={changeFilters} onLocation={changeLocation} showClear={matches.data?.pages[0].total !== 0} />
    {selected && !session.session?.authenticated ? <h2 className={styles.listingTitle}>Partidos en {locality ?? "tu localidad"}</h2> : null}
    {!selected ? <EmptyState title="Elegí dónde querés jugar" description="Seleccioná una localidad para ver los partidos." action={<button type="button" className="button secondary" onClick={openLocationSelector}>Elegir localidad</button>} /> : matches.isPending ? <MatchesLoading /> : matches.isError && !matches.data ? <><p className="error" role="alert">{errorMessage(matches.error)}</p><button className="button secondary" onClick={() => void matches.refetch()}>Reintentar partidos</button></> : <>
      {matches.data?.pages[0].total === 0 ? filtered && baseline.isPending ? <MatchesLoading /> : filtered && baseline.isError ? <><p className="error" role="alert">{errorMessage(baseline.error)}</p><button className="button secondary" onClick={() => void baseline.refetch()}>Reintentar partidos</button><button className="button secondary" onClick={() => changeFilters({})}>Limpiar filtros</button></> : <EmptyState title={filtered && baseline.data?.total !== 0 ? "No encontramos partidos con estos filtros." : "No hay partidos disponibles en esta zona."} description={filtered && baseline.data?.total !== 0 ? "Probá con otro deporte o fecha." : "Probá con otra localidad."} action={<>{filtered ? <button type="button" className="button secondary" onClick={() => changeFilters({})}>Limpiar filtros</button> : null}<button type="button" className="button secondary" onClick={openLocationSelector}>Cambiar localidad</button></>} /> : <div className="match-grid">{matches.data?.pages.flatMap(page => page.items).map(match => <MatchCard match={match} key={match.id} />)}</div>}
      {matches.isFetchNextPageError ? <p className="error" role="alert">{errorMessage(matches.error)} Vuelva a cargar más partidos.</p> : null}{matches.hasNextPage ? <button className="button secondary" disabled={matches.isFetchingNextPage} onClick={() => void matches.fetchNextPage()}>{matches.isFetchingNextPage ? "Cargando…" : "Cargar más partidos"}</button> : null}
    </>}
  </>;
}
