import type { Metadata } from "next";
import { NotificationDetail } from "@/features/notifications/notification-detail";

export const metadata: Metadata = { title: "Detalle de notificación | Falta Gente" };
export default async function NotificationDetailPage({ params }: PageProps<"/notificaciones/[id]">) {
  const { id } = await params;
  return <NotificationDetail id={id} />;
}
