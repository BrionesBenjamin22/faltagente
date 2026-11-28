const genericTitle = "Falta Gente";

self.addEventListener("push", event => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch {
    payload = {};
  }
  const notificationId = typeof payload.notificationId === "string" ? payload.notificationId : null;
  const options = {
    body: typeof payload.body === "string" ? payload.body : "Tenés una actualización nueva.",
    data: { url: notificationId ? `/notificaciones/${notificationId}` : "/notificaciones" },
  };
  event.waitUntil(self.registration.showNotification(genericTitle, options));
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const targetUrl = event.notification.data?.url || "/notificaciones";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(clients => {
      const sameOrigin = clients.find(client => client.url && new URL(client.url).origin === self.location.origin);
      if (sameOrigin) {
        sameOrigin.navigate(targetUrl);
        return sameOrigin.focus();
      }
      return self.clients.openWindow(targetUrl);
    }),
  );
});
