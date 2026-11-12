# Monitoring

## Admin → System status (`system.monitor`: super admin and admin)

`GET /v1/admin/system`, shown at `/system`:

| Section | Source |
|---|---|
| Services: Postgres, MongoDB, Redis, Supabase Storage, each OK/down with latency | Live checks on every page load |
| Version, environment, API uptime | `APP_VERSION`, `NODE_ENV`, process start |
| Errors and refused requests per day, last 7 days: server errors (5xx), not signed in (401), refused (403), rate limited (429) | Redis hash per Manila day, kept 8 days (`requestCounters` middleware) |
| Recent server errors: time, method, path, status, request id (last 20) | Redis list; look the request id up in the logs or Sentry for detail |
| Payment webhooks: failed in 7 days, unprocessed for over 10 minutes, latest failures | `WebhookEvent` (Postgres) |
| Push notification jobs: failed in 7 days, overdue, latest failures | `NotificationDelivery` (Postgres) |

The counters hold no personal data (no addresses, users or bodies). If Redis is down the counters pause; the log stream
and Sentry still have every event.

## Admin → Audit log (`audit.read`: super admin and admin)

`GET /v1/admin/audit`, shown at `/audit`: every audited change, newest first, 50 per page, filterable by action prefix
(`user.roles`, `user.sessions`, `employee.`, ...), by who did it (email) and by record id or type. Each entry can show its
before/after values. Entries are written in the same transaction as the change and cannot be edited from the app.

## Health endpoints

- `GET /v1/health/live`: the API process is up (load balancer liveness).
- `GET /v1/health`: Postgres, MongoDB and Redis checks, version and uptime. 200 when the primary databases are up (Redis
  down = `degraded`), 503 otherwise.
- Each Next app answers `GET /api/health` for its own container probe.

## Logs and alerts

- Structured JSON logs (pino) with request ids on every line; `x-request-id` is returned to the client.
- Sentry (`SENTRY_DSN`) for unhandled API errors.
- A `security` log channel: refused requests, role changes, account provisioning, temporary passwords replaced, sessions
  revoked, identity relinks, and a `security.alert` when one client is refused repeatedly
  (`docs/security/incident-response.md`).

## Employee activity

Admin → Attendance: who is clocked in today, absent, late, missing time-outs, pending corrections and leave,
per-employee history and the attendance report (`attendance.read`, `leave.read`).
