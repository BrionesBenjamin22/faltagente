import { mutate, request } from "@/lib/http";
export interface Reservation { id: string; matchId: string; places: number; createdAt: string; version: number; originalPlaces: number }
export interface ReservationPage<T> { items: T[]; total: number; page: number; pageSize: number; hasMore: boolean }
export interface OrganizerReservation extends Reservation { holder: { id: string; name: string } }
export interface Cancellation { id: string; previousPlaces: number; remainingPlaces: number; occurredAt: string; source: "USER" | "MATCH" | "ORGANIZER"; reason: string | null }
export interface ReservationHistoryItem extends Reservation {
  status: "CONFIRMED" | "CANCELLED";
  cancelledAt: string | null;
  cancellationReason: string | null;
  cancellationSource: "USER" | "MATCH" | "ORGANIZER" | null;
}
export interface ReservationHistory {
  matchCancellation: { cancelledAt: string; reason: string | null } | null;
  items: ReservationHistoryItem[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}
export const reservationsService = {
  mine: (id: string) => request<Reservation | null>(`/matches/${encodeURIComponent(id)}/reservations/me`),
  create: (id: string, places: number) => mutate<Reservation>(`/matches/${encodeURIComponent(id)}/reservations`, { places }),
  updatePlaces: (id: string, reservationId: string, input: { expectedVersion: number; places: number; reason?: string }) => mutate<Reservation>(`/matches/${encodeURIComponent(id)}/reservations/${encodeURIComponent(reservationId)}/places`, input, "PATCH"),
  organizer: (id: string, page: number) => request<ReservationPage<OrganizerReservation>>(`/matches/${encodeURIComponent(id)}/reservations?page=${page}`),
  cancellations: (id: string, reservationId: string, page: number) => request<ReservationPage<Cancellation>>(`/matches/${encodeURIComponent(id)}/reservations/${encodeURIComponent(reservationId)}/cancellations?page=${page}`),
  cancel: (id: string, reservationId: string) => mutate<ReservationHistoryItem>(`/matches/${encodeURIComponent(id)}/reservations/${encodeURIComponent(reservationId)}/cancel`, {}),
  cancelByOrganizer: (id: string, reservationId: string, input: { expectedVersion: number; reason?: string }) => mutate<{ id: string }>(`/matches/${encodeURIComponent(id)}/reservations/${encodeURIComponent(reservationId)}/cancel-by-organizer`, input),
  history: (id: string, page: number) => request<ReservationHistory>(`/matches/${encodeURIComponent(id)}/reservations/history?page=${page}`),
};
