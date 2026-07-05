self.addEventListener('push', (event) => {
  const data = event.data ? event.data.json() : {};
  const unreadCount = Number(data.unreadCount) || 0;

  event.waitUntil((async () => {
    if ('setAppBadge' in self.navigator) {
      if (unreadCount > 0) await self.navigator.setAppBadge(unreadCount);
      else if ('clearAppBadge' in self.navigator) await self.navigator.clearAppBadge();
    }

    await self.registration.showNotification(data.title || 'NetField', {
      body: data.body || 'You have a new notification',
      icon: '/netfield-icon.png',
      badge: '/netfield-icon.png',
      tag: data.tag || 'netfield-notification',
      data: { url: data.url || '/' }
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const targetUrl = new URL(event.notification.data?.url || '/', self.location.origin).href;

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find((client) => client.url.startsWith(self.location.origin));
    if (existing) {
      await existing.navigate(targetUrl);
      return existing.focus();
    }
    return self.clients.openWindow(targetUrl);
  })());
});
