import { mutate, request } from "@/lib/http";
export interface Reservation { id: string; matchId: string; places: number; createdAt: string }
export interface ReservationHistoryItem extends Reservation {
  status: "CONFIRMED" | "CANCELLED";
  cancelledAt: string | null;
  cancellationReason: string | null;
  cancellationSource: "USER" | "MATCH" | null;
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
  cancel: (id: string, reservationId: string, reason?: string) => mutate<ReservationHistoryItem>(`/matches/${encodeURIComponent(id)}/reservations/${encodeURIComponent(reservationId)}/cancel`, reason ? { reason } : {}),
  history: (id: string, page: number) => request<ReservationHistory>(`/matches/${encodeURIComponent(id)}/reservations/history?page=${page}`),
};
