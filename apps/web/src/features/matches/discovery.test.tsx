import { act, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { Providers } from "@/features/auth/session";
import { Home } from "./home";
import { localDate, parseDiscovery, validLocalDate } from "./discovery-state";

vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: vi.fn() }) }));
const location = { id: "10000000-0000-4000-8000-000000000001", name: "Tolosa", type: "LOCALIDAD" };
const otherLocation = { ...location, id: "10000000-0000-4000-8000-000000000002", name: "City Bell" };
const football = { id: "20000000-0000-4000-8000-000000000001", name: "Fútbol", slug: "futbol", formats: [{ id: "30000000-0000-4000-8000-000000000001", name: "Fútbol 5", slug: "futbol-5" }] };
const padel = { id: "20000000-0000-4000-8000-000000000002", name: "Pádel", slug: "padel", formats: [{ id: "30000000-0000-4000-8000-000000000002", name: "Dobles", slug: "dobles" }] };
const volley = { id: "20000000-0000-4000-8000-000000000003", name: "Vóley", slug: "voley", formats: [] };
let queries: URLSearchParams[];
let emptyFiltered: boolean; let emptyZone: boolean; let failSports: boolean; let failMatches: boolean;
let gate: Promise<void> | undefined;
beforeEach(() => {
  window.history.replaceState({}, "", "/partidos?success=login");
  queries = []; emptyFiltered = false; emptyZone = false; failSports = false; failMatches = false; gate = undefined;
  vi.stubGlobal("fetch", vi.fn(async (input: string) => {
    const url = new URL(input); let body: unknown;
    if (url.pathname.endsWith("/auth/session")) body = { authenticated: true, user: { id: "user", name: "Persona", emailVerified: true, primaryLocation: location } };
    else if (url.pathname.endsWith("/locations")) body = { items: [location, otherLocation] };
    else if (url.pathname.endsWith("/sports")) {
      if (failSports) return new Response("{}", { status: 500 });
      body = { items: [football, padel, volley] };
    } else if (url.pathname.endsWith("/matches")) {
      queries.push(url.searchParams);
      if (gate) await gate;
      if (failMatches) return new Response("{}", { status: 500 });
      const page = Number(url.searchParams.get("page")); const sportId = url.searchParams.get("sportId");
      const sport = sportId === padel.id ? padel : sportId === volley.id ? volley : football;
      const empty = emptyZone || (emptyFiltered && !!sportId);
      body = { items: empty ? [] : [{ id: `${sport.id}-${page}`, location, sport, sportFormat: sport.formats[0] ?? null, startsAt: "2027-11-03T21:00:00Z", venueName: `${sport.name} página ${page}`, address: "Calle 1", pricePerPerson: "5000", availablePlaces: 2, status: "OPEN", description: null }], total: empty ? 0 : 10, page, pageSize: 9, hasMore: !empty && page === 1 };
    } else throw new Error(`Unexpected request ${url.pathname}`);
    return new Response(JSON.stringify(body));
  }));
});
afterEach(() => { vi.unstubAllGlobals(); window.history.replaceState({}, "", "/"); });
function open() { return render(<Providers><Home discovery /></Providers>); }
async function chip(name: string) { fireEvent.click(await screen.findByRole("button", { name })); }
async function latest(filters: Record<string, string | null>) {
  await waitFor(() => { const query = queries.at(-1)!; for (const [key, value] of Object.entries(filters)) expect(query?.get(key)).toBe(value); });
}

it("uses the real catalog, clears incompatible formats, and returns to every sport", async () => {
  open(); await chip("Fútbol"); await chip("Fútbol 5");
  await latest({ sportId: football.id, sportFormatId: football.formats[0].id });
  expect(screen.getByRole("button", { name: "Fútbol 5" })).toHaveAttribute("aria-pressed", "true");
  await chip("Pádel");
  await latest({ sportId: padel.id, sportFormatId: null });
  expect(screen.queryByRole("button", { name: "Fútbol 5" })).not.toBeInTheDocument();
  await chip("Dobles"); await latest({ sportFormatId: padel.formats[0].id });
  await chip("Vóley"); await latest({ sportId: volley.id, sportFormatId: null });
  expect(screen.queryByRole("group", { name: "Formato" })).not.toBeInTheDocument();
  await chip("Todos los deportes");
  expect(screen.getByRole("button", { name: "Todos los deportes" })).toHaveAttribute("aria-pressed", "true");
  expect(await screen.findByText("Fútbol página 1")).toBeInTheDocument();
  expect(parseDiscovery(window.location.search)).toMatchObject({ sportId: undefined, sportFormatId: undefined });
  expect(new URLSearchParams(window.location.search).get("success")).toBe("login");
});
it("combines local dates with sport and temporary locality without updating profile", async () => {
  open(); await chip("Fútbol"); await chip("Fútbol 5"); await chip("Hoy");
  await latest({ date: localDate(), sportId: football.id });
  await chip("Mañana"); await latest({ date: localDate(1) });
  await chip("Elegir fecha");
  fireEvent.change(screen.getByLabelText("Fecha del partido"), { target: { value: "2027-02-28" } });
  await latest({ date: "2027-02-28" });
  fireEvent.click(screen.getByRole("combobox", { name: "Localidad seleccionada" }));
  fireEvent.click(await screen.findByRole("option", { name: "City Bell" }));
  await latest({ locationId: otherLocation.id, sportId: football.id, sportFormatId: football.formats[0].id, date: "2027-02-28" });
  await chip("Todas las fechas"); await latest({ date: null, sportId: football.id });
});
it("resets progressive pages when switching to a previously cached filter", async () => {
  open(); await screen.findByText("Fútbol página 1"); await chip("Cargar más partidos");
  await screen.findByText("Fútbol página 2"); await chip("Pádel"); await screen.findByText("Pádel página 1");
  expect(screen.queryByText("Fútbol página 2")).not.toBeInTheDocument();
  await chip("Todos los deportes"); await screen.findByText("Fútbol página 1");
  expect(screen.queryByText("Fútbol página 2")).not.toBeInTheDocument();
  await chip("Cargar más partidos"); await screen.findByText("Fútbol página 2");
});
it("restores filters and locality from history without mixing pages", async () => {
  open(); await chip("Fútbol"); await chip("Fútbol 5");
  const footballSearch = window.location.search;
  await chip("Pádel"); await screen.findByText("Pádel página 1");
  act(() => { window.history.replaceState(window.history.state, "", `/partidos${footballSearch}`); window.dispatchEvent(new PopStateEvent("popstate")); });
  expect(await screen.findByRole("button", { name: "Fútbol 5" })).toHaveAttribute("aria-pressed", "true");
  expect(await screen.findByText("Fútbol página 1")).toBeInTheDocument();
});
it("differentiates an empty filter and safely clears it back to cached unfiltered results", async () => {
  open(); await screen.findByText("Fútbol página 1"); emptyFiltered = true; await chip("Pádel");
  expect(await screen.findByText("No encontramos partidos con estos filtros.")).toBeInTheDocument();
  await chip("Limpiar filtros");
  expect(await screen.findByText("Fútbol página 1")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Todos los deportes" })).toHaveAttribute("aria-pressed", "true");
});
it("identifies a genuinely empty zone even when a sport filter is applied", async () => {
  emptyZone = true; open(); await chip("Pádel");
  expect(await screen.findByText("No hay partidos disponibles en esta zona.")).toBeInTheDocument();
  expect(screen.queryByText("No encontramos partidos con estos filtros.")).not.toBeInTheDocument();
});
it("clears the custom date picker when an empty result resets filters", async () => {
  open(); await screen.findByText("Fútbol página 1");
  emptyFiltered = true; await chip("Pádel"); await chip("Elegir fecha");
  fireEvent.change(screen.getByLabelText("Fecha del partido"), { target: { value: "2027-02-28" } });
  await screen.findByText("No encontramos partidos con estos filtros.");
  await chip("Limpiar filtros");
  expect(screen.getByRole("button", { name: "Todas las fechas" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Elegir fecha" })).toHaveAttribute("aria-pressed", "false");
  expect(screen.queryByLabelText("Fecha del partido")).not.toBeInTheDocument();
});
it("restores the Today preset when history leaves a custom date", async () => {
  open(); await chip("Hoy"); const todaySearch = window.location.search;
  await chip("Elegir fecha");
  fireEvent.change(screen.getByLabelText("Fecha del partido"), { target: { value: "2027-02-28" } });
  act(() => { window.history.replaceState(window.history.state, "", `/partidos${todaySearch}`); window.dispatchEvent(new PopStateEvent("popstate")); });
  expect(screen.getByRole("button", { name: "Hoy" })).toHaveAttribute("aria-pressed", "true");
  expect(screen.getByRole("button", { name: "Elegir fecha" })).toHaveAttribute("aria-pressed", "false");
  expect(screen.queryByLabelText("Fecha del partido")).not.toBeInTheDocument();
});
it("preserves loading and retry states for matches", async () => {
  let release = () => {}; gate = new Promise<void>(resolve => { release = resolve; });
  open(); expect(await screen.findByText("Cargando partidos…")).toBeInTheDocument();
  await act(async () => { release(); await gate; });
  expect(await screen.findByText("Fútbol página 1")).toBeInTheDocument();
  failMatches = true; await chip("Pádel");
  expect(await screen.findByRole("button", { name: "Reintentar partidos" }, { timeout: 5000 })).toBeInTheDocument();
  failMatches = false; await chip("Reintentar partidos");
  expect(await screen.findByText("Pádel página 1")).toBeInTheDocument();
});
it("allows catalog retries without replacing the existing match list", async () => {
  failSports = true; open(); await screen.findByText("Fútbol página 1");
  await screen.findByRole("button", { name: "Reintentar deportes" }, { timeout: 5000 });
  failSports = false; await chip("Reintentar deportes");
  const group = await screen.findByRole("group", { name: "¿Qué querés jugar?" });
  expect(await within(group).findByRole("button", { name: "Pádel" })).toBeInTheDocument();
});
it.each(["2026-13-01", "2026-01-32", "2026-02-29", "2026-00-01", "no", "0000-01-01"])("ignores malformed calendar dates in URL: %s", date => {
  expect(validLocalDate(date)).toBe(false);
  expect(parseDiscovery(`?date=${date}`).date).toBeUndefined();
});
it("calculates today and tomorrow in Buenos Aires independently of the browser zone", () => {
  expect(localDate(0, new Date("2026-11-03T02:59:59Z"))).toBe("2026-11-02");
  expect(localDate(1, new Date("2026-12-31T23:00:00Z"))).toBe("2027-01-01");
  expect(validLocalDate("2028-02-29")).toBe(true);
  expect(parseDiscovery(`?sport=bad&format=${football.formats[0].id}`).sportFormatId).toBeUndefined();
});
