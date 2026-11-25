import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { ReservationPanel } from "./reservation-panel";
import { reservationsService } from "./reservations-service";
import { waitlistService } from "@/features/waitlist/service";
import { ApiError } from "@/lib/http";
import type { MatchDetail } from "../types";
const state = vi.hoisted(() => ({ userId: "player" as string | null }));
vi.mock("@/features/auth/session", () => ({ useSession: () => ({ session: { authenticated: !!state.userId, user: state.userId ? { id: state.userId } : null }, isPending: false, isError: false }) }));
const match: MatchDetail = { id: "match", sport: { id: "sport", name: "Fútbol", slug: "futbol" }, sportFormat: null, startsAt: "2099-01-01T20:00:00Z", location: { id: "loc", name: "Tolosa" }, placeName: "Cancha", address: "1 y 2", pricePerPerson: "100", availablePlaces: 2, description: null, status: "OPEN", organizer: { id: "organizer", name: "Ana" } };
function open(value = match, client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } })) {
  const view = render(<QueryClientProvider client={client}><ReservationPanel match={value} /></QueryClientProvider>);
  return { ...view, client };
}
beforeEach(() => { state.userId = "player"; vi.spyOn(waitlistService, "mine").mockResolvedValue(null); vi.spyOn(reservationsService, "history").mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 3, matchCancellation: null, hasMore: false }); });
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });
it("offers guests login without requesting private reservations", () => {
  state.userId = null;
  const mine = vi.spyOn(reservationsService, "mine");
  open();
  expect(screen.getByRole("link", { name: "Ingresar para inscribirme" })).toHaveAttribute("href", "/auth/login");
  expect(mine).not.toHaveBeenCalled();
});
it("reserves selected places, disables duplicates and refreshes availability", async () => {
  vi.spyOn(reservationsService, "mine").mockResolvedValue(null);
  let finish!: (value: {id: string; matchId: string; places: number; createdAt: string}) => void;
  const create = vi.spyOn(reservationsService, "create").mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const { client } = open();
  const invalidate = vi.spyOn(client, "invalidateQueries");
  fireEvent.change(await screen.findByLabelText("Cantidad de lugares"), { target: { value: "2" } });
  fireEvent.click(screen.getByRole("button", { name: "Inscribirme" }));
  expect(await screen.findByRole("button", { name: "Confirmando…" })).toBeDisabled();
  expect(screen.getByLabelText("Cantidad de lugares")).toBeDisabled();
  expect(create).toHaveBeenCalledExactlyOnceWith("match", 2);
  finish({ id: "reservation", matchId: "match", places: 2, createdAt: "2098-01-01" });
  expect(await screen.findByText("Inscripción confirmada")).toBeInTheDocument();
  expect(screen.getByText("2 lugares reservados.")).toBeInTheDocument();
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["matches"] });
});
it("rehydrates confirmed reservations even when full", async () => {
  vi.spyOn(reservationsService, "mine").mockResolvedValue({ id: "r", matchId: "match", places: 1, createdAt: "2098-01-01" });
  open({ ...match, availablePlaces: 0 });
  expect(await screen.findByText("Inscripción confirmada")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Inscribirme" })).not.toBeInTheDocument();
});
it.each([
  { value: { ...match, organizer: { id: "player", name: "Ana" } }, text: "Organizás este partido. No podés reservar lugares en él." },
  { value: { ...match, availablePlaces: 0 }, text: "El partido está completo." },
  { value: { ...match, startsAt: "2000-01-01" }, text: "Este partido ya no admite inscripciones." },
  { value: { ...match, status: "CLOSED" as const }, text: "Este partido ya no admite inscripciones." },
])("prevents unavailable booking: $text", async ({ value, text }) => {
  vi.spyOn(reservationsService, "mine").mockResolvedValue(null);
  open(value);
  expect(await screen.findByText(text)).toBeInTheDocument();
  expect(screen.queryByLabelText("Cantidad de lugares")).not.toBeInTheDocument();
});
it("refreshes capacity on conflict and permits retry", async () => {
  vi.spyOn(reservationsService, "mine").mockResolvedValue(null);
  vi.spyOn(reservationsService, "create").mockRejectedValue(new ApiError(409, "MATCH_FULL", "full"));
  const { client } = open();
  const invalidate = vi.spyOn(client, "invalidateQueries");
  fireEvent.click(await screen.findByRole("button", { name: "Inscribirme" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Ya no quedan suficientes lugares");
  await waitFor(() => expect(screen.getByRole("button", { name: "Inscribirme" })).toBeEnabled());
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["matches"] });
});
it("keeps private reservation cache separate for each user", async () => {
  const mine = vi.spyOn(reservationsService, "mine").mockResolvedValueOnce({ id: "r", matchId: "match", places: 1, createdAt: "2098-01-01" }).mockResolvedValueOnce(null);
  const { client, unmount } = open();
  expect(await screen.findByText("Inscripción confirmada")).toBeInTheDocument();
  unmount(); state.userId = "another-player";
  open(match, client);
  expect(await screen.findByLabelText("Cantidad de lugares")).toBeInTheDocument();
  expect(screen.queryByText("Inscripción confirmada")).not.toBeInTheDocument();
  expect(mine).toHaveBeenCalledTimes(2);
});
it("uses fresh CSRF token and credentials for reservation creation", async () => {
  const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ csrfToken: "csrf-test" }))).mockResolvedValueOnce(new Response(JSON.stringify({ id: "r", matchId: "match", places: 2, createdAt: "2098-01-01" })));
  vi.stubGlobal("fetch", fetch);
  await reservationsService.create("match", 2);
  expect(fetch).toHaveBeenNthCalledWith(1, expect.stringContaining("/auth/csrf"), expect.objectContaining({ credentials: "include" }));
  expect(fetch).toHaveBeenNthCalledWith(2, expect.stringContaining("/matches/match/reservations"), expect.objectContaining({ method: "POST", credentials: "include", headers: expect.objectContaining({ "X-CSRF-Token": "csrf-test" }), body: JSON.stringify({ places: 2 }) }));
});
it.each(["0", "3", "1.5"])("does not submit invalid quantity %s", async value => {
  vi.spyOn(reservationsService, "mine").mockResolvedValue(null);
  const create = vi.spyOn(reservationsService, "create");
  open();
  fireEvent.change(await screen.findByLabelText("Cantidad de lugares"), { target: { value } });
  expect(screen.getByRole("button", { name: "Inscribirme" })).toBeDisabled();
  expect(create).not.toHaveBeenCalled();
});
it("retries a failed private reservation lookup before enabling booking", async () => {
  vi.spyOn(reservationsService, "mine").mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce(null);
  open();
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Inscribirme" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Reintentar" }));
  expect(await screen.findByLabelText("Cantidad de lugares")).toBeInTheDocument();
});

const reservation = { id: "r", matchId: "match", places: 2, createdAt: "2098-01-01" };
const cancelledReservation = { ...reservation, status: "CANCELLED" as const, cancellationSource: "USER" as const, cancelledAt: "2098-01-02", cancellationReason: "No puedo asistir" };
it("lets the player desist and restores focus without cancelling", async () => {
  vi.spyOn(reservationsService, "mine").mockResolvedValue(reservation);
  const cancel = vi.spyOn(reservationsService, "cancel");
  open();
  fireEvent.click(await screen.findByRole("button", { name: "Cancelar reserva" }));
  expect(screen.getByText(/Se liberarán 2 lugares/)).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Cancelar reserva" })).toHaveFocus();
  fireEvent.click(screen.getByRole("button", { name: "Volver" }));
  expect(screen.getByRole("button", { name: "Cancelar reserva" })).toHaveFocus();
  expect(cancel).not.toHaveBeenCalled();
});
it("cancels all places, blocks duplicate submissions, refreshes history and offers rebooking", async () => {
  vi.spyOn(reservationsService, "mine").mockResolvedValueOnce(reservation).mockResolvedValue(null);
  let finish!: (value: typeof cancelledReservation) => void;
  const cancel = vi.spyOn(reservationsService, "cancel").mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  const { client } = open();
  const invalidate = vi.spyOn(client, "invalidateQueries");
  fireEvent.click(await screen.findByRole("button", { name: "Cancelar reserva" }));
  fireEvent.change(screen.getByLabelText("Motivo de cancelación (opcional)"), { target: { value: "  No puedo asistir  " } });
  fireEvent.click(screen.getByRole("button", { name: "Confirmar cancelación" }));
  expect(await screen.findByRole("button", { name: "Cancelando…" })).toBeDisabled();
  expect(screen.getByRole("button", { name: "Volver" })).toBeDisabled();
  expect(cancel).toHaveBeenCalledExactlyOnceWith("match", "r", "No puedo asistir");
  finish(cancelledReservation);
  expect(await screen.findByText("Reserva cancelada correctamente")).toHaveFocus();
  expect(await screen.findByRole("button", { name: "Inscribirme" })).toBeInTheDocument();
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["reservation-history", "player", "match"] });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["match-management", "organizer", "match"] });
  expect(invalidate).toHaveBeenCalledWith({ queryKey: ["organized-matches"] });
});
it("preserves the cancellation reason after a recoverable server error", async () => {
  vi.spyOn(reservationsService, "mine").mockResolvedValue(reservation);
  vi.spyOn(reservationsService, "cancel").mockRejectedValue(new ApiError(503, "UNAVAILABLE", "unavailable"));
  open();
  fireEvent.click(await screen.findByRole("button", { name: "Cancelar reserva" }));
  fireEvent.change(screen.getByLabelText("Motivo de cancelación (opcional)"), { target: { value: "No puedo asistir" } });
  fireEvent.click(screen.getByRole("button", { name: "Confirmar cancelación" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Lo sentimos!");
  expect(screen.getByLabelText("Motivo de cancelación (opcional)")).toHaveValue("No puedo asistir");
  expect(screen.getByRole("button", { name: "Confirmar cancelación" })).toBeEnabled();
});
it("rejects an overlong cancellation reason without calling the API", async () => {
  vi.spyOn(reservationsService, "mine").mockResolvedValue(reservation);
  const cancel = vi.spyOn(reservationsService, "cancel");
  open();
  fireEvent.click(await screen.findByRole("button", { name: "Cancelar reserva" }));
  fireEvent.change(screen.getByLabelText("Motivo de cancelación (opcional)"), { target: { value: "a".repeat(501) } });
  fireEvent.click(screen.getByRole("button", { name: "Confirmar cancelación" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("El motivo puede tener hasta 500 caracteres");
  expect(cancel).not.toHaveBeenCalled();
});
it("retries a failed history lookup without blocking registration", async () => {
  vi.spyOn(reservationsService, "mine").mockResolvedValue(null);
  vi.mocked(reservationsService.history).mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ items: [cancelledReservation], total: 1, page: 1, pageSize: 3, matchCancellation: null, hasMore: false });
  open();
  expect(await screen.findByRole("button", { name: "Inscribirme" })).toBeInTheDocument();
  fireEvent.click(await screen.findByRole("button", { name: "Reintentar historial de reservas" }));
  expect(await screen.findByText("No puedo asistir")).toBeInTheDocument();
});
it.each([{ status: "CANCELLED" as const }, { startsAt: "2000-01-01" }])("hides cancellation after start or match cancellation", async changes => {
  vi.spyOn(reservationsService, "mine").mockResolvedValue(reservation);
  open({ ...match, ...changes });
  await screen.findByText("Inscripción confirmada");
  expect(screen.queryByRole("button", { name: "Cancelar reserva" })).not.toBeInTheDocument();
});
it("shows private history with pagination and safe text reasons", async () => {
  vi.spyOn(reservationsService, "mine").mockResolvedValue(null);
  const history = vi.mocked(reservationsService.history).mockResolvedValueOnce({ items: [cancelledReservation], total: 4, page: 1, pageSize: 3, matchCancellation: null, hasMore: true }).mockResolvedValueOnce({ items: [{ ...cancelledReservation, id: "old", cancellationReason: "<script>private</script>" }], total: 4, page: 2, pageSize: 3, matchCancellation: null, hasMore: false });
  open();
  expect(await screen.findByText("No puedo asistir")).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Anterior" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
  expect(await screen.findByText("<script>private</script>")).toBeInTheDocument();
  expect(history).toHaveBeenLastCalledWith("match", 2);
  expect(screen.getByRole("button", { name: "Siguiente" })).toBeDisabled();
});
it("uses a fresh CSRF token and concrete reservation identifier when cancelling", async () => {
  const fetch = vi.fn().mockResolvedValueOnce(new Response(JSON.stringify({ csrfToken: "csrf-test" }))).mockResolvedValueOnce(new Response(JSON.stringify(cancelledReservation)));
  vi.stubGlobal("fetch", fetch);
  await reservationsService.cancel("match", "old/reservation", "No puedo asistir");
  expect(fetch).toHaveBeenNthCalledWith(2, expect.stringContaining("/matches/match/reservations/old%2Freservation/cancel"), expect.objectContaining({ method: "POST", credentials: "include", cache: "no-store", headers: expect.objectContaining({ "X-CSRF-Token": "csrf-test" }), body: JSON.stringify({ reason: "No puedo asistir" }) }));
});

it("shows organizer cancellation context across history pages only when provided by the private API", async () => {
  vi.spyOn(reservationsService, "mine").mockResolvedValue(null);
  const matchCancellation = { cancelledAt: "2098-01-02", reason: "<script>Lluvia</script>" };
  vi.mocked(reservationsService.history).mockResolvedValueOnce({ items: [{ ...cancelledReservation, cancellationSource: "MATCH", cancellationReason: null }], total: 4, page: 1, pageSize: 3, hasMore: true, matchCancellation }).mockResolvedValueOnce({ items: [cancelledReservation], total: 4, page: 2, pageSize: 3, hasMore: false, matchCancellation });
  open({ ...match, status: "CANCELLED" });
  expect(await screen.findByRole("heading", { name: "Partido cancelado por el organizador" })).toBeInTheDocument();
  expect(screen.getByText("Cancelada por el organizador")).toBeInTheDocument();
  expect(screen.getByText("<script>Lluvia</script>")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Inscribirme" })).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
  expect(await screen.findByText("Cancelaste tu reserva")).toBeInTheDocument();
  expect(screen.getByText("<script>Lluvia</script>")).toBeInTheDocument();
});

it("does not infer access to organizer reasons from a voluntarily cancelled reservation", async () => {
  vi.spyOn(reservationsService, "mine").mockResolvedValue(null);
  vi.mocked(reservationsService.history).mockResolvedValue({ items: [cancelledReservation], total: 1, page: 1, pageSize: 3, hasMore: false, matchCancellation: null });
  open({ ...match, status: "CANCELLED" });
  expect(await screen.findByText("Cancelaste tu reserva")).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Partido cancelado por el organizador" })).not.toBeInTheDocument();
});

it("keeps cancellation context visible when a history page has no items", async () => {
  vi.spyOn(reservationsService, "mine").mockResolvedValue(null);
  vi.mocked(reservationsService.history).mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 3, hasMore: false, matchCancellation: { cancelledAt: "2098-01-02", reason: "Cancha cerrada" } });
  open({ ...match, status: "CANCELLED" });
  expect(await screen.findByText("Cancha cerrada")).toBeInTheDocument();
});
