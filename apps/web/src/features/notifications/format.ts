import type { NotificationType } from "./types";
import {
  BellRing,
  Ban,
  CalendarClock,
  CheckCircle2,
  MailCheck,
  Megaphone,
  Pencil,
  ShieldCheck,
  UserMinus,
  UserPlus,
} from "lucide-react";

export function relativeNotificationTime(value: string, now = Date.now()) {
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) return "";
  const seconds = Math.max(0, Math.floor((now - timestamp) / 1000));
  if (seconds < 60) return "ahora";
  const minutes = Math.floor(seconds / 60);
  if (minutes < 60) return `hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `hace ${hours} h`;
  if (hours < 48) return "ayer";
  const days = Math.floor(hours / 24);
  if (days < 7) return `hace ${days} días`;
  return new Intl.DateTimeFormat("es-AR", {
    day: "numeric",
    month: "short",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(timestamp);
}

export function fullNotificationDate(value: string) {
  return new Intl.DateTimeFormat("es-AR", {
    dateStyle: "full",
    timeStyle: "short",
    timeZone: "America/Argentina/Buenos_Aires",
  }).format(new Date(value));
}

export const notificationIcons = {
  MATCH_JOINED: UserPlus,
  MATCH_LEFT: UserMinus,
  MATCH_COMPLETED: CheckCircle2,
  MATCH_REMINDER: CalendarClock,
  MATCH_CANCELLED: Ban,
  MATCH_UPDATED: Pencil,
  RESERVATION_CONFIRMED: CheckCircle2,
  PLAYER_REMOVED: UserMinus,
  EMAIL_PENDING: MailCheck,
  EMAIL_VERIFIED: MailCheck,
  SESSION_SECURITY: ShieldCheck,
  APP_NEWS: Megaphone,
} satisfies Record<NotificationType, typeof BellRing>;
