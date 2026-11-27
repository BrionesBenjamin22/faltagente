import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { WaitlistPanel } from "./waitlist-panel";
import { MyWaitlist, OrganizerWaitlist } from "./waitlist-list";
import { waitlistService } from "./service";
import type { WaitlistEntry } from "./types";

vi.mock("@/features/auth/session", () => ({ useSession: () => ({ synchronize: vi.fn() }) }));
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
const entry: WaitlistEntry = { id: "entry", matchId: "match", places: 2, status: "WAITING", createdAt: "2026-01-01", offer: null };
function open(node = <WaitlistPanel id="match" userId="user" canJoin maximum={3} />) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
  return client;
}
it("validates quantity and enters the waitlist with visible feedback", async () => {
  vi.spyOn(waitlistService, "mine").mockResolvedValueOnce(null).mockResolvedValue(entry);
  const join = vi.spyOn(waitlistService, "join").mockResolvedValue(entry);
  open();
  fireEvent.change(await screen.findByLabelText("Cantidad de lugares en espera"), { target: { value: "4" } });
  fireEvent.click(screen.getByRole("button", { name: "Entrar en lista de espera" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("hasta 3 lugares");
  expect(join).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Cantidad de lugares en espera"), { target: { value: "2" } });
  fireEvent.click(screen.getByRole("button", { name: "Entrar en lista de espera" }));
  expect(await screen.findByText("Entraste en la lista de espera correctamente")).toBeInTheDocument();
  expect(join).toHaveBeenCalledExactlyOnceWith("match", 2);
});
it("requires confirmation before leaving and targets the concrete entry", async () => {
  vi.spyOn(waitlistService, "mine").mockResolvedValue(entry);
  const leave = vi.spyOn(waitlistService, "leave").mockResolvedValue({ ...entry, status: "LEFT" });
  open();
  fireEvent.click(await screen.findByRole("button", { name: "Salir de la lista" }));
  expect(leave).not.toHaveBeenCalled();
  expect(screen.getByRole("heading", { name: "¿Salir de la lista de espera?" })).toHaveFocus();
  fireEvent.click(screen.getByRole("button", { name: "Confirmar salida" }));
  await waitFor(() => expect(leave).toHaveBeenCalledExactlyOnceWith("match", "entry"));
});
it("accepts the held offer once and refreshes reservations and other waitlists", async () => {
  const offer = { id: "offer", status: "PENDING" as const, places: 2, expiresAt: "2099-01-01", reservationId: null };
  vi.spyOn(waitlistService, "mine").mockResolvedValue({ ...entry, status: "OFFERED", offer });
  const accept = vi.spyOn(waitlistService, "accept").mockResolvedValue({ id: "reservation", matchId: "match", places: 2, createdAt: "2026-01-01", version: 1, originalPlaces: 2 });
  const client = open(); const invalidate = vi.spyOn(client, "invalidateQueries");
  fireEvent.click(await screen.findByRole("button", { name: "Aceptar oferta" }));
  expect(await screen.findByText("Oferta aceptada. Reserva confirmada correctamente")).toBeInTheDocument();
  expect(accept).toHaveBeenCalledExactlyOnceWith("offer");
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["reservations"] });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["waitlist"] });
});
it("never enables acceptance after the displayed deadline and confirms rejection", async () => {
  vi.spyOn(waitlistService, "mine").mockResolvedValue({ ...entry, status: "OFFERED", offer: { id: "offer", status: "PENDING", places: 2, expiresAt: "2000-01-01", reservationId: null } });
  const reject = vi.spyOn(waitlistService, "reject").mockResolvedValue({ ...entry, status: "COMPLETED" });
  open();
  expect(await screen.findByRole("button", { name: "Aceptar oferta" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Rechazar oferta" }));
  expect(reject).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Confirmar rechazo" }));
  await waitFor(() => expect(reject).toHaveBeenCalledExactlyOnceWith("offer"));
});
it("shows a recoverable error without losing the waiting request", async () => {
  vi.spyOn(waitlistService, "mine").mockResolvedValue(entry);
  vi.spyOn(waitlistService, "leave").mockRejectedValue(new Error("offline"));
  open();
  fireEvent.click(await screen.findByRole("button", { name: "Salir de la lista" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirmar salida" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Lo sentimos!");
  expect(screen.getByText("Estás en espera por 2 lugares.")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Confirmar salida" })).toBeEnabled();
});
it("paginates organizer requests with names and quantities only", async () => {
  const list = vi.spyOn(waitlistService, "organizer").mockResolvedValue({ items: [{ ...entry, user: { id: "user", name: "Ana" } }], total: 10, page: 1, pageSize: 9, hasMore: true });
  open(<OrganizerWaitlist id="match" userId="owner" />);
  expect(await screen.findByText("Ana")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
  await waitFor(() => expect(list).toHaveBeenLastCalledWith("match", 2));
  expect(screen.queryByRole("button", { name: /seleccionar/i })).not.toBeInTheDocument();
});
it("shows own pending offers in Mis partidos with a link to respond", async () => {
  vi.spyOn(waitlistService, "lists").mockResolvedValue({ items: [{ ...entry, status: "OFFERED", offer: { id: "offer", places: 2, status: "PENDING", expiresAt: "2099-01-01", reservationId: null }, match: { id: "match", startsAt: "2099-01-01", venueName: "Club", address: "1", status: "CLOSED", availablePlaces: 0, sport: { id: "s", name: "Fútbol", slug: "futbol" }, sportFormat: null, location: { id: "l", name: "Tolosa", type: "CITY" } } }], total: 1, page: 1, pageSize: 9, hasMore: false });
  open(<MyWaitlist userId="user" />);
  expect(await screen.findByRole("link", { name: "Ver oferta" })).toHaveAttribute("href", "/partidos/match");
});
it("uses fresh CSRF tokens and private no-store requests for offer mutations", async () => {
  const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ csrfToken: "csrf" }))).mockResolvedValueOnce(new Response(JSON.stringify(entry)));
  vi.stubGlobal("fetch", fetch);
  await waitlistService.reject("offer/id");
  expect(fetch).toHaveBeenNthCalledWith(2, expect.stringContaining("/waitlist/offers/offer%2Fid/reject"), expect.objectContaining({ method: "POST", credentials: "include", cache: "no-store", headers: expect.objectContaining({ "X-CSRF-Token": "csrf" }) }));
});

it("limits waiting requests to 100 places while preserving a smaller match capacity", async () => {
  vi.spyOn(waitlistService, "mine").mockResolvedValue(null);
  const join = vi.spyOn(waitlistService, "join").mockResolvedValue({ ...entry, places: 100 });
  open(<WaitlistPanel id="match" userId="user" canJoin maximum={200} />);
  const quantity = await screen.findByLabelText("Cantidad de lugares en espera");
  expect(quantity).toHaveAttribute("max", "100");
  fireEvent.change(quantity, { target: { value: "101" } });
  fireEvent.click(screen.getByRole("button", { name: "Entrar en lista de espera" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("hasta 100 lugares");
  expect(join).not.toHaveBeenCalled();
  fireEvent.change(quantity, { target: { value: "100" } });
  fireEvent.click(screen.getByRole("button", { name: "Entrar en lista de espera" }));
  await waitFor(() => expect(join).toHaveBeenCalledExactlyOnceWith("match", 100));
});
