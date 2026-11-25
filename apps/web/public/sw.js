self.addEventListener('install', event => {
  event.waitUntil(caches.open('trackfield-offline-v1').then(cache => cache.add('/offline.html')));
});
self.addEventListener('activate', event => {
  event.waitUntil((async () => {
    const keys = await caches.keys();
    await Promise.all(keys.filter(key => key.startsWith('trackfield-offline-') && key !== 'trackfield-offline-v1').map(key => caches.delete(key)));
    await self.clients.claim();
  })());
});
// Business data, authenticated HTML and API responses are never cached here.
self.addEventListener('fetch', event => {
  const url = new URL(event.request.url);
  if (event.request.mode !== 'navigate' || event.request.method !== 'GET' || url.origin !== self.location.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith('/uploads/')) return;
  event.respondWith(fetch(event.request).catch(async () => (await caches.match('/offline.html')) || Response.error()));
});

self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { body: event.data.text() }; }
  if (!data || typeof data !== 'object') data = {};
  const unreadCount = Number(data.unreadCount) || 0;

  event.waitUntil((async () => {
    if ('setAppBadge' in self.navigator) {
      try {
        if (unreadCount > 0) await self.navigator.setAppBadge(unreadCount);
        else if ('clearAppBadge' in self.navigator) await self.navigator.clearAppBadge();
      } catch { /* Badging must not prevent notification delivery. */ }
    }

    await self.registration.showNotification(data.title || 'TrackField', {
      body: data.body || 'You have a new notification',
      icon: '/trackfield-icon.png',
      badge: '/trackfield-icon.png',
      tag: data.tag || 'trackfield-notification',
      data: { url: data.url || '/' }
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  let targetUrl = self.location.origin + '/';
  try {
    const candidate = new URL(event.notification.data?.url || '/', self.location.origin);
    if (candidate.origin === self.location.origin) targetUrl = candidate.href;
  } catch { /* Malformed links open the app home. */ }

  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const existing = windows.find((client) => new URL(client.url).origin === self.location.origin);
    if (existing) {
      await existing.navigate(targetUrl);
      return existing.focus();
    }
    return self.clients.openWindow(targetUrl);
  })());
});
