import { mutate, request } from "@/lib/http";
import type { OrganizedMatchFilter, MatchPage, MatchFilters, MatchDetail, CreateMatchInput, MatchManagement, MatchHistoryPage, UpdateMatchInput, CancelMatchInput } from "./types";
export const matchesService = {
  organized: (filter: OrganizedMatchFilter, page: number) => request<MatchPage>(`/users/me/matches?filter=${filter}&page=${page}`),
  create: (input: CreateMatchInput) => mutate<{ id: string }>("/matches", input),
  update: (id: string, input: UpdateMatchInput) => mutate<{ id: string }>(`/matches/${encodeURIComponent(id)}`, input, "PATCH"),
  cancel: (id: string, input: CancelMatchInput) => mutate<{ id: string }>(`/matches/${encodeURIComponent(id)}/cancel`, input),
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
