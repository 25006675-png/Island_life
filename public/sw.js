// Island Life's service worker: it only shows the island's questions as
// phone notifications and opens the app on the right one when tapped.
// Nothing is cached; the app always loads fresh.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: 'Island Life', body: event.data?.text() ?? '' }; }
  event.waitUntil(self.registration.showNotification(data.title || 'Island Life', {
    body: data.body || '',
    tag: data.tag,
    icon: '/assets/icons/app-192.png',
    badge: '/assets/icons/app-192.png',
    data: { url: data.url || '/' },
  }));
});

self.addEventListener('notificationclick', event => {
  event.notification.close();
  const url = new URL(event.notification.data?.url || '/', self.location.origin).href;
  event.waitUntil((async () => {
    const open = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const c of open) if (new URL(c.url).origin === self.location.origin) { await c.navigate(url); return c.focus(); }
    return self.clients.openWindow(url);
  })());
});
