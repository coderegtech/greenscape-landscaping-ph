# Realtime (Socket.IO)

Live updates for the admin console and the employee portal (and live notifications on the website), over one
Socket.IO connection per browser tab. It replaced the earlier Server-Sent Events stream; everything else about
notifications (Postgres inbox, preferences, sounds, Web Push) is unchanged and described in
[`docs/notifications.md`](../notifications.md).

| Part | Where |
|---|---|
| Server: auth, rooms, emitters, Redis adapter | `apps/api/src/realtime/server.ts` |
| Domain event → live signal / revocation | `apps/api/src/realtime/handlers.ts` |
| Contract (path, topics, payload, fatal codes) | `packages/validation/src/notifications.ts` (bottom) |
| Client: socket, status, `useLive` | `packages/ui/src/notifications/provider.tsx` |
| `LiveRefresh`, `LiveStatus` | `packages/ui/src/notifications/live.tsx` |
| Admin topics per page | `apps/admin/lib/live-topics.ts`, `apps/admin/components/console-live.tsx` |

## 1. Architecture

```
 REST mutation (clock in, approve, pay…) ── Postgres COMMIT ──► events.emit('attendance.changed', {employeeId, kind})
                                                                   │
                         ┌─────────────────────────────────────────┴──────────────────────────────┐
        notifications/handlers.ts: store Notification rows        realtime/handlers.ts: live('attendance', 'clocked_in')
                         │                                                    │
                 realtime.publish → room inbox:{app}:{user}        realtime.live → rooms perm:attendance.read + user:{employee}
                         └──────────────────────► Socket.IO + Redis adapter ◄──┘
                                                         │  (every API instance)
                       admin tab: bell + LiveRefresh → router.refresh()      employee tab: same, own records only
```

Rules the code keeps:

* **REST is the only way to change data.** The socket is server → client only. A client that emits any event is
  disconnected (`socket.onAny`), so there is no client event to validate, rate-limit or authorize.
* **Events are published after the transaction commits** (`events.emit` runs after the write). A socket delivery is
  never treated as proof of anything; the page re-fetches through the authorized API.
* **Signals carry ids only**: `{ v: 1, id, topic, kind, ref?, at }`. No names, times or amounts travel over the socket
  to staff rooms; the page that hears a signal calls the API, which applies the reader's permissions again.
* **Postgres is the truth, Redis is the wire.** Notifications are rows first (`UNIQUE(recipientId, dedupeKey)`);
  live signals are disposable and recovered by re-fetching after every reconnect.
* shortcut: events are in-process and emitted after commit (no transactional outbox). A crash between commit and emit
  loses that live signal / notification; the business record is safe and the next page load shows it. Upgrade to an
  outbox table if a lost notice ever matters.

## 2. Events

### Server → client

| Event | Payload | Room |
|---|---|---|
| `notification` | `{ event: 'created' \| 'read' \| 'read_all' \| 'deleted' \| 'cleared', data }` (same data the SSE stream had) | `inbox:{app}:{userId}` |
| `live` | `LiveSignal` `{ v: 1, id, topic, kind, ref?, at }` | `perm:{permission}` and/or `user:{userId}` |

There are no client → server events.

### Live topics

| Topic | Kinds | Sent by (domain event) | Staff who hear it (admin app) | Employee who hears it |
|---|---|---|---|---|
| `attendance` | `clocked_in`, `clocked_out`, `edited`, `approved`, `incomplete` | `attendance.changed` (punch, HR edit, approve), `attendance.incomplete` | `attendance.read` | the punching / edited employee |
| `corrections` | `requested`, `decided` | `correction.requested/decided` | `attendance.read` | the requester |
| `leave` | `requested`, `decided` | `leave.requested/decided` | `leave.read` | the requester |
| `schedule` | `updated`, `assigned` | `schedule.changed` | `employees.read` | people on that schedule |
| `employees` | `updated` | `employee.updated` (HR create/edit) | `employees.read` | that employee |
| `users` | `roles_changed`, `access_changed` | `user.roles_changed`, `user.access_changed` | `users.read` | — |
| `orders` | `created`, `paid`, `cancelled`, `refunded`, `fulfillment` | `order.created` (checkout), `order.paid/…` (verified payment events) | `orders.read` | — |
| `inventory` | `updated`, `low_stock` | `catalog.changed` (adjust, stock import), `order.paid` with low variants | `inventory.read` | — |
| `products` | `updated` | `catalog.changed` (product create/edit) | `products.read` | — |
| `quotations` | `created`, `updated`, `assigned` | `quotation.*` | `quotations.read` | — |
| `messages` | `received`, `replied`, `inquiry` | `message.*`, `inquiry.received` | `messages.read` | — |
| `cms` | `published`, `review` | `cms.published` (`publishNow`, incl. scheduled), `testimonial.submitted` | `cms.read` | — |

Customers get notifications only (`inbox:web:{id}`), no live topics.

## 3. Authentication

1. The client connects to `NEXT_PUBLIC_API_URL` at path `/v1/realtime`, sending `{ token, app }` in the Socket.IO
   handshake `auth` (a CONNECT packet, never the URL). The token is the Supabase access token, read fresh from the
   session on **every** attempt, so reconnects after expiry carry a refreshed one.
2. `io.use` calls `resolveAuth` (`middleware/auth.ts`), the same function every REST request uses: JWKS signature,
   issuer, audience, expiry, signed-out session (`SESSION_ENDED`), "sign out everywhere" (`SESSION_REVOKED`),
   suspension (`ACCOUNT_SUSPENDED`), and permissions loaded from Postgres (60 s cache, invalidated on role changes).
   Roles or permissions in the token are ignored.
3. The portal gate: `admin` needs `admin.access`, `employee` needs `attendance.self`, `web` any account.
4. Refusals carry `{ code, status }` only (`err.data`). The client stops retrying on the codes in `REALTIME_FATAL`
   (signed out, suspended, forbidden) and retries with backoff on the rest (e.g. `TOKEN_EXPIRED`, `TOO_MANY_*`).
5. At token expiry the server closes the socket; the client reconnects with a fresh token, which re-checks everything.

Tokens are never logged; refusal logs carry the code only.

## 4. Authorization, rooms and permissions

Rooms are assigned by the server in the handshake (`roomsFor`, unit-tested) and there is no way to ask for one:

| Room | Who is in it |
|---|---|
| `user:{userId}` | every socket of a person: revocation, their own live changes |
| `session:{sessionId}` | one sign-in session: sign-out closes it |
| `inbox:{app}:{userId}` | that person's notifications for one portal |
| `perm:{permission}` | admin-app sockets holding that read permission (`TOPIC_PERMISSION`) |

* Employees never join `perm:*` rooms (also not via the admin app with self-service permissions only).
* Staff audiences are **permissions**, never role names, like the rest of the codebase; department scoping is not
  modelled in RBAC today, so it is not applied to rooms either.
* **Revocation:** `user.roles_changed` and `user.access_changed` (suspend/reactivate, "sign out everywhere") close every
  socket of the person on every instance (`disconnectSockets` through the adapter); `POST /v1/auth/logout` closes that
  session's sockets. The reconnect goes through the full handshake again, so it gets the new rooms or is refused.

## 5. Notifications

Unchanged except for the transport: `service.notify()` stores the row (idempotent per `dedupeKey`), then
`realtime.publish` sends `notification { event: 'created', data: { notification, sound } }` to the recipient's inbox
room. Read / read-all / delete / clear publish the matching events, so every tab and device stays in sync.
The browser drops a notification it has already shown (by id), so a repeat never adds to the count or plays twice.
Sounds, mute, volume, autoplay unlock and the one-tab-plays rule are in
[`docs/notifications/sound-effects.md`](../notifications/sound-effects.md). Web Push still covers a closed PWA.

## 6. Redis adapter and scaling

`@socket.io/redis-adapter` with two dedicated connections (`redis.duplicate()`), channel prefix `<CACHE_PREFIX>:sio`.
Room broadcasts and `disconnectSockets` reach sockets held by any instance. The publisher never throws or queues while
Redis is down (delivery falls back to the local instance; clients re-fetch on reconnect); the subscriber reconnects and
resubscribes by itself. Redis Pub/Sub is not storage and nothing is replayed from it.

Per-instance limits: 10 sockets per user; connection attempts per address share the REST budget
(`RATE_LIMIT_PER_MIN`, counted in Redis); 4 KB maximum packet (clients send nothing).

## 7. Reconnection and recovery

Client states (`LiveStatus` dot beside the bell, `data-status`): `connecting`, `connected`, `reconnecting`, `offline`,
`disconnected`.

1. Transport drops: Socket.IO retries with exponential backoff (1 s → 30 s, ±50 % jitter).
2. Server-side close (token expiry, access change) or a refused handshake: the provider retries itself with the same
   backoff, unless the code is fatal.
3. A PWA returning to the foreground reconnects at once (`visibilitychange`).
4. On every reconnect: the unread count is re-read, notification lists re-fetch their first page (`epoch`), and every
   `LiveRefresh` re-renders its page. Missed notifications come from Postgres; dashboards from fresh API snapshots.
   Socket.IO connection-state recovery is not used: application re-fetch covers it.
5. Duplicate signals (same `id`) are dropped; notifications are dropped by id.

## 8. Frontend integration

* One socket per tab, created in `NotificationsProvider` (mounted once per app layout), loaded with a dynamic import
  only once a Supabase session cookie exists. React Strict Mode's double effect closes the first socket.
* `useLive(topics, fn)` runs `fn` debounced (400 ms, so a burst costs one re-fetch) and after reconnects.
* `<LiveRefresh topics>` calls `router.refresh()`: server components re-render in place, client state (open dialogs,
  typed text, charts) is kept. The admin console mounts it once in its layout with the page's topics plus the menu
  badge topics (`topicsFor`); the employee portal mounts it in `PortalShell` with its own five topics.
* The employee dashboard clock is client-side; attendance times are always the server's.

## 9. PWA notes

Socket.IO works while the page is open. A suspended or closed PWA has no socket; it reconnects and re-fetches when it
comes back. Background alerts are Web Push (`docs/notifications.md` §5).

## 10. Security checklist

Verified token per connection · server-assigned rooms only · permission-guarded topics · ids-only payloads ·
no client events (disconnect on any) · strict Origin check on every transport (`allowRequest`, also covers the
WebSocket upgrade) · 4 KB packets · per-address and per-user limits · revocation on role/status/session changes ·
safe error codes · no tokens in URLs or logs · CSP `connect-src` lists the API's `ws(s)` origin.

## 11. Deployment (Docker / Dokploy)

* Same port and HTTP server as the API (`deps.realtime.attach(server)`); path `/v1/realtime`. Nothing new to expose.
* Dokploy's Traefik forwards WebSocket upgrades on `api.<domain>` without extra labels. Proxy idle timeout must exceed
  the 25 s ping interval (Traefik's default entry-point idle timeout is 180 s).
* `CORS_ORIGINS` must list all three portal origins (web, admin, employee); `docker/compose.prod.yml` now does.
* One API instance needs nothing else. **Several instances:** the shared Redis is enough for WebSocket clients; a client
  that fell back to long-polling needs sticky sessions at the load balancer (Socket.IO's polling handshake must hit the
  same instance). Dokploy runs one replica by default.
* Shutdown: `SIGTERM` → stop jobs → `server.close()` → `closeDeps` closes all sockets and the adapter connections.
* Health: `/v1/health` is unchanged; `realtime.connections()` gives this instance's open sockets.

## 12. Testing

| Suite | What it proves |
|---|---|
| `tests/unit/realtime.test.ts` | room assignment by permission and app; every topic guarded by a `.read` permission; admin page topics |
| `tests/integration/realtime.test.ts` (Postgres, Redis, local Supabase, two API instances) | handshake refusals (no/forged token, unknown portal, wrong portal, foreign Origin); client events disconnect; clock-in/out reach HR and the employee's other device and nobody else, ids only, duplicate tap announces nothing; schedule edit reaches the people on it; role change / suspension (across both instances) / sign-out close sockets and the reconnect is refused; notification and live signal cross instances through the Redis adapter; per-address connection limit |
| `tests/integration/notifications.test.ts` | inbox over the socket: only the recipient, every tab, app filtering, read/delete sync, recovery after a drop, 10-socket cap |
| `tests/e2e/realtime.spec.ts` (Chromium, separate contexts) | HR's open board and the employee's second device update on clock-in/out without a reload; a cut socket shows "reconnecting", recovers, and the board catches up on the missed clock-in |
| `tests/e2e/notifications.spec.ts`, `portal-redesign.spec.ts` | bell live across tabs, cut-and-recover, no socket after sign-out |

Run: `pnpm test`, `pnpm test:integration`, `pnpm build && pnpm test:e2e`.
