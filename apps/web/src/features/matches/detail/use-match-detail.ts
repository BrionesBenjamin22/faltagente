"use client";

import { useQuery } from "@tanstack/react-query";
import { ApiError } from "@/lib/http";
import { matchesService } from "../service";
import type { MatchDetail } from "../types";

export function useMatchDetail(id: string, initialData?: MatchDetail) {
  return useQuery({
    queryKey: ["matches", "detail", id],
    queryFn: () => matchesService.detail(id),
    initialData,
    staleTime: 30_000,
    retry: (attempt, error) => !(error instanceof ApiError && error.status < 500) && attempt < 1,
  });
}
