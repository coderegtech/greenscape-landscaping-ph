# Offline strategy

**Offline, the apps explain themselves and wait. They do not work offline, on purpose.** Everything they show is private business or personal data that must come from the server.

## Kept on the device

| Kept | Why it is safe |
|---|---|
| The offline screen (`/offline`) | Static text, the same for everyone |
| Two app icons | Public artwork |

## Never kept by the service worker

Dashboards, employee details, attendance, customers, orders, CMS editing data, analytics, API responses, sessions and tokens, files. Signed-in pages are also sent with `Cache-Control: no-store` (Next's default for per-request pages; checked in `tests/e2e/pwa.spec.ts`).

## What people see offline

1. **A page is already open**: a floating notice says "You are offline" and what that means in this app, with a Retry button. The page stays as it was; nothing is invented.
2. **They open or reload a page**: the offline screen, with the app icon, "No internet connection", what needs a connection, and "Retry connection". It checks again every 20 seconds and opens the page they asked for once the connection is back (the address is kept).

The offline screen has no script, so the nonce CSP has nothing to block; the 20-second check is a `<meta http-equiv="refresh">`.

## Attendance

Clock in / Clock out is disabled offline and the card says "Internet connection is required to record attendance." No punch is stored on the device or replayed later. An offline attendance policy (device time, reconciliation, fraud checks) would have to be decided by the business first; it is not built.

## Admin

No edit is queued. Server actions fail offline and the form reports it; the notice says changes cannot be saved until the connection is back.
