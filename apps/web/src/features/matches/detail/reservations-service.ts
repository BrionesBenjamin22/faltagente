import { mutate, request } from "@/lib/http";
export interface Reservation { id: string; matchId: string; places: number; createdAt: string }
export const reservationsService = {
  mine: (id: string) => request<Reservation | null>(`/matches/${encodeURIComponent(id)}/reservations/me`),
  create: (id: string, places: number) => mutate<Reservation>(`/matches/${encodeURIComponent(id)}/reservations`, { places }),
};