// Island Life's service worker: it only shows the island's questions and the
// golden window as notifications, and opens the app on the right one when tapped.
// Nothing is cached; the app always loads fresh.
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', event => event.waitUntil(self.clients.claim()));

const windows = () => self.clients.matchAll({ type: 'window', includeUncontrolled: true });

self.addEventListener('push', event => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { data = { title: 'Island Life', body: event.data?.text() ?? '' }; }
  event.waitUntil((async () => {
    // the golden window already shows itself in an island that's on screen
    if (data.keep && (await windows()).some(c => c.visibilityState === 'visible')) return;
    await self.registration.showNotification(data.title || 'Island Life', {
      body: data.body || '',
      tag: data.tag,
      icon: '/assets/icons/app-192.png',
      badge: '/assets/icons/app-192.png',
      data: { url: data.url || '/', keep: !!data.keep },
    });
  })());
});

// "keep" notifications (the golden window) bring an open island forward as it
// is instead of reloading it: the window lasts two minutes, a reload eats them.
self.addEventListener('notificationclick', event => {
  event.notification.close();
  const { url: path = '/', keep } = event.notification.data ?? {};
  const url = new URL(path, self.location.origin).href;
  event.waitUntil((async () => {
    for (const c of await windows()) if (new URL(c.url).origin === self.location.origin) {
      if (keep) { c.postMessage({ open: url }); return c.focus(); }
      await c.navigate(url); return c.focus();
    }
    return self.clients.openWindow(url);
  })());
});
