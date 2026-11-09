# API Documentation

The live, generated reference is served by the API itself:

- **Swagger UI:** `GET /v1/docs`
- **OpenAPI 3.1 JSON:** `GET /v1/openapi.json`

It is built from the same Zod schemas the API validates with (`packages/validation`), so it can't drift from the code. Routes register themselves next to their handlers with `registry.registerPath(...)` (`apps/api/src/lib/openapi.ts`).

## Conventions
- Base path `/v1`. JSON in and out.
- Auth: `Authorization: Bearer <Supabase access token>`. A present-but-invalid token is always 401 (never silently anonymous).
- Errors: `{ "error": { "code", "message", "requestId", "details?" } }`. Codes: `VALIDATION_ERROR` 400, `INVALID_JSON` 400, `UNAUTHORIZED`/`INVALID_TOKEN`/`TOKEN_EXPIRED` 401, `FORBIDDEN`/`ACCOUNT_SUSPENDED` 403 (`details.missing` lists missing permissions), `NOT_FOUND` 404, `CONFLICT` 409, `PAYLOAD_TOO_LARGE` 413, `RATE_LIMITED` 429, `INTERNAL` 500.
- Every response carries `x-request-id` (send your own to correlate logs).
- Lists: `?page=1&pageSize=20` (max 100) → `{ items, page, pageSize, total }`.

## Endpoints (Phase 4)
| Method | Path | Permission | Purpose |
|---|---|---|---|
| GET | `/v1/health` | — | Dependency status (200 ok/degraded, 503 down) |
| GET | `/v1/health/live` | — | Liveness |
| GET | `/v1/auth/me` | signed in | Current user, roles, permissions (creates the user on first call) |
| GET | `/v1/users` | `users.read` | List/search users (`q`, `role`) |
| PUT | `/v1/users/{id}/roles` | `roles.manage` (+ `roles.manage_super` for super_admin) | Replace roles; audited |
| PATCH | `/v1/users/{id}/status` | `users.manage` | Suspend/reactivate; audited |
| GET | `/v1/roles` | `users.read` | Roles with their permissions |
| GET | `/v1/cms/site`, `/pages/{slug}`, `/services[/{slug}]`, `/projects[/{slug}]`, `/articles[/{slug}]`, `/articles/legacy/{id}`, `/gallery`, `/testimonials`, `/faqs` | — | Published content (Redis-cached; mounted before the per-IP limiter) |
| POST | `/v1/quotations/attachments` | — (form limit) | Reserve a signed upload slot (photo/PDF ≤ 10 MB) |
| POST | `/v1/quotations` | — (form limit) | Submit a quote request; emails team + customer |
| GET | `/v1/quotations/mine` | signed in | Own requests and status |
| GET | `/v1/quotations`, `/v1/quotations/{id}` | `quotations.read` | Inbox and detail (5-minute attachment links) |
| PATCH / POST | `/v1/quotations/{id}`, `/{id}/notes` | `quotations.manage` | Status/assignee (audited), internal notes |
| POST | `/v1/contact` | — (form limit) | Message to the team |
| POST | `/v1/testimonials` | signed in | Feedback, held for moderation |
