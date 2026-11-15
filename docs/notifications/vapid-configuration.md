# VAPID configuration

| Variable | Where | Notes |
|---|---|---|
| `VAPID_PUBLIC_KEY` | API | Sent to browsers by `GET /v1/notifications/push/config`. |
| `VAPID_PRIVATE_KEY` | API only | Secret. Never sent to a browser or the service worker, never logged. |
| `VAPID_SUBJECT` | API | `mailto:` or `https:` contact the push services can reach. Use a monitored address in production. |

* `pnpm vapid:keys` generates a pair (`web-push generate-vapid-keys`).
* **Neither key set:** push is off. The inbox, live updates and sounds still work, and the settings page says alerts are not set up.
* **Only one key set:** the API refuses to start (`apps/api/src/config/env.ts`) instead of silently running without push.
* **No `NEXT_PUBLIC_VAPID_PUBLIC_KEY`:** the portals read the public key from the API at run time. One source, no rebuild on rotation.
* Use a different pair per environment (local, staging, production). Keep each environment's pair stable across deployments: changing it invalidates every subscription made with the old one.

## Rotation

1. Generate a new pair, set both variables on the API, redeploy the API.
2. Existing subscriptions were made with the old public key, so the push service rejects them. 404/410 delete the row at once; other final failures delete it after 5 in a row.
3. The next time the portal opens, a browser that already granted permission notices its subscription was made with the old key, drops it and subscribes again with the new one, with no prompt (`resyncPush`). A browser that insists on a click for that shows "Turn on alerts" again.

Rotate when the private key may have leaked. With the private key and a copy of the `PushSubscription` table, someone could push to those devices, so treat that table as sensitive too.
