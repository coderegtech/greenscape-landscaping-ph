# Notifications

Real-time in-app notifications and Web Push, for the customer site (`apps/web`), the staff console (`apps/admin`) and the employee portal (`apps/employee`). Sounds, the 2026-11 additions and the portal UI: [`docs/notifications/`](notifications/architecture.md).

## 1. What was there, what was chosen

| Found in the audit | Decision |
|---|---|
| Staff **emails** on new quotes, paid orders, messages, low stock (`apps/api/src/lib/notify.ts`, recipients in `AppSetting`). No in-app notifications, no push, no service worker. | Emails stay exactly as they were. Notifications are added beside them. |
| Express API, PostgreSQL (Prisma), Redis (already used for cache, rate limits, locks), Supabase JWT auth, RBAC by permission. Browsers already call the API directly with `Authorization: Bearer`. | Reuse all of it. **No new infrastructure.** One new dependency: `web-push` (VAPID + payload encryption; not worth hand-writing). |
| Web only: no mobile or desktop app exists in the repo. | **Web Push (VAPID)** covers desktop browsers, Android, and iOS 16.4+ for a site added to the Home Screen. FCM, APNs and Expo are not used: there is no native client to register tokens. `PushSubscription.platform` is there so a native provider can be added later without a schema change. |


Notifications flow one way (server → browser); the browser's own actions are ordinary REST calls. They used to travel over a fetch-based Server-Sent Events stream; they now share the Socket.IO connection that also carries live dashboard signals, with the same Bearer-token verification and the same "re-fetch on every reconnect" recovery. See [`docs/realtime/README.md`](realtime/README.md).

## 2. Data flow

```
 business action ── commits ──► events.emit('order.paid', {orderId})        apps/api/src/lib/events.ts
                                      │
                       handlers.ts: who gets it, what it says, where it links
                                      │
                       service.notify():  preferences → INSERT (idempotent) ─► Postgres  (source of truth)
                                      │                         │
                  realtime.publish (Socket.IO + Redis adapter)  └─► NotificationDelivery rows (push queue)
                                      │                                         │
        every API instance ► its open sockets                push worker (lease + retry) ► push service ► device
                                      │                                                              │
                  browser: bell, toast, sound, list                                  service worker: system notification
```

* **Events are emitted after the database transaction commits**, and an event handler that fails is logged and never fails the business action. (shortcut: in-process, not a transactional outbox. A crash between commit and emit loses that notification; the business data is safe.)
* **Postgres is the truth, Redis is only the delivery wire.** A client that missed live events (restart, network drop, Redis outage) simply re-fetches: open lists reload on every (re)connect of the socket. Without Redis, live delivery still works for clients on the same API instance.
* **Horizontal scaling:** the Socket.IO Redis adapter (`<CACHE_PREFIX>:sio`) carries events to every instance's sockets. The push queue is claimed with `FOR UPDATE SKIP LOCKED`, so several instances can run workers.

## 3. Database (migration `20261113090000_notifications`)

| Table | Purpose | Notes |
|---|---|---|
| `Notification` | The inbox. `recipientId, app (web/admin), type, category, title, message, payload{href}, priority, dedupeKey, readAt, createdAt, expiresAt` | `UNIQUE(recipientId, dedupeKey)` makes every event idempotent. Indexed for `(recipient, app, createdAt desc)` and unread counts. Rows expire after 90 days (hourly purge). |
| `PushSubscription` | One row per browser/device (`endpoint, p256dh, auth, deviceId, app`) | `endpoint` unique; `(userId, app, deviceId)` unique so re-subscribing replaces the device's row. Removed on 404/410, after repeated hard failures, or after 90 days silent. |
| `NotificationPreference` | `(userId, category) → inApp, push, sound` | By **category**, not type: the set of types grows, what people mute does not. No row = everything on. |
| `NotificationDelivery` | One row per push to one device: `status (PENDING/SENT/FAILED/GONE), attempts, nextAttemptAt, failureReason` | Doubles as the **durable queue**. `UNIQUE(notificationId, subscriptionId)`. Survives restarts. Subscription link is nulled (not cascaded) so failure history outlives a removed device. |

`app` exists because one person can be both a customer and staff: each app shows only its own notifications, and a push goes only to subscriptions made in that app (each origin has its own service worker).

## 4. API (`/v1/notifications`, all require sign-in; OpenAPI at `/v1/docs`)

| Method & path | |
|---|---|
| `GET /?app=&cursor=&limit=&unread=&category=` | Own notifications, newest first, cursor-paginated, plus `unreadCount`. |
| Live delivery | Socket.IO at `/v1/realtime` (handshake `auth: { token, app }`), event `notification` with `created`, `read`, `read_all`, `deleted`, `cleared`; ≤ 10 sockets per user per instance. See `docs/realtime/README.md`. |
| `POST /:id/read`, `POST /read-all?app=` | Mark read. |
| `DELETE /:id`, `DELETE /?app=&readOnly=` | Delete one / clear. |
| `GET` / `PUT /preferences` | Per-category settings. `account` (security) can never be hidden from the inbox. Push needs the inbox: it is switched off when in-app is off. |
| `GET /push/config` | `{ enabled, publicKey }`: the **public** VAPID key only. |
| `POST` / `DELETE /push/subscriptions` | Register / remove this device. A device registers for `admin` only with `admin.access` and for `employee` only with `attendance.self` (403 otherwise). |
| `POST /push/test?app=` | Test alert to the caller's own devices for that app (409 without one). No recipient parameter exists. 10/hour. |
| `POST /broadcast` | Announcement. Needs `notifications.broadcast` (admin, super_admin). Audience = chosen roles, else all staff (`admin`) or all active accounts (`web`). Audited, rate-limited (20/hour/IP). |

Authorization: every query includes `recipientId = <caller>`; someone else's id answers `404`, same as a missing one. The socket is scoped to the caller's own inbox room. Role-based audiences are resolved by **permission**, never by role name.

## 5. Push

* Permission is requested **only when the person clicks** "Turn on alerts" (bell dropdown, or Settings). A blocked permission is explained, never forced.
* The service worker (`/sw.js`, one source in `packages/ui/src/notifications/sw.ts`, served by both apps) shows the system notification **unless a tab is visible and focused**, because the in-app toast already covered it. `tag = notification id`, so a repeat replaces instead of stacking. Clicking focuses an open tab or opens one at the deep link. Links are same-origin only.
* **Duplicate prevention:** `dedupeKey` (one notification per event per person), `UNIQUE(notification, device)` (one push per device), the visible-tab rule above, and the worker skips a push whose notification was read elsewhere before it went out.
* **Retries:** 429, 5xx and network errors retry after 30 s, 1 min, 2 min, 4 min, 8 min (±20 %, max 1 h), 6 attempts, then `FAILED` with the reason. 404/410 mark the device `GONE` and delete the subscription. Other 4xx are final. A device is only removed after 5 notifications failed for good in a row, so a push-service outage never deletes healthy devices.
* **Restarts:** workers claim rows with a 2-minute lease; a crash mid-send lets the lease lapse and the row is picked up again.
* **Inactive accounts:** a suspended or deleted account gets no new push rows, and rows queued before the suspension end `FAILED` (`account not active`) instead of being sent.
* **Sign-out:** the login page drops the browser's local push subscription when there is no session, so a shared device stops receiving the previous account's alerts (the push service then answers 410 and the server deletes the row). The next person turns alerts on themselves.
* **Throttle:** at most 20 pushes per user per minute; beyond that the notification is still stored and streamed.

## 6. Notification catalogue (triggers)

`apps/api/src/modules/notifications/handlers.ts` is the single place that decides audience, wording and link. Events are emitted from the existing routes/services after success.

| Event | Who (app) | Title (link) |
|---|---|---|
| `user.registered` | the new user (web) | Welcome to Greenscape (`/account`) |
| `user.roles_changed` | the user (web, and admin if staff) | Your access was changed: security alert |
| `quotation.submitted` | `quotations.read` (admin); the requester if signed in (web) | New quote request Q-… (`/quotations/:id`) / We received your quote request |
| `quotation.status_changed` | the customer (web) | Quote request Q-… updated |
| `quotation.assigned` | the assignee (admin) | Quote request Q-… was assigned to you |
| `order.paid` | the buyer (web); `orders.read` (admin); `inventory.read` if stock is low | Payment received / New paid order / Low stock |
| `order.cancelled` | the buyer | Order cancelled (payment failed or cancelled, expired hold, staff cancellation) |
| `order.refunded` | the buyer | Refund on its way |
| `order.fulfillment_changed` | the buyer | Being prepared / Out for delivery / Delivered |
| `message.from_customer` | `messages.read` (admin) | New message from … (once per unread batch, like the email) |
| `message.from_staff` | the customer | Greenscape replied to your message |
| `inquiry.received` | `messages.read` (admin) | Website message from … |
| `leave.requested` / `leave.decided` | `leave.approve` / the employee (employee app, `/requests`) | Leave request from … / Your leave was approved, declined or cancelled |
| `correction.requested` / `correction.decided` | `attendance.approve` / the employee (employee app, `/attendance`) | Time correction … |
| `schedule.changed` | the employee moved onto a schedule, or everyone currently on an edited schedule (employee app) | Your work schedule changed / was updated (`/schedule`) |
| `attendance.incomplete` | the employee (employee app), when the day-close job finds no clock-out | You did not clock out (`/attendance`) |
| `attendance.changed` (clock-in) | `attendance.read` (admin, category `clock`) | Employee clocked in (`/attendance`); first name and last initial only. Clock-outs send nothing. |
| `testimonial.submitted` | `testimonials.moderate` (admin) | New review to moderate (`/cms/testimonials`); no reviewer name or text |
| announcement | chosen audience | Admin → Notifications → Send an announcement |

Payload stored with a notification: `{ href }` (a path inside the app that shows it). Push body: `{ id, title, body, url, tag, type, priority, icon }`.

Not built: shift/schedule **reminders** (needs a scheduler job; the push and inbox pipeline is ready for it: call `notifications.notify`), payment-method or password-change security alerts (Supabase handles those flows outside this API).

## 7. Configuration

| Variable | Where | |
|---|---|---|
| `VAPID_PUBLIC_KEY` | API | Public key; served to browsers by `GET /push/config`. |
| `VAPID_PRIVATE_KEY` | API only | **Secret.** Never sent to a client, never logged. |
| `VAPID_SUBJECT` | API | `mailto:` or `https:` contact the push services can reach. |

`pnpm vapid:keys` prints a pair. Unset keys = push is off; one key without the other stops the API at startup (the inbox and live stream still work; the UI says alerts are not set up).

## 8. Local development

```bash
pnpm services:up && pnpm supabase:start && pnpm supabase:env   # as before
pnpm db:migrate        # applies 20261113090000_notifications
pnpm db:seed           # adds the notifications.broadcast permission to roles
pnpm vapid:keys        # copy both keys into .env
pnpm dev
```
Sign in on `http://localhost:3000`, then in another browser sign in as staff on `:3001`; send a message from the first to see the second's bell update. Push needs a browser that allows notifications for `localhost`.

## 9. Production

* Run `pnpm db:deploy` and `pnpm db:seed`, set the three `VAPID_*` variables on the API, redeploy API, web and admin.
* Serve over HTTPS (service workers and push require it). Keep `worker-src 'self'` in both CSPs (already set).
* If a proxy sits in front of the API, it must forward WebSocket upgrades on `/v1/realtime` and its idle timeout must exceed 25 s (the ping interval).
* Several API instances need only the shared Redis they already use.
* Changing the VAPID public key invalidates every existing subscription; devices re-subscribe the next time they open the site.
* Monitoring: logs `push delivery failed`, `push subscription expired or revoked; removing`, `could not queue push deliveries`; failed rows are in `NotificationDelivery` (`status = FAILED`, `failureReason`).

## 10. Tests

* `tests/unit/notifications.test.ts`, `notification-format.test.ts`: backoff, provider-response classification, preferences, cursor, contracts, event bus, grouping (rooms: `realtime.test.ts`) and live-event application.
* `tests/integration/notifications.test.ts` (real Postgres, Redis, Supabase auth): authorization and ownership, idempotency, pagination, preferences, live socket delivery, multi-device sync, reconnect catch-up, connection cap, push registration/replacement, queueing, send-once, retry/backoff/give-up, expired-subscription removal, lease recovery, throttle, purge, business events end to end, announcements.
* `tests/e2e/notifications.spec.ts` (Playwright): a customer message reaches a signed-in admin live; read state syncs across tabs; the socket is cut and recovers; users never see each other's notifications; blocked alerts; preferences persist; accessibility scan.
  Base URLs can be overridden with `E2E_WEB` / `E2E_ADMIN` when other servers hold the default ports.
* Push providers are replaced by an injected sender in tests (`createNotifications(deps, send)`); production always uses `web-push`.

## 11. Known limits

* Real push to a real device is not covered by automated tests (browsers need a user gesture and a real push service). Validate once per target: Chrome desktop, Chrome Android, Safari (iOS: installed to Home Screen), Firefox.
* iOS needs the portal installed as a web app (Home Screen, iOS 16.4+) for push; the manifests come from the PWA work (`docs/pwa/`).
* Live delivery is at-most-once; recovery relies on the re-fetch after reconnect (and on the stored inbox).
