import { fireEvent, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { Component, type ReactNode } from "react";
import { MatchDetailContent, MatchDetailScreen } from "./match-detail";
import type { MatchDetail } from "./service";

vi.mock("next/navigation", () => ({ notFound: () => { throw new Error("NEXT_NOT_FOUND"); } }));

const match: MatchDetail = {
  id: "10000000-0000-4000-8000-000000000001",
  sport: { id: "sport", name: "Fútbol", slug: "futbol" },
  sportFormat: { id: "format", name: "Fútbol 5", slug: "futbol-5" },
  startsAt: "2026-11-03T00:30:00Z",
  location: { id: "location", name: "Tolosa" },
  placeName: "El Galpón", address: "1 y 63", pricePerPerson: "7000",
  availablePlaces: 2, description: "Partido tranquilo, nivel intermedio.",
  status: "OPEN", organizer: { id: "organizer", name: "Martín R." },
};
afterEach(() => { vi.unstubAllGlobals(); vi.restoreAllMocks(); });
function open(initialData?: MatchDetail) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={client}><MatchDetailScreen id={match.id} initialData={initialData} /></QueryClientProvider>);
}

it("shows the API sport, format, local date, place, price, organizer and description", () => {
  open(match);
  expect(screen.getByRole("heading", { name: "Fútbol", level: 1 })).toBeInTheDocument();
  expect(screen.getByText("Fútbol 5")).toBeInTheDocument();
  expect(screen.getByText(/2 nov 2026, (21:30|9:30 p\. m\.)/)).toHaveAttribute("dateTime", match.startsAt);
  for (const value of ["El Galpón", "1 y 63", "Tolosa", "Martín R.", match.description!]) expect(screen.getByText(value)).toBeInTheDocument();
  expect(screen.getByText(/7\.000/)).toBeInTheDocument();
  expect(screen.getByText("2 lugares disponibles")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Volver a partidos" })).toHaveAttribute("href", "/partidos");
  expect(screen.queryByRole("button", { name: /reservar/i })).not.toBeInTheDocument();
  expect(screen.queryByRole("link", { name: "Martín R." })).not.toBeInTheDocument();
});
it.each([null, "", "   "])("omits empty description %s and supports missing format", description => {
  render(<MatchDetailContent match={{ ...match, sport: { id: "voley", name: "Vóley", slug: "voley" }, sportFormat: null, description }} />);
  expect(screen.getByRole("heading", { name: "Vóley" })).toBeInTheDocument();
  expect(screen.queryByText("Fútbol 5")).not.toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Sobre el partido" })).not.toBeInTheDocument();
});
it.each([{ availablePlaces: 0, label: "Sin lugares disponibles" }, { availablePlaces: 1, label: "1 lugar disponible" }])("shows availability: $label", ({ availablePlaces, label }) => {
  render(<MatchDetailContent match={{ ...match, availablePlaces }} />);
  expect(screen.getByText(label)).toBeInTheDocument();
});
it.each([{ status: "CLOSED", label: "Partido cerrado" }, { status: "CANCELLED", label: "Partido cancelado" }] as const)("represents $status without offering places", ({ status, label }) => {
  render(<MatchDetailContent match={{ ...match, status }} />);
  expect(screen.getByText(label)).toBeInTheDocument();
  expect(screen.getByText("Lugares informados: 2")).toBeInTheDocument();
  expect(screen.queryByText("2 lugares disponibles")).not.toBeInTheDocument();
});
it("renders all remote text safely", () => {
  render(<MatchDetailContent match={{ ...match, description: "<script>alert(1)</script>", organizer: { ...match.organizer, name: "<b>Nombre</b>" } }} />);
  expect(screen.getByText("<script>alert(1)</script>")).toBeInTheDocument();
  expect(screen.getByText("<b>Nombre</b>")).toBeInTheDocument();
  expect(document.querySelector("script")).toBeNull();
});
it("loads through the shared service and renders a coherent loading state", async () => {
  let resolve!: (value: Response) => void;
  const fetch = vi.fn(() => new Promise<Response>(done => { resolve = done; }));
  vi.stubGlobal("fetch", fetch);
  open();
  expect(screen.getByRole("status")).toHaveAttribute("aria-busy", "true");
  expect(screen.getByText("Cargando partido…")).toBeInTheDocument();
  resolve(new Response(JSON.stringify(match)));
  expect(await screen.findByRole("heading", { name: "Fútbol" })).toBeInTheDocument();
  expect(fetch).toHaveBeenCalledWith(expect.stringContaining(`/matches/${match.id}`), expect.objectContaining({ credentials: "include", cache: "no-store" }));
});
it("shows a recoverable error and retries the same detail", async () => {
  const fetch = vi.fn().mockRejectedValueOnce(new Error("offline")).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(new Response(JSON.stringify(match)));
  vi.stubGlobal("fetch", fetch);
  open();
  expect(await screen.findByRole("alert", {}, { timeout: 3000 })).toHaveTextContent("Lo sentimos! No pudimos recuperar su información. Intente nuevamente.");
  fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
  expect(await screen.findByRole("heading", { name: "Fútbol" })).toBeInTheDocument();
});
class NotFoundBoundary extends Component<{ children: ReactNode }, { missing: boolean }> {
  state = { missing: false };
  static getDerivedStateFromError() { return { missing: true }; }
  render() { return this.state.missing ? <p>Existing Next not-found boundary</p> : this.props.children; }
}
it("dispatches unknown matches to the existing Next not-found boundary without retrying", async () => {
  vi.spyOn(console, "error").mockImplementation(() => {});
  const fetch = vi.fn(async () => new Response(JSON.stringify({ code: "NOT_FOUND", message: "No existe" }), { status: 404 }));
  vi.stubGlobal("fetch", fetch);
  const client = new QueryClient();
  render(<NotFoundBoundary><QueryClientProvider client={client}><MatchDetailScreen id={match.id} /></QueryClientProvider></NotFoundBoundary>);
  expect(await screen.findByText("Existing Next not-found boundary")).toBeInTheDocument();
  expect(fetch).toHaveBeenCalledTimes(1);
});
it("uses server data immediately without a duplicate fetch", () => {
  const fetch = vi.fn(); vi.stubGlobal("fetch", fetch);
  open(match);
  expect(screen.getByRole("heading", { name: "Fútbol" })).toBeInTheDocument();
  expect(fetch).not.toHaveBeenCalled();
});
