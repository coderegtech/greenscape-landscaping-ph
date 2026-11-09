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

## CMS editing (Phase 7)
`{type}` is `pages`, `services`, `projects` or `articles`; `?locale=` defaults to `en`. Bodies are validated with the same Zod schemas as the seed; failures return `400 VALIDATION_ERROR` with `details: [{ path: "sections.0.heading", message }]` (paths relative to the body).

| Method | Path | Permission | Purpose |
|---|---|---|---|
| GET | `/v1/cms-admin/{type}` | `cms.read` | Summaries (`?status`, `?q`); archived hidden unless asked; `hasUnpublishedChanges` |
| POST | `/v1/cms-admin/{type}` | `cms.write` | Create a draft `{ slug, body, seo }`; 409 if the slug exists |
| GET | `/v1/cms-admin/{type}/{slug}` | `cms.read` | Full envelope (draft + published) |
| PUT | `/v1/cms-admin/{type}/{slug}` | `cms.write` | Save draft `{ body, seo, revision }`; 409 when `revision` is stale |
| POST | `/v1/cms-admin/{type}/{slug}/publish` | `cms.publish` | Publish now, or `{ at }` (ISO, > 30 s ahead) to schedule; the live version stays until then |
| POST | `/v1/cms-admin/{type}/{slug}/unpublish`, `/archive` | `cms.publish` | Take down (keep as draft) / archive |
| GET | `/v1/cms-admin/{type}/{slug}/revisions` | `cms.read` | Snapshots with author |
| POST | `/v1/cms-admin/{type}/{slug}/rollback` | `cms.write` | `{ revision }` → restored as the draft (re-validated) |
| GET | `/v1/cms-admin/{type}/{slug}/export` | `cms.read` | `greenscape-cms/1` JSON file |
| POST | `/v1/cms-admin/{type}/import` | `cms.write` | Import an export as a draft (create or overwrite the draft) |
| GET / POST / PATCH / DELETE | `/v1/cms-admin/collections/galleryItems[/{id}]`, `/faqs[/{id}]` | `cms.read` / `cms.write` | Live on save |
| GET / PATCH | `/v1/cms-admin/collections/testimonials[/{id}]` | `testimonials.moderate` | `?status`; `{ status }` approve/reject/pending; audited |
| GET | `/v1/cms-admin/site` | `cms.read` | Site config + menus |
| PUT | `/v1/cms-admin/site/config`, `/site/nav/{main\|footer}` | `cms.publish` | Replace; audited |
| POST | `/v1/media/uploads` | `media.write` | `{ filename, contentType, size }` → `{ id, uploadUrl, path }` (image ≤ 15 MB) |
| POST | `/v1/media/uploads/{id}/complete` | `media.write` | `{ alt }`: checks magic bytes and that the image decodes (else deleted, 400), records size + blur placeholder |
| GET / PATCH | `/v1/media`, `/v1/media/{id}` | `media.read` / `media.write` | List (`q`, `page`) / set alt text |
| DELETE | `/v1/media/{id}` | `media.write` | 409 `IN_USE` with `details.usedBy` while content references it |

Every write that changes public content deletes the Redis tags `cms:{type}` and `cms:{type}:{slug}` and POSTs them to `WEB_URL/api/revalidate` (header `x-revalidate-secret`). Public reads with `x-preview-secret: PREVIEW_SECRET` return the draft, uncached.
