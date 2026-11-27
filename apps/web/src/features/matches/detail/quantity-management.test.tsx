import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { afterEach, expect, it, vi } from "vitest";
import { QuantityManagement } from "./quantity-management";
import { OrganizerReservations, OrganizerReservationCancellation } from "./organizer-reservations";
import { ReservationCancellations } from "./reservation-cancellations";
import { reservationsService, type Reservation } from "./reservations-service";
import { ApiError } from "@/lib/http";
import { retainedPlacesSchema } from "./reservation-validation";

vi.mock("@/features/auth/session", () => ({ useSession: () => ({ synchronize: vi.fn() }) }));
const reservation: Reservation = { id: "reservation", matchId: "match", places: 3, originalPlaces: 4, version: 2, createdAt: "2098-01-01" };
function wrapper(children: React.ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  const view = render(<QueryClientProvider client={client}>{children}</QueryClientProvider>);
  return { ...view, client };
}
function open(isOrganizer = false) {
  const onClose = vi.fn(); const onSuccess = vi.fn(); const onReload = vi.fn().mockResolvedValue(undefined);
  return { ...wrapper(<QuantityManagement reservation={reservation} userId={isOrganizer ? "organizer" : "player"} organizerId="organizer" isOrganizer={isOrganizer} onClose={onClose} onSuccess={onSuccess} onReload={onReload} />), onClose, onSuccess, onReload };
}
afterEach(() => { vi.restoreAllMocks(); vi.unstubAllGlobals(); });

it("enforces the agreed maximum of 100 retained places", () => {
  expect(retainedPlacesSchema(200).safeParse(100).success).toBe(true);
  expect(retainedPlacesSchema(200).safeParse(101).success).toBe(false);
});

it("does not call the backend for unchanged quantities and omits the holder reason", async () => {
  const update = vi.spyOn(reservationsService, "updatePlaces");
  const { onSuccess } = open();
  expect(screen.queryByLabelText("Motivo de la reducción (opcional)")).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Revisar reducción" }));
  await waitFor(() => expect(onSuccess).toHaveBeenCalledWith("No hay cambios para guardar."));
  expect(update).not.toHaveBeenCalled();
});

it.each(["0", "4", "1.5"])("rejects invalid retained quantity %s", async value => {
  const update = vi.spyOn(reservationsService, "updatePlaces");
  open();
  fireEvent.change(screen.getByLabelText("Lugares a conservar"), { target: { value } });
  fireEvent.click(screen.getByRole("button", { name: "Revisar reducción" }));
  expect(await screen.findByRole("alert")).toBeInTheDocument();
  expect(update).not.toHaveBeenCalled();
});

it("confirms released and retained places, then sends only the new quantity and version", async () => {
  const update = vi.spyOn(reservationsService, "updatePlaces").mockResolvedValue({ ...reservation, places: 2, version: 3 });
  const { onSuccess, client } = open();
  const invalidate = vi.spyOn(client, "invalidateQueries");
  fireEvent.change(screen.getByLabelText("Lugares a conservar"), { target: { value: "2" } });
  fireEvent.click(screen.getByRole("button", { name: "Revisar reducción" }));
  expect(await screen.findByRole("heading", { name: "Confirmar reducción" })).toHaveFocus();
  expect(screen.getByText(/Se liberarán 1 lugar.*conservará 2 lugares/)).toBeInTheDocument();
  expect(update).not.toHaveBeenCalled();
  fireEvent.click(screen.getByRole("button", { name: "Confirmar reducción" }));
  await waitFor(() => expect(onSuccess).toHaveBeenCalledWith("Lugares reducidos correctamente."));
  expect(update).toHaveBeenCalledExactlyOnceWith("match", "reservation", { expectedVersion: 2, places: 2 });
  for (const queryKey of [["matches"], ["waitlist"], ["my-matches", "player"], ["reservation-history", "player", "match"], ["match-management", "organizer", "match"]]) expect(invalidate).toHaveBeenCalledWith({ queryKey });
});

it("preserves the quantity after an error and offers explicit reload on conflict", async () => {
  vi.spyOn(reservationsService, "updatePlaces").mockRejectedValueOnce(new Error("offline")).mockRejectedValueOnce(new ApiError(409, "RESERVATION_VERSION_CONFLICT", "Recargá la reserva."));
  const { onClose, onReload } = open();
  fireEvent.change(screen.getByLabelText("Lugares a conservar"), { target: { value: "2" } });
  fireEvent.click(screen.getByRole("button", { name: "Revisar reducción" }));
  fireEvent.click(await screen.findByRole("button", { name: "Confirmar reducción" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("Lo sentimos!");
  expect(screen.getByLabelText("Lugares a conservar")).toHaveValue(2);
  fireEvent.click(screen.getByRole("button", { name: "Confirmar reducción" }));
  fireEvent.click(await screen.findByRole("button", { name: "Recargar reserva" }));
  await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  expect(onReload).toHaveBeenCalledOnce();
});

it("lets the organizer reduce with an optional reason without caching the holder as their own reservation", async () => {
  const update = vi.spyOn(reservationsService, "updatePlaces").mockResolvedValue({ ...reservation, places: 2, version: 3 });
  const { onSuccess, client } = open(true);
  fireEvent.change(screen.getByLabelText("Lugares a conservar"), { target: { value: "2" } });
  fireEvent.change(screen.getByLabelText("Motivo de la reducción (opcional)"), { target: { value: "  Cambio de organización  " } });
  fireEvent.click(screen.getByRole("button", { name: "Revisar reducción" }));
  fireEvent.click(await screen.findByRole("button", { name: "Confirmar reducción" }));
  await waitFor(() => expect(onSuccess).toHaveBeenCalled());
  expect(update).toHaveBeenCalledExactlyOnceWith("match", "reservation", { expectedVersion: 2, places: 2, reason: "Cambio de organización" });
  expect(client.getQueryData(["reservations", "me", "organizer", "match"])).toBeUndefined();
});

it("offers reduction and full cancellation in organizer groups and confirms an optional cancellation reason", async () => {
  const cancel = vi.spyOn(reservationsService, "cancelByOrganizer").mockResolvedValue({ id: reservation.id });
  const organizer = vi.spyOn(reservationsService, "organizer").mockResolvedValue({ items: [{ ...reservation, holder: { id: "player", name: "Titular" } }], total: 1, page: 1, pageSize: 9, hasMore: false });
  wrapper(<OrganizerReservations userId="organizer" matchId="match" canCancel />);
  expect(await screen.findByRole("button", { name: "Reducir lugares de Titular" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "Cancelar reserva de Titular" }));
  const region = screen.getByRole("region", { name: "Cancelar reserva de Titular" });
  expect(within(region).getByRole("heading")).toHaveFocus();
  fireEvent.change(within(region).getByLabelText("Motivo de cancelación (opcional)"), { target: { value: "  Cambio de organización  " } });
  expect(cancel).not.toHaveBeenCalled();
  organizer.mockResolvedValue({ items: [], total: 0, page: 1, pageSize: 9, hasMore: false });
  fireEvent.click(within(region).getByRole("button", { name: "Confirmar cancelación de reserva" }));
  expect(await screen.findByText("Reserva cancelada correctamente.")).toHaveFocus();
  expect(cancel).toHaveBeenCalledExactlyOnceWith("match", "reservation", { expectedVersion: 2, reason: "Cambio de organización" });
});

it("retains the organizer reason after failure and validates its length before cancelling", async () => {
  const cancel = vi.spyOn(reservationsService, "cancelByOrganizer").mockRejectedValue(new Error("offline"));
  wrapper(<OrganizerReservationCancellation reservation={{ ...reservation, holder: { id: "player", name: "Titular" } }} userId="organizer" onClose={vi.fn()} onSuccess={vi.fn()} onReload={vi.fn()} />);
  const reason = screen.getByLabelText("Motivo de cancelación (opcional)");
  fireEvent.change(reason, { target: { value: "a".repeat(501) } });
  fireEvent.click(screen.getByRole("button", { name: "Confirmar cancelación de reserva" }));
  expect(await screen.findByRole("alert")).toHaveTextContent("hasta 500 caracteres");
  expect(cancel).not.toHaveBeenCalled();
  fireEvent.change(reason, { target: { value: "Motivo del organizador" } });
  fireEvent.click(screen.getByRole("button", { name: "Confirmar cancelación de reserva" }));
  expect(await screen.findByText(/Lo sentimos!/)).toBeInTheDocument();
  expect(reason).toHaveValue("Motivo del organizador");
});

it("paginates private movements with quantities and renders organizer reasons as text", async () => {
  const item = { id: "c", previousPlaces: 3, remainingPlaces: 2, occurredAt: "2098-01-01", source: "ORGANIZER" as const, reason: "<img onerror=alert(1)>" };
  const cancellations = vi.spyOn(reservationsService, "cancellations").mockResolvedValueOnce({ items: [item], total: 4, page: 1, pageSize: 3, hasMore: true }).mockResolvedValueOnce({ items: [{ ...item, id: "old", remainingPlaces: 0 }], total: 4, page: 2, pageSize: 3, hasMore: false });
  wrapper(<ReservationCancellations userId="player" matchId="match" reservationId="reservation" onClose={vi.fn()} />);
  expect(await screen.findByText("<img onerror=alert(1)>")).toBeInTheDocument();
  expect(screen.getByText("Reducción de lugares")).toBeInTheDocument();
  expect(document.querySelector("img")).toBeNull();
  fireEvent.click(screen.getByRole("button", { name: "Siguiente" }));
  expect(await screen.findByText("Cancelación total")).toBeInTheDocument();
  expect(cancellations).toHaveBeenLastCalledWith("match", "reservation", 2);
});

it("uses fresh CSRF, credentials and no-store for quantity edits", async () => {
  const fetch = vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify({ csrfToken: "csrf-test" }))));
  vi.stubGlobal("fetch", fetch);
  await reservationsService.updatePlaces("match", "r/id", { expectedVersion: 2, places: 2 });
  expect(fetch).toHaveBeenNthCalledWith(2, expect.stringContaining("/reservations/r%2Fid/places"), expect.objectContaining({ method: "PATCH", credentials: "include", cache: "no-store", headers: expect.objectContaining({ "X-CSRF-Token": "csrf-test" }), body: JSON.stringify({ expectedVersion: 2, places: 2 }) }));
});
