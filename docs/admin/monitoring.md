# Monitoring

## Health

- `GET /v1/health/live`: the API process is up (load balancer liveness).
- `GET /v1/health`: Postgres, MongoDB and Redis checks with latency, the deployed `APP_VERSION` and uptime. 200 when the
  primary databases are up (Redis down = `degraded`), 503 otherwise. Shown on the admin dashboard and in Settings.
- Each Next app answers `GET /api/health` for its own container probe.

## Errors and security events

- Structured JSON logs (pino) with request ids on every line; `x-request-id` is returned to the client.
- Sentry (`SENTRY_DSN`) for unhandled API errors.
- A `security` log channel: refused requests (401/403/429), role changes, account provisioning, temporary passwords
  replaced, identity relinks, and an alert when one client is refused repeatedly. Details in
  `docs/security/incident-response.md`.
- Payment webhooks are idempotent and logged; failures surface in the log stream and Sentry.

## Employee activity

Admin, Attendance: who is clocked in today, absent, late, missing time-outs, pending corrections and leave, per-employee
history and the attendance report. Visible only with `attendance.read` / `leave.read`.

## Not built

An in-admin page listing failed background jobs, recent errors and webhook failures. Today those are in the log stream
and Sentry, which also covers alerting.
