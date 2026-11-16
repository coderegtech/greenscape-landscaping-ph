# Web Push: setup

Native Web Push (Push API + Notifications API + VAPID, the `web-push` library on the API). No Firebase, no native app.

## Local

```bash
pnpm services:up && pnpm supabase:start && pnpm supabase:env
pnpm db:migrate && pnpm db:seed
pnpm vapid:keys          # prints a key pair: put both in .env as VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY
pnpm dev
```

Open the admin console (`:3001`) or the employee portal (`:3002`), sign in, go to **Notifications → Settings → Alerts on this device**, click **Turn on alerts** (the only place the browser's permission prompt is triggered), then **Send a test alert**.

`localhost` counts as a secure origin, so push works there without HTTPS. Any other host needs HTTPS.

## What the browser does

1. `PwaRegistration` (root layout) registers `/sw.js` with scope `/` on page load. The push code reuses that registration: one worker per origin.
2. Click → `Notification.requestPermission()` → `pushManager.subscribe({ userVisibleOnly: true, applicationServerKey })`. The public key comes from `GET /v1/notifications/push/config`, not a build-time variable, so rotating keys needs no frontend rebuild.
3. The subscription goes to `POST /v1/notifications/push/subscriptions` with the app (`admin` / `employee`) and a stable per-browser device id.
4. On later page loads where permission is already granted, the subscription is re-sent (keeps `lastActiveAt` fresh, survives key rotation). This never prompts.

Code: `packages/ui/src/notifications/push.ts` (browser), `push-toggle.tsx` (the control).

See also: [vapid-configuration.md](vapid-configuration.md), [push-subscriptions.md](push-subscriptions.md), [platform-compatibility.md](platform-compatibility.md).
