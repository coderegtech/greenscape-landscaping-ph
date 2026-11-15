# Service worker: push handling

One worker per origin (`/sw.js`, scope `/`), built from `packages/ui/src/notifications/sw.ts`. Offline screen, cache rules and updates: [`docs/pwa/service-worker.md`](../pwa/service-worker.md). This page covers push only.

## `push`

1. Parse the payload as JSON. A garbled payload is shown as plain text under the title "Greenscape" instead of crashing the worker.
2. If a window of this portal is visible and focused, do nothing: the open page already shows the toast and plays the sound. The exception is `type: 'push.test'` (the test alert), which always shows.
3. `showNotification(title, { body, icon: /icons/<app>-192.png, badge: /icons/badge-96.png, tag: <notification id>, data: { url } })`. Because `tag` is the id, a repeated push replaces the earlier one instead of stacking. `URGENT` stays on screen until dismissed.

Payload (built on the API in `push.ts`): `{ id, title, body, url, tag, type, priority, icon }`. Title and body are the inbox text, which the handlers keep free of private detail: no customer contact data, no review text, and employees by first name and initial.

## `notificationclick`

Close the notification, resolve `data.url` against the worker's own origin, and fall back to `/` if it points anywhere else. Then focus an open window of the portal and navigate it, or open a new one. The page still goes through the normal sign-in and permission checks: a push link never grants access.

## Not here

* No custom sounds: a worker cannot play audio. With the app closed, the operating system plays its own notification sound.
* The worker caches no tokens, API answers or private pages.
* No `pushsubscriptionchange` handler: browsers fire it rarely and without a session. The page re-sends the subscription on the next visit instead.
