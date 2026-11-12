import { mutate, request } from "@/lib/http";
import type { Location } from "@/features/locations/service";
export interface MatchSport { id: string; name: string; slug: string }
export interface MatchSportFormat { id: string; name: string; slug: string }
export interface Match { id: string; location: Location; sport: MatchSport; sportFormat: MatchSportFormat | null; startsAt: string; venueName: string; address: string; pricePerPerson: string; availablePlaces: number; status: "OPEN" | "CLOSED" | "CANCELLED"; description: string | null }
export type OrganizedMatchFilter = "upcoming" | "past" | "cancelled";
export interface MatchPage { items: Match[]; total: number; page: number; pageSize: number; hasMore: boolean }
export interface MatchFilters { sportId?: string; sportFormatId?: string; date?: string }
export interface MatchDetail {
  id: string;
  sport: MatchSport;
  sportFormat: MatchSportFormat | null;
  startsAt: string;
  location: { id: string; name: string };
  placeName: string;
  address: string;
  pricePerPerson: string;
  availablePlaces: number;
  description: string | null;
  status: "OPEN" | "CLOSED" | "CANCELLED";
  organizer: { id: string; name: string };
}
export interface CreateMatchInput {
  sportId: string;
  sportFormatId?: string | null;
  locationId: string;
  startsAt: string;
  placeName: string;
  address: string;
  pricePerPerson: string;
  totalPlaces: number;
  description?: string | null;
}
export interface MatchManagement {
  id: string;
  totalPlaces: number;
  availablePlaces: number;
  version: number;
  createdAt: string;
  updatedAt: string;
}
export interface MatchHistoryPage {
  items: { id: string; actor: { id: string; name: string }; occurredAt: string; event: "PUBLISHED"; changes: Record<string, { before: unknown; after: unknown }> }[];
  total: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}
export const matchesService = {
  organized: (filter: OrganizedMatchFilter, page: number) => request<MatchPage>(`/users/me/matches?filter=${filter}&page=${page}`),
  create: (input: CreateMatchInput) => mutate<{ id: string }>("/matches", input),
  management: (id: string) => request<MatchManagement>(`/matches/${encodeURIComponent(id)}/management`),
  history: (id: string, page: number) => request<MatchHistoryPage>(`/matches/${encodeURIComponent(id)}/history?page=${page}`),
  detail: (id: string) => request<MatchDetail>(`/matches/${encodeURIComponent(id)}`),
  list: (locationId: string, page: number, filters: MatchFilters = {}) => {
  const params = new URLSearchParams({ locationId, page: String(page) });
  if (filters.sportId) params.set("sportId", filters.sportId);
  if (filters.sportFormatId) params.set("sportFormatId", filters.sportFormatId);
  if (filters.date) params.set("date", filters.date);
  return request<MatchPage>(`/matches?${params}`);
} };
