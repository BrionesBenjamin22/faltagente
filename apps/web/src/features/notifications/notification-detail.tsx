"use client";

import { useEffect } from "react";
import Link from "next/link";
import { ArrowLeft, CalendarDays, MapPin, Ticket } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useSession } from "@/features/auth/session";
import { errorMessage } from "@/lib/http";
import { notificationCopy } from "./constants";
import { fullNotificationDate, notificationIcons } from "./format";
import { notificationsService } from "./service";
import styles from "./notifications-center.module.css";

export function NotificationDetail({ id }: { id: string }) {
  const session = useSession();
  const router = useRouter();
  const client = useQueryClient();
  const query = useQuery({
    queryKey: ["notifications", "detail", id],
    queryFn: () => notificationsService.detail(id),
    enabled: !!session.session?.authenticated,
  });
  useEffect(() => {
    if (!session.isPending && !session.isError && !session.session?.authenticated) router.replace("/auth/login");
  }, [router, session.isPending, session.isError, session.session?.authenticated]);
  useEffect(() => {
    if (query.isSuccess) {
      void notificationsService.markRead(id).catch(() => undefined);
      void client.invalidateQueries({ queryKey: ["notifications", "unread-count"] });
    }
  }, [client, id, query.isSuccess]);

  if (session.isPending || query.isPending) return <div className={styles.detailPage}><SkeletonDetail /></div>;
  if (query.isError) return <div className={styles.detailPage}><p className="error" role="alert">{errorMessage(query.error)}</p><button type="button" className="button secondary" onClick={() => void query.refetch()}>{notificationCopy.retry}</button></div>;
  const notification = query.data;
  const Icon = notificationIcons[notification.type];
  const match = notification.relatedMatch;
  const matchDate = match ? new Intl.DateTimeFormat("es-AR", { dateStyle: "full", timeStyle: "short", timeZone: "America/Argentina/Buenos_Aires" }).format(new Date(match.startsAt)) : null;
  return (
    <article className={styles.detailPage}>
      <Link className={styles.back} href="/notificaciones"><ArrowLeft size={18} aria-hidden="true" />{notificationCopy.back}</Link>
      <section className={styles.detailCard}>
        <span className={styles.detailIcon}><Icon size={24} aria-hidden="true" /></span>
        <p className={styles.detailTime}><time dateTime={notification.createdAt}>{fullNotificationDate(notification.createdAt)}</time></p>
        <h1>{notification.title}</h1>
        <p className={styles.detailBody}>{notification.detail ?? notification.body}</p>
        {match ? (
          <div className={styles.matchData} aria-label="Datos del partido relacionado">
            <p><CalendarDays size={18} aria-hidden="true" /><span><strong>{match.sport.name}</strong><small>{matchDate}</small></span></p>
            <p><MapPin size={18} aria-hidden="true" /><span><strong>{match.venueName}</strong><small>{match.address}</small></span></p>
            <p><Ticket size={18} aria-hidden="true" /><span><strong>Cupos disponibles</strong><small>{match.availablePlaces} de {match.totalPlaces}</small></span></p>
            <Link className="button" href={`/partidos/${match.id}`}>{notificationCopy.matchAction}</Link>
          </div>
        ) : null}
      </section>
    </article>
  );
}

function SkeletonDetail() {
  return <><div className="skeleton" style={{ height: 44, width: 120 }} /><div className={styles.detailCard}><div className="skeleton" style={{ height: 28, width: "70%" }} /><div className="skeleton" style={{ height: 16, marginTop: 18 }} /><div className="skeleton" style={{ height: 90, marginTop: 18 }} /></div></>;
}
