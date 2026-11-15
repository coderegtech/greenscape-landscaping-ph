# Database schema (notifications and push)

Migration `20261113090000_notifications`, schema `packages/database/prisma/schema.prisma`. Full table notes: [`docs/notifications.md` §3](../notifications.md).

| Table | Role |
|---|---|
| `Notification` | The inbox, one row per person per event. `UNIQUE(recipientId, dedupeKey)` makes events idempotent. `app` = `web` / `admin` / `employee`. Expires after 90 days. |
| `PushSubscription` | One row per browser profile per portal: `endpoint` (unique), `p256dh`, `auth`, `deviceId`, `app`, `failureCount`, `lastActiveAt`. `UNIQUE(userId, app, deviceId)`. |
| `NotificationPreference` | `(userId, category) → inApp, push, sound`. No row = everything on. |
| `NotificationDelivery` | One row per push to one device, and the durable delivery queue. `status`, `attempts`, `nextAttemptAt`, `deliveredAt`, `failureReason`. `UNIQUE(notificationId, subscriptionId)`. |

Compared with the brief's suggested model: `portal` is `app`. There is no `enabled` flag because turning alerts off deletes the row (and the browser unsubscribes). `lastUsedAt` is `lastActiveAt`. The last delivery result is stored per delivery in `NotificationDelivery`.

Categories are strings, so adding one (`clock`, 2026-11) needed no migration.
