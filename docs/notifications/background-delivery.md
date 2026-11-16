# Background delivery

## Why not BullMQ

The repository has no BullMQ or other job queue. Push uses Postgres as the queue (`NotificationDelivery`):

* Delivery rows are written right after the notification row, in the same process, so there is no separate "publish to Redis" step that can be lost after the commit.
* Redis being down changes nothing for push. Redis is only the Socket.IO fan-out and the per-user throttle, which fails open.
* Several API instances can run workers: rows are claimed with `FOR UPDATE SKIP LOCKED`.
* Failed jobs are visible with SQL (`status = 'FAILED'`, `failureReason`).

Known gap (unchanged, documented in `docs/notifications.md`): events are emitted in-process after the business commit, not through a transactional outbox. A crash between the commit and the emit loses that notification; the business data is safe.

## Worker (`apps/api/src/modules/notifications/push.ts`)

| | |
|---|---|
| Trigger | Right after a notification is queued, plus a 5 s poll (restarts, retries). Started in `server.ts`, stopped on SIGTERM/SIGINT. |
| Claim | 25 due rows at a time. The claim increments `attempts` and sets a 2-minute lease, so a crash mid-send lets another worker retry. |
| Concurrency | One drain loop per process, 25 sends in parallel. |
| Retry | 429, 408, 5xx, network errors: 30 s, 1, 2, 4, 8 min (±20 % jitter, max 1 h), 6 attempts, then `FAILED`. |
| Final | 404/410: subscription deleted. Other 4xx: `FAILED`. 5 final failures in a row delete the subscription. |
| Skips | Already read or expired (`SENT`, reason recorded). Account not active (`FAILED`). |
| Throttle | 20 pushes per user per minute. Beyond that the notification is still stored and streamed. |
| Logs | `push delivery failed` (delivery id, attempt, reason), `push subscription expired or revoked; removing` (subscription id). Never the endpoint or keys. |

`SENT` means the push service accepted the message. It does not mean the person saw it: the device may be off, the browser closed, or notifications muted.
