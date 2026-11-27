import { mutate, request } from "@/lib/http";
import type { OrganizedMatchFilter, MyMatchRole, MyMatchPage, MatchPage, MatchFilters, MatchDetail, CreateMatchInput, MatchManagement, UpdateMatchInput, CancelMatchInput } from "./types";
export const matchesService = {
  organized: (filter: OrganizedMatchFilter, page: number) => request<MatchPage>(`/users/me/matches?filter=${filter}&page=${page}`),
  mine: (role: MyMatchRole, filter: OrganizedMatchFilter, page: number) => request<MyMatchPage>(`/users/me/matches?filter=${filter}&page=${page}&role=${role}`),
  create: (input: CreateMatchInput) => mutate<{ id: string }>("/matches", input),
  update: (id: string, input: UpdateMatchInput) => mutate<{ id: string }>(`/matches/${encodeURIComponent(id)}`, input, "PATCH"),
  cancel: (id: string, input: CancelMatchInput) => mutate<{ id: string }>(`/matches/${encodeURIComponent(id)}/cancel`, input),
  management: (id: string) => request<MatchManagement>(`/matches/${encodeURIComponent(id)}/management`),
  detail: (id: string) => request<MatchDetail>(`/matches/${encodeURIComponent(id)}`),
  list: (locationId: string, page: number, filters: MatchFilters = {}, preferredLocationId?: string) => {
  const params = new URLSearchParams({ page: String(page) });
  if (locationId) params.set("locationId", locationId);
  if (preferredLocationId) params.set("preferredLocationId", preferredLocationId);
  if (filters.sportId) params.set("sportId", filters.sportId);
  if (filters.sportFormatId) params.set("sportFormatId", filters.sportFormatId);
  if (filters.date) params.set("date", filters.date);
  return request<MatchPage>(`/matches?${params}`);
} };
