"use client";

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { matchesService } from "../service";

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
