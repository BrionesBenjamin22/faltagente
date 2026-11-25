import type { MatchDetail, MatchSport, MatchSportFormat } from "@/features/matches/types";

export type EntryStatus = "WAITING" | "OFFERED" | "COMPLETED" | "LEFT" | "EXPIRED" | "INVALIDATED";
export interface WaitlistOffer { id: string; status: "PENDING" | "ACCEPTED" | "REJECTED" | "EXPIRED" | "INVALIDATED"; places: number; expiresAt: string; reservationId: string | null }
export interface WaitlistEntry { id: string; matchId: string; places: number; status: EntryStatus; createdAt: string; offer: WaitlistOffer | null }
export interface WaitlistPage<T> { items: T[]; total: number; page: number; pageSize: number; hasMore: boolean }
export interface OrganizerEntry extends WaitlistEntry { user: { id: string; name: string } }
export interface MyWaitlistEntry extends WaitlistEntry { match: { id: string; startsAt: string; venueName: string; address: string; status: MatchDetail["status"]; availablePlaces: number; sport: MatchSport; sportFormat: MatchSportFormat | null; location: { id: string; name: string; type: string } } }
