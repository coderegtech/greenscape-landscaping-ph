// Service worker for push notifications, served at /sw.js by each app (route handler `app/sw.js/route.ts`).
// One source for both origins. It runs outside React and outside the page's CSP nonce, so it stays tiny and dependency-free.
export const SW_SOURCE = `
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { body: event.data ? event.data.text() : '' }; }
  event.waitUntil((async () => {
    // A tab the person is looking at already shows this in the app (live stream + toast): no second, system-level copy.
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (wins.some((w) => w.visibilityState === 'visible' && w.focused)) return;
    await self.registration.showNotification(d.title || 'Greenscape', {
      body: d.body || '',
      icon: d.icon || '/icon.png',
      badge: '/icon.png',
      tag: d.tag, // same id = replaces instead of stacking
      data: { url: d.url || '/' },
      requireInteraction: d.priority === 'URGENT',
    });
  })());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  let url = new URL('/', self.location.origin);
  try {
    const u = new URL((event.notification.data && event.notification.data.url) || '/', self.location.origin);
    if (u.origin === self.location.origin) url = u; // never open a foreign address from a push
  } catch {}
  event.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const open = wins.find((w) => new URL(w.url).origin === self.location.origin);
    if (open) {
      await open.focus();
      if ('navigate' in open) await open.navigate(url.href).catch(() => {});
    } else {
      await self.clients.openWindow(url.href);
    }
  })());
});
`;

/** Body for the app's `/sw.js` route handler. */
export function swResponse() {
  return new Response(SW_SOURCE, { headers: { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-cache', 'service-worker-allowed': '/' } });
}
