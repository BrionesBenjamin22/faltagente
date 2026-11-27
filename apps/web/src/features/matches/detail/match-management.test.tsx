import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MatchManagement } from "./match-management";
import { MatchFeedback } from "./match-feedback";
import type { MatchManagement as Management } from "../types";

const state = vi.hoisted(() => ({ replace: vi.fn(), synchronize: vi.fn(), userId: "owner" as string | null }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: state.replace }) }));
vi.mock("@/features/auth/session", () => ({ useSession: () => ({ session: { authenticated: !!state.userId, user: state.userId ? { id: state.userId } : null }, synchronize: state.synchronize }) }));
const fixture = { id: "match", version: 2, totalPlaces: 4, availablePlaces: 4, activePlayerCount: 0, occupiedPlaces: 0, canEdit: true, canCancel: true, cancelledAt: null, cancellationReason: null } as Management;
let current: Management;
let cancels: Record<string, unknown>[];
let failure: "network" | "conflict" | "expired" | undefined;
beforeEach(() => {
  current = structuredClone(fixture); cancels = []; failure = undefined; state.userId = "owner";
  state.replace.mockReset(); state.synchronize.mockReset();
  vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => {
    const url = new URL(input);
    if (url.pathname.endsWith("/management")) return new Response(JSON.stringify(current));
    if (url.pathname.endsWith("/auth/csrf")) return new Response(JSON.stringify({ csrfToken: "csrf" }));
    if (url.pathname.endsWith("/cancel") && init?.method === "POST") {
      cancels.push(JSON.parse(init.body as string));
      if (failure === "network") throw new Error("offline");
      if (failure === "conflict") return new Response(JSON.stringify({ code: "MATCH_VERSION_CONFLICT", message: "Recargá el partido e intentá nuevamente." }), { status: 409 });
      if (failure === "expired") return new Response(JSON.stringify({ code: "UNAUTHORIZED", message: "Ingresá nuevamente." }), { status: 401 });
      current = { ...current, version: current.version + 1, canEdit: false, canCancel: false, status: "CANCELLED", cancelledAt: "2026-11-03T12:00:00Z", cancellationReason: "Lluvia" };
      return new Response(JSON.stringify({ id: "match" }));
    }
    throw new Error(`Unexpected ${url.pathname}`);
  }));
});
afterEach(() => vi.unstubAllGlobals());
function open() { return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}><MatchManagement id="match" organizerId="owner" /></QueryClientProvider>); }
async function panel() { fireEvent.click(await screen.findByRole("button", { name: "Cancelar partido" })); return screen.getByRole("region", { name: "Cancelar partido" }); }
it("keeps management actions without audit sections and restores focus after dismissing confirmation", async () => {
  open(); const region = await panel();
  expect(screen.getByRole("heading", { name: "Cancelar partido" })).toHaveFocus();
  expect(screen.queryByRole("heading", { name: "Auditoría" })).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Historial de cambios" })).not.toBeInTheDocument();
  expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).includes("/history"))).toBe(false);
  fireEvent.click(within(region).getByRole("button", { name: "Volver" }));
  expect(screen.getByRole("button", { name: "Cancelar partido" })).toHaveFocus();
  expect(cancels).toHaveLength(0);
});
it("cancels once with a trimmed reason and hides edit actions", async () => {
  open(); await panel();
  fireEvent.change(screen.getByLabelText("Motivo (opcional)"), { target: { value: " Lluvia " } });
  const confirm = screen.getByRole("button", { name: "Confirmar cancelación" });
  fireEvent.click(confirm); fireEvent.click(confirm);
  expect(await screen.findByText("Partido cancelado correctamente")).toHaveFocus();
  expect(cancels).toEqual([{ expectedVersion: 2, reason: "Lluvia" }]);
  expect(screen.queryByRole("link", { name: "Editar" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Cancelar partido" })).not.toBeInTheDocument();
});
it("preserves the cancellation reason after failure and conflict until explicitly reloading", async () => {
  failure = "network"; open(); await panel();
  fireEvent.change(screen.getByLabelText("Motivo (opcional)"), { target: { value: "Conservar motivo" } });
  fireEvent.click(screen.getByRole("button", { name: "Confirmar cancelación" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(/Intente nuevamente/);
  expect(screen.getByLabelText("Motivo (opcional)")).toHaveValue("Conservar motivo");
  failure = "conflict"; fireEvent.click(screen.getByRole("button", { name: "Confirmar cancelación" }));
  const reload = await screen.findByRole("button", { name: "Recargar versión actual" });
  expect(screen.getByRole("button", { name: "Confirmar cancelación" })).toBeDisabled();
  current.version = 3; failure = undefined;
  fireEvent.click(reload);
  await waitFor(() => expect(screen.getByRole("button", { name: "Confirmar cancelación" })).toBeEnabled());
  expect(screen.getByLabelText("Motivo (opcional)")).toHaveValue("Conservar motivo");
  fireEvent.click(screen.getByRole("button", { name: "Confirmar cancelación" }));
  await screen.findByText("Partido cancelado correctamente");
  expect(cancels[2]).toEqual({ expectedVersion: 3, reason: "Conservar motivo" });
});
it("consumes update feedback once by removing its URL parameter", () => {
  window.history.replaceState(null, "", "/partidos/match?success=match-updated");
  const view = render(<MatchFeedback success="match-updated" />);
  expect(screen.getByRole("status")).toHaveTextContent("Partido actualizado correctamente");
  expect(window.location.search).toBe("");
  view.unmount(); render(<MatchFeedback />);
  expect(screen.queryByRole("status")).not.toBeInTheDocument();
});
it("synchronizes an expired cancellation session and returns to login", async () => {
  failure = "expired"; open(); await panel();
  fireEvent.click(screen.getByRole("button", { name: "Confirmar cancelación" }));
  await waitFor(() => expect(state.replace).toHaveBeenCalledWith("/auth/login"));
  expect(state.synchronize).toHaveBeenCalledOnce();
});

it("shows the affected reservation and place counts including after explicit conflict reload", async () => {
  current = { ...current, hasConfirmedParticipants: true, activePlayerCount: 2, occupiedPlaces: 3, availablePlaces: 1 };
  failure = "conflict"; open(); await panel();
  expect(screen.getByText("Se cancelarán 2 reservas confirmadas que ocupan 3 lugares.")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Confirmar cancelación" }));
  const reload = await screen.findByRole("button", { name: "Recargar versión actual" });
  current = { ...current, version: 3, activePlayerCount: 1, occupiedPlaces: 1 };
  fireEvent.click(reload);
  expect(await screen.findByText("Se cancelarán 1 reserva confirmada que ocupan 1 lugar.")).toBeInTheDocument();
  expect(screen.getByText(/Podrán consultarlo quienes tengan una reserva confirmada/)).toBeInTheDocument();
});

it.each([null, "player"])("does not query organizer management or audit history for %s", async userId => {
  state.userId = userId;
  open();
  expect(screen.queryByRole("heading", { name: /Auditoría|Historial de cambios/ })).not.toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
});
it("retries a failed management lookup independently of the public detail", async () => {
  const base = vi.mocked(fetch).getMockImplementation()!;
  vi.mocked(fetch).mockImplementation(async (input, init) => String(input).endsWith("/management") ? new Response(JSON.stringify({ code: "FORBIDDEN", message: "No se pudo consultar el partido." }), { status: 403 }) : base(input, init));
  open();
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Editar" })).not.toBeInTheDocument();
  vi.mocked(fetch).mockImplementation(base);
  fireEvent.click(screen.getByRole("button", { name: "Reintentar acciones del partido" }));
  expect(await screen.findByRole("link", { name: "Editar" })).toBeInTheDocument();
});
it("shows a loading state while organizer actions are being retrieved", async () => {
  let resolve!: (value: Response) => void;
  vi.mocked(fetch).mockImplementation(() => new Promise(done => { resolve = done; }));
  open();
  expect(screen.getByRole("status")).toHaveTextContent("Cargando acciones del partido…");
  resolve(new Response(JSON.stringify(current)));
  expect(await screen.findByRole("link", { name: "Editar" })).toBeInTheDocument();
});
