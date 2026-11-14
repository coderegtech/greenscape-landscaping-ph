// Service worker, served at /sw.js by each app (route handler `app/sw.js/route.ts`). One source for every origin.
// It runs outside React and outside the page's CSP nonce, so it stays tiny and dependency-free.
//
// The customer site calls swResponse() and gets push only. The Admin and Employee apps pass their name and also get:
//  - a versioned cache holding exactly the offline screen and the app's icons (public, the same for everyone);
//  - a fallback to that screen when a page navigation fails.
// Nothing fetched at run time is ever stored: pages, API answers, sessions and files always come from the network,
// so a signed-in person's data cannot be served from a cache to them later or to someone else on the device.
import { pwaIcon, type PwaApp } from '../pwa/app';

// New on every build (the route is static), so a deployment installs a new worker and drops the previous cache.
const BUILD = Date.now().toString(36);

const PUSH = (icon: string, badge: string) => `
self.addEventListener('push', (event) => {
  let d = {};
  try { d = event.data ? event.data.json() : {}; } catch { d = { body: event.data ? event.data.text() : '' }; }
  event.waitUntil((async () => {
    // A tab the person is looking at already shows this in the app (live stream + toast): no second, system-level copy.
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    if (wins.some((w) => w.visibilityState === 'visible' && w.focused)) return;
    await self.registration.showNotification(d.title || 'Greenscape', {
      body: d.body || '',
      icon: ${JSON.stringify(icon)},
      badge: ${JSON.stringify(badge)},
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

const PUSH_ONLY = `
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));
`;

const OFFLINE = (app: PwaApp, version: string) => `
const PREFIX = 'gs-${app}-';
const CACHE = PREFIX + ${JSON.stringify(version)};
const SHELL = ${JSON.stringify(['/offline', pwaIcon(app, '192'), pwaIcon(app, '512')])};

self.addEventListener('install', (e) => e.waitUntil((async () => {
  // A failed download must not block the worker: push still works, only the offline screen would be missing.
  try { await (await caches.open(CACHE)).addAll(SHELL.map((u) => new Request(u, { cache: 'reload' }))); } catch {}
  await self.skipWaiting();
})()));

self.addEventListener('activate', (e) => e.waitUntil((async () => {
  for (const k of await caches.keys()) if (k.startsWith(PREFIX) && k !== CACHE) await caches.delete(k);
  await self.clients.claim();
})()));

// Network only, for page navigations and this app's icons; the response is passed through untouched and never put in
// a cache. When the network fails, a navigation gets the offline screen and an icon gets its installed copy.
self.addEventListener('fetch', (e) => {
  const url = new URL(e.request.url);
  const icon = url.origin === self.location.origin && url.pathname.startsWith('/icons/');
  if (e.request.mode !== 'navigate' && !icon) return;
  const kept = icon ? url.pathname : '/offline';
  e.respondWith(fetch(e.request).catch(async () => (await caches.match(kept, { cacheName: CACHE, ignoreVary: true })) || Response.error()));
});
`;

export function swSource(app?: PwaApp, version = BUILD) {
  return app ? OFFLINE(app, version) + PUSH(pwaIcon(app, '192'), '/icons/badge-96.png') : PUSH_ONLY + PUSH('/icon.png', '/icon.png');
}

/** Body for the app's `/sw.js` route handler. `no-cache`: browsers re-check it on every visit, so updates are prompt. */
export function swResponse(app?: PwaApp) {
  return new Response(swSource(app), { headers: { 'content-type': 'text/javascript; charset=utf-8', 'cache-control': 'no-cache', 'service-worker-allowed': '/' } });
}
