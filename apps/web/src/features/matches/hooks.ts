"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/http";
import { matchesService, type MatchDetail } from "./service";

export function useCreateMatch() {
  const client = useQueryClient();
  return useMutation({
    mutationFn: matchesService.create,
    retry: false,
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["matches"] }),
        client.invalidateQueries({ queryKey: ["matches-baseline"] }),
        client.invalidateQueries({ queryKey: ["organized-matches"] }),
      ]);
    },
  });
}

export function useMatchDetail(id: string, initialData?: MatchDetail) {
  return useQuery({
    queryKey: ["matches", "detail", id],
    queryFn: () => matchesService.detail(id),
    initialData,
    staleTime: 30_000,
    retry: (attempt, error) => !(error instanceof ApiError && error.status < 500) && attempt < 1,
  });
}
