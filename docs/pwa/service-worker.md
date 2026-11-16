# Service worker

One source, `packages/ui/src/notifications/sw.ts`, served by each app at `/sw.js` (`app/sw.js/route.ts`, a static route). Scope `/`. Registered once per page by `PwaRegistration` in the root layout; the push code reuses that registration, so there is never a second worker.

## What it does

| Event | Behaviour |
|---|---|
| `install` | Opens `gs-<app>-<build>` and stores `/offline`, `/icons/<app>-192.png`, `/icons/<app>-512.png`. Then `skipWaiting()`. A failed download does not block the install (push still works). |
| `activate` | Deletes every other `gs-<app>-*` cache, then `clients.claim()`. Caches with other names are left alone. |
| `fetch` | Handles only page navigations and `/icons/*`. Always the network first; the response is returned untouched and **never stored**. If the network fails: a navigation gets the cached offline screen, an icon gets its cached copy. Every other request is ignored. |
| `push`, `notificationclick` | As before (`docs/notifications.md`), with the app's own icon and a monochrome badge. |

There is no runtime caching, so there is no `cache.put` anywhere in the worker. Scripts and styles are cached by the browser's HTTP cache (Next's hashed, immutable files), not by the worker.

## Updates

- `/sw.js` is sent with `Cache-Control: no-cache` and registered with `updateViaCache: 'none'`: the browser re-checks it on every visit.
- The cache name contains a build stamp (set when the app is built). A deployment therefore produces a different worker, which installs, takes over at once and deletes the previous cache.
- Because the worker never caches application code, an old worker cannot serve old JavaScript. Taking over immediately is safe.

## Removing it

Ship a worker that unregisters itself, or tell people to clear site data. Deleting the route alone leaves the old worker installed.
