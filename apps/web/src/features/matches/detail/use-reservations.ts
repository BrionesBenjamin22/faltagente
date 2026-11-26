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
    client.invalidateQueries({ queryKey: ["reservation-cancellations", userId, id] }),
    client.invalidateQueries({ queryKey: ["organizer-reservations", organizerId, id] }),
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

export function useReservationCancellations(userId: string, id: string, reservationId: string, page: number) {
  return useQuery({ queryKey: ["reservation-cancellations", userId, id, reservationId, page], queryFn: () => reservationsService.cancellations(id, reservationId, page), retry: false });
}

export function useOrganizerReservations(userId: string, id: string, page: number) {
  return useQuery({ queryKey: ["organizer-reservations", userId, id, page], queryFn: () => reservationsService.organizer(id, page), retry: false, staleTime: 0 });
}

export function useCancelReservation(userId: string, id: string, organizerId: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ reservationId }: { reservationId: string }) => reservationsService.cancel(id, reservationId),
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

export function useOrganizerCancelReservation(userId: string, id: string) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ reservationId, ...input }: { reservationId: string; expectedVersion: number; reason?: string }) => reservationsService.cancelByOrganizer(id, reservationId, input),
    retry: false,
    onSuccess: async () => {
      await Promise.all([refreshReservations(client, userId, id, userId), client.invalidateQueries({ queryKey: ["reservations"] })]);
    },
  });
}

export function useUpdateReservationPlaces(userId: string, id: string, organizerId: string, isOrganizer: boolean) {
  const client = useQueryClient();
  return useMutation({
    mutationFn: ({ reservationId, ...input }: { reservationId: string; expectedVersion: number; places: number; reason?: string }) => reservationsService.updatePlaces(id, reservationId, input),
    retry: false,
    onSuccess: async reservation => {
      if (!isOrganizer) client.setQueryData(reservationKey(userId, id), reservation);
      await Promise.all([refreshReservations(client, userId, id, organizerId), client.invalidateQueries({ queryKey: ["reservations"] })]);
    },
  });
}