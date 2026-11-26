export type NotificationType =
  | "MATCH_JOINED"
  | "MATCH_LEFT"
  | "MATCH_COMPLETED"
  | "MATCH_REMINDER"
  | "MATCH_CANCELLED"
  | "MATCH_UPDATED"
  | "RESERVATION_CONFIRMED"
  | "PLAYER_REMOVED"
  | "EMAIL_PENDING"
  | "EMAIL_VERIFIED"
  | "SESSION_SECURITY"
  | "APP_NEWS";

export interface AppNotification {
  id: string;
  type: NotificationType;
  title: string;
  body: string;
  detail: string | null;
  relatedMatchId: string | null;
  metadata: Record<string, unknown>;
  isRead: boolean;
  readAt: string | null;
  createdAt: string;
  actorUser: { id: string; name: string } | null;
  relatedMatch: {
    id: string;
    startsAt: string;
    venueName: string;
    address: string;
    availablePlaces: number;
    totalPlaces: number;
    sport: { id: string; name: string; slug: string };
  } | null;
}

export interface NotificationPage {
  items: AppNotification[];
  total: number;
  unreadCount: number;
  page: number;
  pageSize: number;
  hasMore: boolean;
}
