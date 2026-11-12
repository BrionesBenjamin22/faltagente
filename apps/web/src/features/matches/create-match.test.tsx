import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { CreateMatchScreen } from "./create-match";
import { createMatchInput, createMatchSchema } from "./create-validation";

const state = vi.hoisted(() => ({ authenticated: true, pending: false, failed: false, replace: vi.fn(), synchronize: vi.fn(), refetch: vi.fn() }));
const location = { id: "10000000-0000-4000-8000-000000000001", name: "Tolosa" };
const sport = { id: "20000000-0000-4000-8000-000000000001", name: "Fútbol", formats: [{ id: "30000000-0000-4000-8000-000000000001", name: "Fútbol 5" }] };
const volley = { id: "20000000-0000-4000-8000-000000000002", name: "Vóley", formats: [] };
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: state.replace }) }));
vi.mock("@/features/auth/session", () => ({ useSession: () => ({ session: { authenticated: state.authenticated, user: { id: "user", emailVerified: false, primaryLocation: location } }, isPending: state.pending, isError: state.failed, synchronize: state.synchronize, refetch: state.refetch }) }));

let posts: Record<string, unknown>[];
let failure: "network" | "conflict" | "expired" | undefined;
let emptySports: boolean;
beforeEach(() => {
  state.authenticated = true; state.pending = false; state.failed = false;
  state.replace.mockReset(); state.synchronize.mockReset(); state.refetch.mockReset();
  posts = []; failure = undefined; emptySports = false;
  vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => {
    const path = new URL(input).pathname;
    if (path.endsWith("/sports")) return new Response(JSON.stringify({ items: emptySports ? [] : [sport, volley] }));
    if (path.endsWith("/locations")) return new Response(JSON.stringify({ items: [location] }));
    if (path.endsWith("/auth/csrf")) return new Response(JSON.stringify({ csrfToken: "csrf-test" }));
    if (path.endsWith("/matches") && init?.method === "POST") {
      posts.push(JSON.parse(init.body as string));
      if (failure === "network") throw new Error("offline");
      if (failure === "conflict") return new Response(JSON.stringify({ code: "PARTICIPATION_DATE_CONFLICT", message: "Ya participa." }), { status: 409 });
      if (failure === "expired") return new Response(JSON.stringify({ code: "UNAUTHORIZED", message: "La sesión venció. Ingresá nuevamente." }), { status: 401 });
      return new Response(JSON.stringify({ id: "match" }), { status: 201 });
    }
    throw new Error(`Unexpected ${path}`);
  }));
});
afterEach(() => vi.unstubAllGlobals());
function open() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}><CreateMatchScreen /></QueryClientProvider>);
}
async function complete() {
  await screen.findByRole("option", { name: "Fútbol" });
  for (const [name, value] of Object.entries({ Deporte: sport.id, Fecha: "2099-11-12", Hora: "20:00", "Nombre del lugar": "  Club del barrio  ", Dirección: "  Calle 1 y 63  ", "Precio por persona (ARS)": "5000.50", "Lugares para jugadores": "4", "Descripción (opcional)": "  Traer agua.  " })) fireEvent.change(screen.getByLabelText(name), { target: { value } });
}
const valid = { sportId: sport.id, sportFormatId: "", locationId: location.id, date: "2099-11-12", time: "23:30", placeName: "Club", address: "Calle 1", pricePerPerson: "0", totalPlaces: "4", description: " " };

it("publishes with CSRF, Buenos Aires time, trimmed fields and returns home even without verified email", async () => {
  open(); await complete();
  fireEvent.change(screen.getByLabelText("Formato (opcional)"), { target: { value: sport.formats[0].id } });
  fireEvent.click(screen.getByRole("button", { name: "Publicar partido" }));
  await waitFor(() => expect(state.replace).toHaveBeenCalledWith("/?success=match-created"));
  expect(posts).toEqual([{ sportId: sport.id, sportFormatId: sport.formats[0].id, locationId: location.id, startsAt: "2099-11-12T20:00:00-03:00", placeName: "Club del barrio", address: "Calle 1 y 63", pricePerPerson: "5000.50", totalPlaces: 4, description: "Traer agua." }]);
  expect(fetch).toHaveBeenCalledWith(expect.stringContaining("/matches"), expect.objectContaining({ method: "POST", credentials: "include", headers: expect.objectContaining({ "X-CSRF-Token": "csrf-test" }) }));
  expect(screen.getByRole("button", { name: "Publicando…" })).toBeDisabled();
});
it("shows field errors and focuses the first invalid field without an API mutation", async () => {
  open(); await screen.findByRole("option", { name: "Fútbol" });
  fireEvent.click(screen.getByRole("button", { name: "Publicar partido" }));
  expect(await screen.findByText("Seleccione un deporte.")).toBeInTheDocument();
  expect(screen.getByLabelText("Deporte")).toHaveFocus();
  expect(screen.getByLabelText("Fecha")).toHaveAttribute("aria-invalid", "true");
  expect(posts).toHaveLength(0);
});
it("clears the optional format when the sport changes", async () => {
  open(); await complete();
  fireEvent.change(screen.getByLabelText("Formato (opcional)"), { target: { value: sport.formats[0].id } });
  fireEvent.change(screen.getByLabelText("Deporte"), { target: { value: volley.id } });
  expect(screen.getByLabelText("Formato (opcional)")).toHaveValue("");
  expect(screen.getByLabelText("Formato (opcional)")).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Publicar partido" }));
  await waitFor(() => expect(posts).toHaveLength(1));
  expect(posts[0]).toMatchObject({ sportId: volley.id, sportFormatId: null });
});
it("keeps values after a recoverable failure and only retries on explicit submit", async () => {
  failure = "network"; open(); await complete();
  fireEvent.click(screen.getByRole("button", { name: "Publicar partido" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Lo sentimos! No pudimos recuperar su información. Intente nuevamente.");
  expect(posts).toHaveLength(1);
  expect(screen.getByLabelText("Nombre del lugar")).toHaveValue("  Club del barrio  ");
  failure = undefined;
  fireEvent.click(screen.getByRole("button", { name: "Publicar partido" }));
  await waitFor(() => expect(state.replace).toHaveBeenCalledWith("/?success=match-created"));
  expect(posts).toHaveLength(2);
});
it("explains daily participation conflicts so the organizer can choose another day", async () => {
  failure = "conflict"; open(); await complete();
  fireEvent.click(screen.getByRole("button", { name: "Publicar partido" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Elegí otro día para publicar.");
  expect(state.replace).not.toHaveBeenCalled();
});
it("synchronizes an expired session before returning to login", async () => {
  failure = "expired"; open(); await complete();
  fireEvent.click(screen.getByRole("button", { name: "Publicar partido" }));
  await waitFor(() => expect(state.replace).toHaveBeenCalledWith("/auth/login"));
  expect(state.synchronize).toHaveBeenCalledTimes(1);
});
it("redirects anonymous direct access without exposing the form or loading catalogs", async () => {
  state.authenticated = false; open();
  await waitFor(() => expect(state.replace).toHaveBeenCalledWith("/auth/login"));
  expect(screen.queryByRole("button", { name: "Publicar partido" })).not.toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
});
it("shows session loading and recoverable session errors", () => {
  state.pending = true; const view = open();
  expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
  state.pending = false; state.failed = true; view.rerender(<QueryClientProvider client={new QueryClient()}><CreateMatchScreen /></QueryClientProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Reintentar sesión" }));
  expect(state.refetch).toHaveBeenCalledTimes(1);
});
it("prevents publication when the sports catalog is empty", async () => {
  emptySports = true; open();
  expect(await screen.findByText("No hay deportes disponibles. Intentá nuevamente más tarde.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Publicar partido" })).toBeDisabled();
});
it.each([
  { date: "2026-02-30" }, { date: "2000-01-01" }, { time: "24:00" }, { totalPlaces: "0" }, { totalPlaces: "1.5" }, { totalPlaces: "2147483648" }, { pricePerPerson: "-1" }, { pricePerPerson: "1,50" }, { pricePerPerson: "1.001" }, { description: "a".repeat(2001) },
])("rejects invalid form values %j", override => {
  expect(createMatchSchema.safeParse({ ...valid, ...override }).success).toBe(false);
});
it("uses the Buenos Aires day independently of browser timezone and normalizes optional fields", () => {
  const input = createMatchInput(createMatchSchema.parse(valid));
  expect(input).toMatchObject({ startsAt: "2099-11-12T23:30:00-03:00", sportFormatId: null, description: null, totalPlaces: 4 });
  expect(new Date(input.startsAt).toISOString()).toBe("2099-11-13T02:30:00.000Z");
});
