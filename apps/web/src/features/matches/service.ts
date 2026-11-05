import { request } from "@/lib/http";
import type { Location } from "@/features/locations/service";
export interface MatchSport { id: string; name: string; slug: string }
export interface MatchSportFormat { id: string; name: string; slug: string }
export interface Match { id: string; location: Location; sport: MatchSport; sportFormat: MatchSportFormat | null; startsAt: string; venueName: string; address: string; pricePerPerson: string; availablePlaces: number; status: "OPEN" | "CLOSED"; description: string | null }
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
export const matchesService = {
  detail: (id: string) => request<MatchDetail>(`/matches/${encodeURIComponent(id)}`),
  list: (locationId: string, page: number, filters: MatchFilters = {}) => {
  const params = new URLSearchParams({ locationId, page: String(page) });
  if (filters.sportId) params.set("sportId", filters.sportId);
  if (filters.sportFormatId) params.set("sportFormatId", filters.sportFormatId);
  if (filters.date) params.set("date", filters.date);
  return request<MatchPage>(`/matches?${params}`);
} };
