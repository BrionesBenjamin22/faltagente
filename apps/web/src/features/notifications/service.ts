import { mutate, request } from "@/lib/http";
import type { AppNotification, NotificationPage } from "./types";

export const notificationsService = {
  unreadCount: () => request<{ unreadCount: number }>("/notifications/unread-count"),
  list: (filter: "all" | "unread", page: number, pageSize = 9) =>
    request<NotificationPage>(`/notifications?filter=${filter}&page=${page}&pageSize=${pageSize}`),
  detail: (id: string) => request<AppNotification>(`/notifications/${encodeURIComponent(id)}`),
  markRead: (id: string) => mutate<{ id: string }>(`/notifications/${encodeURIComponent(id)}/read`, undefined, "PATCH"),
  markAllRead: () => mutate<{ updated: boolean }>("/notifications/read-all"),
  remove: (id: string) => mutate<void>(`/notifications/${encodeURIComponent(id)}`, undefined, "DELETE"),
};
