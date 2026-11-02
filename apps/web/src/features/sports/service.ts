import { request } from "@/lib/http";

export interface SportFormat { id: string; name: string; slug: string }
export interface Sport { id: string; name: string; slug: string; formats: SportFormat[] }
export const sportsService = {
  list: async () => (await request<{ items: Sport[] }>("/sports")).items,
};
