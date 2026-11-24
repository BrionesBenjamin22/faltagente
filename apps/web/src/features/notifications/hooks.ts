"use client";

import { useQuery } from "@tanstack/react-query";
import { notificationsService } from "./service";

export function useUnreadNotificationCount(enabled = true) {
  return useQuery({
    queryKey: ["notifications", "unread-count"],
    queryFn: notificationsService.unreadCount,
    enabled,
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}
