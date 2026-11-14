# Push notifications and sounds in the installed apps

The notification system was already built and is unchanged: Express API, PostgreSQL records, Redis fan-out, Web Push with VAPID. Full description: [`docs/notifications.md`](../notifications.md), sounds: [`docs/notifications/sound-effects.md`](../notifications/sound-effects.md). This page lists only what the PWA work touched and the limits to know.

## Changed

- The service worker that shows system notifications is now the same worker that provides the offline screen (one registration per origin).
- System notifications use the app's own icon (`/icons/<app>-192.png`) and a monochrome badge (`/icons/badge-96.png`) instead of the shared "G".

## How it is switched on

Only by a click: "Turn on alerts" in the bell dropdown or on the Notifications page. A blocked or unsupported browser gets an explanation, and the in-app inbox, live updates and toasts keep working.

## What is delivered

| App | Events |
|---|---|
| Admin | Paid orders, quote requests, customer and website messages, low stock, leave requests, time-correction requests, reviews to moderate, role changes, announcements |
| Employee | Schedule changes, leave decisions, correction decisions, missed clock-out, announcements |

Audiences are resolved by permission on the server, and a push goes only to subscriptions made in that app.

## Limits

- **iPhone / iPad**: push works only for an app added to the Home Screen, iOS 16.4+.
- **Sound with a closed app**: not possible. A push notification plays the device's own notification sound, chosen by the operating system. The app's chimes play only while a page is open, after the person has interacted with it (browser autoplay rule), and follow the mute, volume and "important only" settings.
- **Keys**: `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` on the API only. Without them push is off and the UI says so. The private key never reaches a browser or the service worker.
- A notification is not repeated as a system notification while a tab of the app is visible and focused.
