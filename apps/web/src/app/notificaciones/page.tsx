import type { Metadata } from "next";
import { NotificationsCenter } from "@/features/notifications/notifications-center";

export const metadata: Metadata = { title: "Notificaciones | Falta Gente" };
export default function NotificationsPage() {
  return <NotificationsCenter />;
}
