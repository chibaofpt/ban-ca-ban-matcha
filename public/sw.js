self.addEventListener("install", (event) => {
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  if (!event.data) return;

  try {
    const payload = event.data.json();
    const title = payload.title || "Bạn Cá Bán Matcha";
    const options = {
      body: payload.body || "Bạn có thông báo mới",
      icon: "/logo.png",
      badge: "/logo.png",
      data: {
        url: payload.url || "/",
      },
      vibrate: [200, 100, 200],
      requireInteraction: true,
    };

    event.waitUntil(self.registration.showNotification(title, options));
  } catch (error) {
    console.error("Error parsing push payload", error);
  }
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();

  const urlToOpen = event.notification.data?.url || "/";

  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((windowClients) => {
      // If a window is already open, focus it and navigate
      for (let i = 0; i < windowClients.length; i++) {
        const client = windowClients[i];
        if (client.url.includes(new URL(urlToOpen, self.location.origin).pathname) && "focus" in client) {
          return client.focus();
        }
      }
      // Otherwise, open a new window
      if (self.clients.openWindow) {
        return self.clients.openWindow(urlToOpen);
      }
    })
  );
});
