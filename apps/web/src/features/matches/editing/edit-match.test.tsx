import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { EditMatchScreen } from "./edit-match";
import { matchEditInput, matchEditValues } from "./edit-validation";
import type { MatchManagement } from "../types";

const state = vi.hoisted(() => ({ authenticated: true, replace: vi.fn(), synchronize: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: state.replace }) }));
vi.mock("@/features/auth/session", () => ({ useSession: () => ({ session: { authenticated: state.authenticated, user: { id: "owner" } }, isPending: false, isError: false, synchronize: state.synchronize }) }));
const sport = { id: "20000000-0000-4000-8000-000000000001", name: "Fútbol", slug: "futbol", active: true };
const location = { id: "10000000-0000-4000-8000-000000000001", name: "Tolosa", type: "LOCALITY", active: true };
const fixture: MatchManagement = { id: "match", sport, sportFormat: null, location, startsAt: "2099-11-13T02:30:29.000Z", placeName: "Club", address: "Calle 1", pricePerPerson: "5000.5", totalPlaces: 4, availablePlaces: 4, version: 2, description: "Traer agua", status: "OPEN", cancelledAt: null, cancellationReason: null, hasConfirmedParticipants: false, canEdit: true, canCancel: true, canAdjustCapacity: true, occupiedPlaces: 0, activePlayerCount: 0 };
let current: MatchManagement;
let failure: "network" | "conflict" | "forbidden" | "expired" | undefined;
let patches: Record<string, unknown>[];
let reads: number;
let failRead: boolean;
let inactiveCatalogs: boolean;
beforeEach(() => {
  current = structuredClone(fixture); failure = undefined; patches = []; reads = 0; failRead = false; inactiveCatalogs = false;
  state.authenticated = true; state.replace.mockReset(); state.synchronize.mockReset();
  vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => {
    const path = new URL(input).pathname;
    if (path.endsWith("/management")) {
      reads++;
      if (failRead) throw new Error("offline");
      if (failure === "forbidden") return new Response(JSON.stringify({ code: "MATCH_FORBIDDEN", message: "Sólo el organizador puede gestionar este partido." }), { status: 403 });
      return new Response(JSON.stringify(current));
    }
    if (path.endsWith("/sports")) return new Response(JSON.stringify({ items: inactiveCatalogs ? [] : [{ ...sport, formats: [] }] }));
    if (path.endsWith("/locations")) return new Response(JSON.stringify({ items: inactiveCatalogs ? [] : [location] }));
    if (path.endsWith("/auth/csrf")) return new Response(JSON.stringify({ csrfToken: "csrf-test" }));
    if (init?.method === "PATCH") {
      patches.push(JSON.parse(init.body as string));
      if (failure === "network") throw new Error("offline");
      if (failure === "conflict") return new Response(JSON.stringify({ code: "MATCH_VERSION_CONFLICT", message: "El partido cambió. Recargalo e intentá nuevamente." }), { status: 409 });
      if (failure === "expired") return new Response(JSON.stringify({ code: "UNAUTHORIZED", message: "Ingresá nuevamente." }), { status: 401 });
      return new Response(JSON.stringify({ id: "match" }));
    }
    throw new Error(`Unexpected ${path}`);
  }));
});
afterEach(() => vi.unstubAllGlobals());
function open() { return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}><EditMatchScreen id="match" /></QueryClientProvider>); }
async function ready() { await screen.findByRole("button", { name: "Guardar cambios" }); }
it("loads a private baseline and saves only normalized differences with its original version and CSRF", async () => {
  open(); await ready();
  expect(screen.getByLabelText("Fecha")).toHaveValue("2099-11-12");
  fireEvent.change(screen.getByLabelText("Precio por persona (ARS)"), { target: { value: "5000.50" } });
  fireEvent.change(screen.getByLabelText("Nombre del lugar"), { target: { value: " Club " } });
  fireEvent.change(screen.getByLabelText("Descripción (opcional)"), { target: { value: " Nuevo texto " } });
  fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
  await waitFor(() => expect(state.replace).toHaveBeenCalledWith("/partidos/match?success=match-updated"));
  expect(patches).toEqual([{ expectedVersion: 2, description: "Nuevo texto" }]);
  expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/matches/match"), expect.objectContaining({ credentials: "include", method: "PATCH", headers: expect.objectContaining({ "X-CSRF-Token": "csrf-test" }) }));
});
it("does not send an unchanged form or rewrite seconds, historical values or inactive catalogs", async () => {
  current = { ...current, totalPlaces: 0, placeName: "X", sport: { ...sport, active: false }, location: { ...location, active: false } };
  open(); await ready();
  fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
  expect(await screen.findByText("No hay cambios para guardar")).toBeInTheDocument();
  expect(patches).toHaveLength(0);
  fireEvent.change(screen.getByLabelText("Descripción (opcional)"), { target: { value: "Nuevo cambio" } });
  expect(screen.queryByText("No hay cambios para guardar")).not.toBeInTheDocument();
});
it.each([true, false])("keeps visible persisted selections when delayed active catalogs resolve (active=%s)", async active => {
  const format = { id: "30000000-0000-4000-8000-000000000001", name: "Fútbol 5", slug: "futbol-5", active };
  current = { ...current, sport: { ...sport, active }, sportFormat: format, location: { ...location, active } };
  let resolveSports!: (value: Response) => void;
  let resolveLocations!: (value: Response) => void;
  const sportsResponse = new Promise<Response>(resolve => { resolveSports = resolve; });
  const locationsResponse = new Promise<Response>(resolve => { resolveLocations = resolve; });
  const originalFetch = fetch;
  vi.stubGlobal("fetch", vi.fn((input: string, init?: RequestInit) => {
    const path = new URL(input).pathname;
    if (path.endsWith("/sports")) return sportsResponse;
    if (path.endsWith("/locations")) return locationsResponse;
    return originalFetch(input, init);
  }));
  open(); await ready();
  expect(screen.getByLabelText("Deporte")).toHaveValue(sport.id);
  expect(screen.getByLabelText("Formato (opcional)")).toHaveValue(format.id);
  expect(screen.getByLabelText("Localidad")).toHaveValue(location.id);
  fireEvent.change(screen.getByLabelText("Descripción (opcional)"), { target: { value: "Borrador mientras carga" } });
  await act(async () => {
    resolveSports(new Response(JSON.stringify({ items: active ? [{ ...sport, id: "20000000-0000-4000-8000-000000000002", name: "Básquet", formats: [] }, { ...sport, formats: [format] }] : [] })));
    resolveLocations(new Response(JSON.stringify({ items: active ? [{ ...location, id: "10000000-0000-4000-8000-000000000002", name: "Abasto" }, location] : [] })));
  });
  await waitFor(() => expect(screen.getByLabelText("Deporte")).toBeEnabled());
  expect(screen.getByLabelText("Deporte")).toHaveValue(sport.id);
  expect(screen.getByLabelText("Deporte")).toHaveDisplayValue(active ? "Fútbol" : "Fútbol (inactivo)");
  expect(screen.getByLabelText("Formato (opcional)")).toHaveValue(format.id);
  expect(screen.getByLabelText("Formato (opcional)")).toHaveDisplayValue(active ? "Fútbol 5" : "Fútbol 5 (inactivo)");
  expect(screen.getByLabelText("Localidad")).toHaveValue(location.id);
  expect(screen.getByLabelText("Localidad")).toHaveDisplayValue(active ? "Tolosa" : "Tolosa (inactiva)");
  expect(screen.getByLabelText("Descripción (opcional)")).toHaveValue("Borrador mientras carga");
  expect(patches).toHaveLength(0);
});
it("preserves a failed form and permits an explicit retry", async () => {
  failure = "network"; open(); await ready();
  fireEvent.change(screen.getByLabelText("Descripción (opcional)"), { target: { value: "Conservar" } });
  fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/Intente nuevamente/);
  expect(screen.getByLabelText("Descripción (opcional)")).toHaveValue("Conservar");
  failure = undefined; fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
  await waitFor(() => expect(patches).toHaveLength(2));
});
it("preserves edits on version conflict and reloads only at explicit request", async () => {
  failure = "conflict"; open(); await ready();
  fireEvent.change(screen.getByLabelText("Descripción (opcional)"), { target: { value: "Mi cambio" } });
  fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
  const reload = await screen.findByRole("button", { name: "Recargar versión actual" });
  expect(screen.getByLabelText("Descripción (opcional)")).toHaveValue("Mi cambio");
  expect(reads).toBe(1); expect(patches).toHaveLength(1);
  current = { ...current, version: 3, description: "Cambio concurrente" }; failure = undefined;
  fireEvent.click(reload);
  await waitFor(() => expect(screen.getByLabelText("Descripción (opcional)")).toHaveValue("Cambio concurrente"));
  expect(patches).toHaveLength(1);
});
it("preserves the baseline and written values when explicit conflict reload fails", async () => {
  failure = "conflict"; open(); await ready();
  fireEvent.change(screen.getByLabelText("Descripción (opcional)"), { target: { value: "Mi cambio" } });
  fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
  const reload = await screen.findByRole("button", { name: "Recargar versión actual" });
  failRead = true; fireEvent.click(reload);
  await screen.findByText(/Tus cambios siguen en el formulario/, {}, { timeout: 4000 });
  expect(screen.getByLabelText("Descripción (opcional)")).toHaveValue("Mi cambio");
  expect(patches).toHaveLength(1);
});
it("shows inactive relation snapshots and permits a description change with empty active catalogs", async () => {
  inactiveCatalogs = true; current.sport.active = false; current.location.active = false;
  open(); await ready();
  expect(screen.getByRole("option", { name: "Fútbol (inactivo)" })).toBeInTheDocument();
  expect(screen.getByRole("option", { name: "Tolosa (inactiva)" })).toBeInTheDocument();
  expect(screen.getByLabelText("Deporte")).toHaveValue(sport.id);
  expect(screen.getByLabelText("Localidad")).toHaveValue(location.id);
  fireEvent.change(screen.getByLabelText("Descripción (opcional)"), { target: { value: "Conserva relaciones" } });
  fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
  await waitFor(() => expect(patches).toEqual([{ expectedVersion: 2, description: "Conserva relaciones" }]));
});
it("keeps restricted data while saving description and capacity", async () => {
  current = { ...current, hasConfirmedParticipants: true, occupiedPlaces: 2, availablePlaces: 2, activePlayerCount: 1 };
  open(); await ready();
  for (const label of ["Deporte", "Formato (opcional)", "Fecha", "Hora", "Localidad", "Nombre del lugar", "Dirección", "Precio por persona (ARS)"]) expect(screen.getByLabelText(label)).toBeDisabled();
  fireEvent.change(screen.getByLabelText("Descripción (opcional)"), { target: { value: "Con jugadores" } });
  fireEvent.change(screen.getByLabelText("Lugares para jugadores"), { target: { value: "5" } });
  fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
  await waitFor(() => expect(patches).toEqual([{ expectedVersion: 2, description: "Con jugadores", totalPlaces: 5 }]));
});
it("synchronizes an expired session before navigating to login", async () => {
  failure = "expired"; open(); await ready();
  fireEvent.change(screen.getByLabelText("Descripción (opcional)"), { target: { value: "Cambio" } });
  fireEvent.click(screen.getByRole("button", { name: "Guardar cambios" }));
  await waitFor(() => expect(state.replace).toHaveBeenCalledWith("/auth/login"));
  expect(state.synchronize).toHaveBeenCalledOnce();
});
it("does not expose a form to another organizer or an anonymous visitor", async () => {
  failure = "forbidden"; const view = open();
  expect(await screen.findByRole("alert")).toHaveTextContent(/Sólo el organizador/);
  expect(screen.queryByRole("button", { name: "Guardar cambios" })).not.toBeInTheDocument();
  view.unmount(); state.authenticated = false; open();
  await waitFor(() => expect(state.replace).toHaveBeenCalledWith("/auth/login"));
  expect(reads).toBe(1);
});
it("validates only changed values and preserves occupied places", () => {
  const initial = { ...fixture, totalPlaces: 0, pricePerPerson: "0.000", placeName: "X" };
  expect(matchEditInput({ ...matchEditValues(initial), description: " Editado " }, initial)).toEqual({ input: { expectedVersion: 2, description: "Editado" }, errors: {} });
  expect(matchEditInput({ ...matchEditValues(fixture), totalPlaces: "1" }, { ...fixture, occupiedPlaces: 2 }).errors.totalPlaces).toContain("2 lugares");
});
it("protects pending offer capacity and critical fields even without confirmed players", async () => {
  current = { ...current, hasActiveWaitlist: true, heldPlaces: 3, occupiedPlaces: 0, availablePlaces: 1 };
  open(); await ready();
  expect(screen.getByLabelText("Fecha")).toBeDisabled();
  expect(screen.getByLabelText("Nombre del lugar")).toBeDisabled();
  expect(screen.getByLabelText("Lugares para jugadores")).toHaveAttribute("min", "3");
  const changed = matchEditInput({ ...matchEditValues(current), totalPlaces: "2", placeName: "Otro club" }, current);
  expect(changed.errors.totalPlaces).toContain("3 lugares");
  expect(changed.errors.placeName).toBeDefined();
  expect(changed.input).toEqual({ expectedVersion: 2 });
});
