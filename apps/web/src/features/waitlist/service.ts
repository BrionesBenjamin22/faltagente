import { mutate, request } from "@/lib/http";
import type { Reservation } from "@/features/matches/detail/reservations-service";
import type { MyWaitlistEntry, OrganizerEntry, WaitlistEntry, WaitlistPage } from "./types";

const path = (id: string) => `/matches/${encodeURIComponent(id)}/waitlist`;
export const waitlistService = {
  mine: (id: string) => request<WaitlistEntry | null>(`${path(id)}/me`),
  join: (id: string, places: number) => mutate<WaitlistEntry>(path(id), { places }),
  leave: (id: string, entryId: string) => mutate<WaitlistEntry>(`${path(id)}/${encodeURIComponent(entryId)}/leave`),
  accept: (offerId: string) => mutate<Reservation>(`/waitlist/offers/${encodeURIComponent(offerId)}/accept`),
  reject: (offerId: string) => mutate<WaitlistEntry>(`/waitlist/offers/${encodeURIComponent(offerId)}/reject`),
  organizer: (id: string, page: number) => request<WaitlistPage<OrganizerEntry>>(`${path(id)}?page=${page}`),
  lists: (page: number) => request<WaitlistPage<MyWaitlistEntry>>(`/users/me/waitlist?page=${page}`),
};
