import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { MatchManagement } from "./match-management";
import { MatchFeedback } from "./match-feedback";
import type { MatchManagement as Management } from "../types";

const state = vi.hoisted(() => ({ replace: vi.fn(), synchronize: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: state.replace }) }));
vi.mock("@/features/auth/session", () => ({ useSession: () => ({ session: { authenticated: true, user: { id: "owner" } }, synchronize: state.synchronize }) }));
const fixture = { id: "match", version: 2, createdAt: "2026-11-01T12:00:00Z", updatedAt: "2026-11-02T12:00:00Z", totalPlaces: 4, availablePlaces: 4, canEdit: true, canCancel: true, cancelledAt: null, cancellationReason: null } as Management;
let current: Management;
let cancels: Record<string, unknown>[];
let failure: "network" | "conflict" | "expired" | undefined;
const actor = { id: "owner", name: "Organizador" };
let historyPages: number[];
beforeEach(() => {
  current = structuredClone(fixture); cancels = []; failure = undefined; historyPages = [];
  state.replace.mockReset(); state.synchronize.mockReset();
  vi.stubGlobal("fetch", vi.fn(async (input: string, init?: RequestInit) => {
    const url = new URL(input);
    if (url.pathname.endsWith("/management")) return new Response(JSON.stringify(current));
    if (url.pathname.endsWith("/history")) {
      const page = Number(url.searchParams.get("page")); historyPages.push(page);
      return new Response(JSON.stringify({ items: [{ id: `event-${page}`, event: "UPDATED", occurredAt: "2026-11-02T12:00:00Z", actor, changes: { description: { before: "Antes", after: "Después" }, sport: { before: { id: "old", name: "Fútbol" }, after: { id: "new", name: "Vóley" } } } }], page, total: 4, pageSize: 3, hasMore: page === 1 }));
    }
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
it("renders meaningful changes and restores focus when dismissing confirmation without a request", async () => {
  open(); const region = await panel();
  expect(screen.getByRole("heading", { name: "Cancelar partido" })).toHaveFocus();
  expect(screen.getByText("Antes → Después")).toBeInTheDocument();
  expect(screen.getByText("Fútbol → Vóley")).toBeInTheDocument();
  fireEvent.click(within(region).getByRole("button", { name: "Volver" }));
  expect(screen.getByRole("button", { name: "Cancelar partido" })).toHaveFocus();
  expect(cancels).toHaveLength(0);
});
it("cancels once with a trimmed reason, resets history to page one and hides edit actions", async () => {
  open(); await screen.findByText("Partido actualizado");
  fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
  await screen.findByText("Página 2");
  await panel();
  fireEvent.change(screen.getByLabelText("Motivo (opcional)"), { target: { value: " Lluvia " } });
  const confirm = screen.getByRole("button", { name: "Confirmar cancelación" });
  fireEvent.click(confirm); fireEvent.click(confirm);
  expect(await screen.findByText("Partido cancelado correctamente")).toHaveFocus();
  expect(cancels).toEqual([{ expectedVersion: 2, reason: "Lluvia" }]);
  expect(screen.getByText("Página 1")).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Editar" })).not.toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Cancelar partido" })).not.toBeInTheDocument();
  expect(historyPages).toContain(1);
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
