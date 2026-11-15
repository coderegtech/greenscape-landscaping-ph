# Deployment (Docker / Dokploy)

No new service: push runs inside the API container (`server.ts` starts the worker). Postgres holds subscriptions, history and the delivery queue. Redis is already required for Socket.IO.

## Checklist

1. **Keys:** set `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY` and `VAPID_SUBJECT` on the API service in Dokploy, as secrets, not build args. Use one pair per environment and keep it stable. Nothing needs setting on the portals.
2. **Database:** `pnpm db:deploy` (this work adds no migration).
3. **HTTPS** on `admin.greenscapelandscapingph.com` and `employee.greenscapelandscapingph.com`, which service workers and push require.
4. **Service worker:** `/sw.js` answers `200` with `content-type: text/javascript` and `cache-control: no-cache`, served by the app itself (not a CDN with long caching). `/manifest.webmanifest` and `/offline` are public (`proxy.ts`).
5. **CORS:** `CORS_ORIGINS` on the API lists exactly the three site origins.
6. **Proxy:** forwards WebSocket upgrades on `/v1/realtime`, with an idle timeout above 25 s.
7. **Several API replicas:** fine. Workers share the queue through `SKIP LOCKED`.

## After deploying

* `GET https://<api>/v1/notifications/push/config` with a signed-in token returns `enabled: true`.
* Sign in on each portal, turn alerts on and send a test alert.
* Watch the API logs for `push delivery failed`, and check `SELECT status, count(*) FROM "NotificationDelivery" GROUP BY 1`.

A deployment changes the worker's build stamp, so browsers install the new worker on their next visit. Push subscriptions belong to the registration, not the worker version, so they survive updates. Changing the VAPID pair does not keep them (see [vapid-configuration.md](vapid-configuration.md)).
