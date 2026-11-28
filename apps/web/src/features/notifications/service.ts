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
  pushConfig: () => request<{ available: boolean; publicKey: string | null }>("/notifications/push/config"),
  pushSubscribe: (subscription: { endpoint: string; keys: { p256dh: string; auth: string } }) =>
    mutate<{ id: string; endpoint: string }>("/notifications/push/subscriptions", subscription),
  pushUnsubscribe: (id: string) =>
    mutate<void>(`/notifications/push/subscriptions/${encodeURIComponent(id)}`, undefined, "DELETE"),
};
