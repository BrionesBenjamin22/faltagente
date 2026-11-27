"use client";

import Link from "next/link";
import { Bell } from "lucide-react";
import { useUnreadNotificationCount } from "./hooks";
import { notificationCopy } from "./constants";
import styles from "./notifications-center.module.css";

export function NotificationBell({ authenticated }: { authenticated: boolean }) {
  const count = useUnreadNotificationCount(authenticated);
  const unread = count.data?.unreadCount ?? 0;
  const badge = unread > 9 ? "9+" : String(unread);
  return (
    <Link
      href="/notificaciones"
      className={styles.bell}
      aria-label={unread > 0 ? `${notificationCopy.bellLabel}. ${unread} ${notificationCopy.unreadBadge}.` : notificationCopy.bellLabel}
    >
      <Bell size={21} aria-hidden="true" />
      {unread > 0 ? <span className={styles.badge} aria-hidden="true">{badge}</span> : null}
    </Link>
  );
}
