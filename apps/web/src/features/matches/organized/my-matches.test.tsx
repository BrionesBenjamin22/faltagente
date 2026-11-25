import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { MyMatchesScreen } from "./my-matches";

const state = vi.hoisted(() => ({ authenticated: true, replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: state.replace }) }));
vi.mock("@/features/auth/session", () => ({ useSession: () => ({ session: { authenticated: state.authenticated, user: { id: "owner" } }, synchronize: vi.fn() }) }));
afterEach(() => { vi.unstubAllGlobals(); state.authenticated = true; state.replace.mockReset(); });
const match = { id: "match", venueName: "Cancha propia", startsAt: "2099-11-12T20:00:00Z", sport: { name: "Fútbol" }, sportFormat: null, location: { name: "Tolosa" }, address: "Calle 1", pricePerPerson: "0", availablePlaces: 2, status: "OPEN" };
function open() { return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })}><MyMatchesScreen /></QueryClientProvider>); }

it("paginates organized matches and resets to page one when filtering cancelled matches", async () => {
  const fetch = vi.fn(async (input: string) => {
    const url = new URL(input); const page = Number(url.searchParams.get("page"));
    return new Response(JSON.stringify({ items: [{ ...match, status: url.searchParams.get("filter") === "cancelled" ? "CANCELLED" : "OPEN" }], total: 10, page, pageSize: 9, hasMore: page === 1 }));
  });
  vi.stubGlobal("fetch", fetch); open();
  expect(await screen.findByText("Cancha propia")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
  await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringContaining("filter=upcoming&page=2"), expect.anything()));
  fireEvent.click(screen.getByRole("button", { name: "Cancelados" }));
  expect(await screen.findByText("Partido cancelado")).toBeInTheDocument();
  expect(fetch).toHaveBeenLastCalledWith(expect.stringContaining("filter=cancelled&page=1"), expect.anything());
  expect(screen.getByRole("button", { name: "Anterior" })).toBeDisabled();
});

it("redirects anonymous direct access without requesting private listings", async () => {
  state.authenticated = false; const fetch = vi.fn(); vi.stubGlobal("fetch", fetch); open();
  await waitFor(() => expect(state.replace).toHaveBeenCalledWith("/auth/login"));
  expect(fetch).not.toHaveBeenCalled();
});

it("switches to reserved matches on page one and distinguishes voluntary and organizer cancellations", async () => {
  const fetch = vi.fn(async (input: string) => {
    const url = new URL(input);
    const reserved = url.searchParams.get("role") === "player";
    return new Response(JSON.stringify({ items: reserved ? [
      { ...match, id: "voluntary", reservation: { id: "r1", places: 2, status: "CANCELLED", cancellationSource: "USER", cancelledAt: "2099-01-01" } },
      { ...match, id: "organizer", venueName: "Cancha cancelada", status: "CANCELLED", reservation: { id: "r2", places: 1, status: "CANCELLED", cancellationSource: "MATCH", cancelledAt: "2099-01-01" } },
    ] : [match], total: 10, page: Number(url.searchParams.get("page")), pageSize: 9, hasMore: true }));
  });
  vi.stubGlobal("fetch", fetch); open();
  await screen.findByText("Cancha propia");
  fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
  await screen.findByText("Página 2");
  fireEvent.click(screen.getByRole("button", { name: "Reservados" }));
  expect(await screen.findByText("Cancha cancelada")).toBeInTheDocument();
  expect(fetch).toHaveBeenLastCalledWith(expect.stringContaining("filter=upcoming&page=1&role=player"), expect.anything());
  expect(screen.getByText("Cancelaste tu reserva. 2 lugares.")).toBeInTheDocument();
  expect(screen.getByText("Cancelada por el organizador. 1 lugar.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Reservados" })).toHaveAttribute("aria-pressed", "true");
  fireEvent.click(screen.getByRole("button", { name: "Cancelados" }));
  await waitFor(() => expect(fetch).toHaveBeenLastCalledWith(expect.stringContaining("filter=cancelled&page=1&role=player"), expect.anything()));
});
