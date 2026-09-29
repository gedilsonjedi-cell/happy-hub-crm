/* Service worker do Web Chat: só avisos (sem cache). */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { body: event.data && event.data.text() }; }
  const title = d.title || "Nova mensagem";
  event.waitUntil(self.registration.showNotification(title, {
    body: d.body || "Você recebeu uma nova mensagem.",
    tag: d.tag || "webchat",
    renotify: true,
    data: { url: d.url || "/" },
  }));
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/", self.location.origin).href;
  event.waitUntil((async () => {
    const all = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const c of all) {
      if (c.url.split("?")[0] === url.split("?")[0] && "focus" in c) return c.focus();
    }
    return self.clients.openWindow(url);
  })());
});
