"use client";

import { useMutation, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { matchesService } from "../service";
import type { CancelMatchInput, UpdateMatchInput } from "../types";

export async function invalidateMatch(client: QueryClient, ownerId: string, id: string) {
  await Promise.all([
    client.invalidateQueries({ queryKey: ["matches"] }),
    client.invalidateQueries({ queryKey: ["matches-baseline"] }),
    client.invalidateQueries({ queryKey: ["organized-matches", ownerId] }),
    client.invalidateQueries({ queryKey: ["match-management", ownerId, id] }),
    client.resetQueries({ queryKey: ["match-history", ownerId, id] }),
  ]);
}
export function useUpdateMatch(ownerId: string, id: string) {
  const client = useQueryClient();
  return useMutation({ mutationFn: (input: UpdateMatchInput) => matchesService.update(id, input), retry: false, onSuccess: () => invalidateMatch(client, ownerId, id) });
}
export function useCancelMatch(ownerId: string, id: string) {
  const client = useQueryClient();
  return useMutation({ mutationFn: (input: CancelMatchInput) => matchesService.cancel(id, input), retry: false, onSuccess: () => invalidateMatch(client, ownerId, id) });
}
