// @ts-nocheck -- This file runs in ServiceWorkerGlobalScope, not the DOM scope.
self.addEventListener("push", (event) => {
  let payload = {
    body: "新しいメッセージがあります",
    title: "connect",
    url: "/",
  };
  try {
    if (event.data) payload = { ...payload, ...event.data.json() };
  } catch {
    // Keep the privacy-safe generic payload.
  }
  event.waitUntil(
    self.registration.showNotification(payload.title, {
      body: payload.body,
      data: { url: payload.url },
      icon: "/favicon.ico",
      tag: "connect-message",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const target = new URL(
    event.notification.data?.url || "/",
    self.location.origin,
  ).href;
  event.waitUntil(
    clients
      .matchAll({ includeUncontrolled: true, type: "window" })
      .then((windows) => {
        const existing = windows.find(
          (windowClient) => windowClient.url === target,
        );
        return existing ? existing.focus() : clients.openWindow(target);
      }),
  );
});
