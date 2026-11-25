"use client";

import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import { ApiError } from "@/lib/http";
import { reservationsService } from "./reservations-service";

export const reservationKey = (userId: string, id: string) => ["reservations", "me", userId, id];
export const reservationHistoryKey = (userId: string, id: string) => ["reservation-history", userId, id];

async function refreshReservations(client: QueryClient, userId: string, id: string, organizerId: string) {
  await Promise.all([
    client.invalidateQueries({ queryKey: ["matches"] }),
    client.invalidateQueries({ queryKey: ["waitlist"] }),
    client.invalidateQueries({ queryKey: ["matches-baseline"] }),
    client.invalidateQueries({ queryKey: ["organized-matches"] }),
    client.invalidateQueries({ queryKey: ["my-matches", userId] }),
    client.invalidateQueries({ queryKey: ["match-management", organizerId, id] }),
    client.invalidateQueries({ queryKey: reservationHistoryKey(userId, id) }),
  ]);
}

export function useReservationHistory(userId: string, id: string, page: number) {
  return useQuery({ queryKey: [...reservationHistoryKey(userId, id), page], queryFn: () => reservationsService.history(id, page), retry: false, staleTime: 0, refetchOnWindowFocus: true });
}

export function useCreateReservation(userId: string, id: string, organizerId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: (places: number) => reservationsService.create(id, places),
    retry: false,
    onSuccess: async reservation => {
      client.setQueryData(reservationKey(userId, id), reservation);
      await refreshReservations(client, userId, id, organizerId);
    },
    onError: async error => {
      if (error instanceof ApiError && error.status === 409) await Promise.all([
        refreshReservations(client, userId, id, organizerId),
        client.invalidateQueries({ queryKey: reservationKey(userId, id) }),
      ]);
    },
  });
}

export function useCancelReservation(userId: string, id: string, organizerId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ reservationId, reason }: { reservationId: string; reason?: string }) => reservationsService.cancel(id, reservationId, reason),
    retry: false,
    onSuccess: async () => {
      client.setQueryData(reservationKey(userId, id), null);
      await Promise.all([
        refreshReservations(client, userId, id, organizerId),
        client.invalidateQueries({ queryKey: reservationKey(userId, id) }),
      ]);
    },
    onError: async error => {
      if (error instanceof ApiError && error.status === 409) await Promise.all([
        refreshReservations(client, userId, id, organizerId),
        client.invalidateQueries({ queryKey: reservationKey(userId, id) }),
      ]);
    },
  });
}
