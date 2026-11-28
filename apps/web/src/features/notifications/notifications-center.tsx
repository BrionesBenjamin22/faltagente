"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, Trash2 } from "lucide-react";
import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";
import { useSession } from "@/features/auth/session";
import { EmptyState } from "@/components/ui/empty-state";
import { LoadingState } from "@/components/ui/loading-state";
import { Skeleton } from "@/components/ui/skeleton";
import { errorMessage } from "@/lib/http";
import { notificationCopy } from "./constants";
import { notificationIcons, relativeNotificationTime } from "./format";
import { notificationsService } from "./service";
import styles from "./notifications-center.module.css";

function base64UrlToUint8Array(value: string) {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  const binary = window.atob(padded);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

export function NotificationsCenter() {
  const session = useSession();
  const router = useRouter();
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [pushSubscriptionId, setPushSubscriptionId] = useState<string | null>(null);
  const [pushMessage, setPushMessage] = useState<string | null>(null);
  const pushConfig = useQuery({
    queryKey: ["notifications", "push-config"],
    queryFn: notificationsService.pushConfig,
    enabled: !!session.session?.authenticated,
  });
  const pushSubscribe = useMutation({
    mutationFn: notificationsService.pushSubscribe,
    onSuccess: result => {
      setPushSubscriptionId(result.id);
      setPushMessage(notificationCopy.pushEnabled);
    },
  });
  const pushUnsubscribe = useMutation({
    mutationFn: notificationsService.pushUnsubscribe,
    onSuccess: () => {
      setPushSubscriptionId(null);
      setPushMessage(notificationCopy.pushDisabled);
    },
  });
  const client = useQueryClient();
  const query = useInfiniteQuery({
    queryKey: ["notifications", "list", filter],
    queryFn: ({ pageParam }) => notificationsService.list(filter, pageParam),
    initialPageParam: 1,
    getNextPageParam: last => last.hasMore ? last.page + 1 : undefined,
    enabled: !!session.session?.authenticated,
  });
  const markAll = useMutation({
    mutationFn: notificationsService.markAllRead,
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["notifications"] }),
        query.refetch(),
      ]);
    },
  });
  const remove = useMutation({
    mutationFn: notificationsService.remove,
    onSuccess: async () => {
      await Promise.all([
        client.invalidateQueries({ queryKey: ["notifications"] }),
        query.refetch(),
      ]);
    },
  });

  async function enablePush() {
    if (!("serviceWorker" in navigator) || !("PushManager" in window) || !("Notification" in window)) {
      setPushMessage(notificationCopy.pushUnsupported);
      return;
    }
    const publicKey = pushConfig.data?.publicKey;
    if (!publicKey) {
      setPushMessage(notificationCopy.pushUnsupported);
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setPushMessage(notificationCopy.pushRejected);
      return;
    }
    const registration = await navigator.serviceWorker.register("/sw.js");
    await navigator.serviceWorker.ready;
    let subscription = await registration.pushManager.getSubscription();
    subscription ??= await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: base64UrlToUint8Array(publicKey),
    });
    const json = subscription.toJSON();
    if (!json.endpoint || !json.keys?.p256dh || !json.keys?.auth) {
      setPushMessage(notificationCopy.pushUnsupported);
      return;
    }
    pushSubscribe.mutate({
      endpoint: json.endpoint,
      keys: { p256dh: json.keys.p256dh, auth: json.keys.auth },
    });
  }

  async function disablePush() {
    if (pushSubscriptionId) await pushUnsubscribe.mutateAsync(pushSubscriptionId);
    if ("serviceWorker" in navigator) {
      const registration = await navigator.serviceWorker.getRegistration("/sw.js");
      const subscription = await registration?.pushManager.getSubscription();
      await subscription?.unsubscribe();
    }
  }

  useEffect(() => {
    if (!session.isPending && !session.isError && !session.session?.authenticated) router.replace("/auth/login");
  }, [router, session.isPending, session.isError, session.session?.authenticated]);

  if (session.isPending) return <NotificationsLoading />;
  if (!session.session?.authenticated) return <p role="status">Ingresá para consultar tus notificaciones.</p>;
  if (query.isError) return <><p className="error" role="alert">{errorMessage(query.error)}</p><button type="button" className="button secondary" onClick={() => void query.refetch()}>{notificationCopy.retry}</button></>;

  const notifications = query.data?.pages.flatMap(page => page.items) ?? [];
  const unreadCount = query.data?.pages[0]?.unreadCount ?? 0;
  return (
    <section className={styles.page}>
      <Link className={styles.back} href="/partidos"><ArrowLeft size={18} aria-hidden="true" />{notificationCopy.back}</Link>
      <header className={styles.header}>
        <div><p className={styles.eyebrow}>ACTUALIZACIONES</p><h1>Notificaciones</h1></div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="button secondary" disabled={markAll.isPending || unreadCount === 0} onClick={() => markAll.mutate()}>{markAll.isPending ? "Marcando…" : notificationCopy.markAll}</button>
          {pushConfig.data?.available ? (
            <button type="button" className="button secondary" disabled={pushSubscribe.isPending || pushUnsubscribe.isPending} onClick={() => pushSubscriptionId ? void disablePush() : void enablePush()}>
              {pushSubscriptionId ? notificationCopy.pushDisable : notificationCopy.pushEnable}
            </button>
          ) : null}
        </div>
      </header>
      {pushMessage ? <p role="status">{pushMessage}</p> : null}
      <div className={styles.filters} role="group" aria-label="Filtro de notificaciones">
        <button type="button" aria-pressed={filter === "all"} className={`button${filter === "all" ? "" : " secondary"}`} onClick={() => setFilter("all")}>{notificationCopy.all}</button>
        <button type="button" aria-pressed={filter === "unread"} className={`button${filter === "unread" ? "" : " secondary"}`} onClick={() => setFilter("unread")}>{notificationCopy.unread}</button>
      </div>
      {query.isPending ? <NotificationsLoading /> : notifications.length === 0 ? <EmptyState title={notificationCopy.emptyTitle} description={notificationCopy.emptyDescription} /> : (
        <>
          <div className={styles.list}>
            {notifications.map(item => {
              const Icon = notificationIcons[item.type];
              return (
                <article className={`${styles.item}${item.isRead ? "" : ` ${styles.unread}`}`} key={item.id}>
                  <Link className={styles.itemLink} href={`/notificaciones/${item.id}`} aria-label={`Abrir notificación: ${item.title}`}>
                    <span className={styles.icon}><Icon size={20} aria-hidden="true" /></span>
                    <span className={styles.copy}>
                      <span className={styles.titleRow}><strong>{item.title}</strong>{!item.isRead ? <span className={styles.dot} aria-label="No leída" /> : null}</span>
                      <span className={styles.body}>{item.body}</span>
                      <time className={styles.time} dateTime={item.createdAt}>{relativeNotificationTime(item.createdAt)}</time>
                    </span>
                  </Link>
                  <button type="button" className={styles.delete} disabled={remove.isPending} aria-label={`${notificationCopy.deleteLabel}: ${item.title}`} onClick={() => remove.mutate(item.id)}><Trash2 size={18} aria-hidden="true" /></button>
                </article>
              );
            })}
          </div>
          {query.hasNextPage ? <button type="button" className={`button secondary ${styles.loadMore}`} disabled={query.isFetchingNextPage} onClick={() => void query.fetchNextPage()}>{query.isFetchingNextPage ? "Cargando…" : "Cargar más"}</button> : null}
        </>
      )}
      {markAll.isError || remove.isError ? <p className="error" role="alert">{errorMessage((markAll.error ?? remove.error) as unknown)}</p> : null}
      {markAll.isSuccess ? <p role="status">{notificationCopy.markedRead}</p> : null}
      {remove.isSuccess ? <p role="status">{notificationCopy.removed}</p> : null}
    </section>
  );
}

function NotificationsLoading() {
  return <LoadingState label={notificationCopy.loading}><><Skeleton className={styles.skeleton} /><Skeleton className={styles.skeleton} /><Skeleton className={styles.skeleton} /></></LoadingState>;
}
