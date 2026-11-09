/*
 * Service worker de Frais et Français : affiche les notifications de
 * livraison et ouvre l'espace client quand on les touche.
 */
self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("push", (event) => {
  let donnees = {};
  try {
    donnees = event.data ? event.data.json() : {};
  } catch {
    donnees = { title: "Frais et Français", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(donnees.title || "Frais et Français", {
      body: donnees.body || "",
      icon: "/icone-192.png",
      badge: "/icone-192.png",
      tag: donnees.tag || "frais-et-francais",
      renotify: true,
      data: { url: donnees.url || "/espace" },
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = new URL((event.notification.data && event.notification.data.url) || "/espace", self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((fenetres) => {
      for (const f of fenetres) {
        if (f.url.startsWith(self.location.origin) && "focus" in f) {
          f.navigate(url);
          return f.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
