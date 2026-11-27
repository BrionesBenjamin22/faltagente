"use client";

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { useSession } from "@/features/auth/session";
import { ApiError } from "@/lib/http";
import { waitlistService } from "./service";

export const waitlistKey = (userId: string, id: string) => ["waitlist", "me", userId, id];
export async function refreshWaitlist(client: QueryClient) {
  await Promise.all(["waitlist", "matches", "matches-baseline", "match-management", "organized-matches", "my-matches", "reservations", "reservation-history"].map(key => client.invalidateQueries({ queryKey: [key] })));
}
export function useOwnWaitlist(userId: string, id: string) {
  const client = useQueryClient();
  const previous = useRef<string | undefined>(undefined);
  const query = useQuery({ queryKey: waitlistKey(userId, id), queryFn: () => waitlistService.mine(id), retry: false, staleTime: 0, refetchOnWindowFocus: true, refetchInterval: query => query.state.data?.status === "OFFERED" || query.state.data?.status === "WAITING" ? 10_000 : false });
  const state = query.data === undefined ? undefined : `${query.data?.id}:${query.data?.status}:${query.data?.offer?.status}`;
  useEffect(() => {
    if (state === undefined) return;
    if (previous.current !== undefined && previous.current !== state) {
      void Promise.all(["matches", "match-management", "reservations", "reservation-history", "my-matches"].map(key => client.invalidateQueries({ queryKey: [key] })));
    }
    previous.current = state;
  }, [client, state]);
  return query;
}
export function useWaitlistAction(id: string) {
  const client = useQueryClient();
  const { synchronize } = useSession();
  return useMutation({
    mutationFn: async (action: { kind: "join"; places: number } | { kind: "leave"; entryId: string } | { kind: "accept" | "reject"; offerId: string }) => {
      if (action.kind === "join") return waitlistService.join(id, action.places);
      if (action.kind === "leave") return waitlistService.leave(id, action.entryId);
      if (action.kind === "accept") return waitlistService.accept(action.offerId);
      return waitlistService.reject(action.offerId);
    },
    retry: false,
    onSuccess: () => refreshWaitlist(client),
    onError: async error => {
      if (error instanceof ApiError && error.status === 401) await synchronize();
      if (error instanceof ApiError && error.status === 409) await refreshWaitlist(client);
    },
  });
}
