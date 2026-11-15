# Testing

## Automated

| Suite | Covers |
|---|---|
| `tests/unit/notifications.test.ts` | Backoff, push-service response handling, preferences, contracts, per-portal categories, VAPID pair check |
| `tests/integration/notifications.test.ts` (real Postgres, Redis, Supabase) | Authorization and ownership, idempotency, live socket delivery, reconnect catch-up, subscription registration, replacement and hand-over, send once, retry and give-up, expired-subscription removal, lease recovery, throttle, business events, announcements, **portal check, test alert, suspended accounts** |
| `tests/integration/portal-redesign.test.ts` | Schedule, missed clock-out and review notices reach only their audience; **clock-in notice reaches attendance staff once, without the full name** |
| `tests/e2e/notifications.spec.ts` (Playwright) | Live bell across tabs, a dropped connection recovers, users are isolated, a blocked permission is explained, preferences persist, accessibility |
| `tests/e2e/push.spec.ts` (Playwright, Chromium) | A push delivered to each portal's own service worker (DevTools protocol, no push service) is displayed with that portal's icon, badge and link, with no window open; a garbled payload still shows; the same id replaces; the test alert shows in a focused tab |
| `tests/e2e/pwa.spec.ts` | Manifests, icons, worker scope, offline screen, nothing private cached |

```bash
pnpm test
pnpm test:integration
pnpm test:e2e tests/e2e/push.spec.ts tests/e2e/notifications.spec.ts
```

## Not automatable

Playwright cannot click a system notification, hear the device's sound, or subscribe through a real push service: browsers it launches answer `Registration failed - permission denied` (tried with Edge, headless and headed). The push spec runs on full Chromium (`playwright install chromium`, as CI does) or, locally, `E2E_PUSH_CHANNEL=msedge`; the default headless shell has no notifications at all. Once per platform:

1. Install the portal (Android: Chrome menu → Install. iPhone: Share → Add to Home Screen, then open it from the Home Screen).
2. Sign in, then Notifications → Settings → Turn on alerts → allow.
3. Send a test alert. A system notification with the portal's icon appears.
4. Close the app completely. From another device, trigger a real event (employee clocks in → admin device; admin decides a leave → employee device).
5. The notification arrives, and tapping it opens the right page (after sign-in if the session ended).
6. Sign out and trigger another event. Nothing arrives on that device.

Record the device, OS and browser version with each result.
