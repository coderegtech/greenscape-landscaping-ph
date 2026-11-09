# Architecture

Status: **design** (Phase 2). Grounded in the audit in `docs/audit/`.

## 1. From → To

| Concern | Today (observed) | Rebuild |
|---|---|---|
| Hosting | Firebase Hosting, static HTML (`*.html` paths), Fastly cache `max-age=3600` | Next.js (web + admin) and Express API in Docker; CDN in front of `web` |
| Data | Cloud Firestore `greenscape-palawan`, read/written **directly from the browser** | PostgreSQL (Prisma) + MongoDB, reached **only through the Express API** |
| Auth | Firebase Auth, Google popup only | Supabase Auth: email+password, verification, reset, Google OAuth |
| Admin authz | Client-side: `settings/adminAccess.emails` array checked in `/admin/js/auth-guard.js`, fallback hard-coded email | Server-side RBAC in Express, roles+permissions in Postgres |
| Files | Firebase Storage | Supabase Storage (public + private buckets, signed URLs) |
| Rendering | Client renders content after Firestore loads (empty shell first) | Server-rendered (ISR) HTML from cached CMS content |
| E-commerce | Catalog only; price + free-text "payment" field; no cart | Full cart → checkout → Stripe test / mock adapter |
| Attendance | Admin `employees` module: `timeLogs` (morning/afternoon in/out + photos), `leaveRequests`, `announcements` | Normalized attendance, schedules, approvals, reports; **no payroll** |

## 2. Monorepo

pnpm workspaces (no Turborepo until build times justify it).

```
greenscape/
├── apps/
│   ├── web/      Next.js App Router — public site + customer account (port 3000)
│   ├── admin/    Next.js App Router — staff/admin (port 3001, separate origin + cookie)
│   └── api/      Express + TypeScript (port 4000)
├── packages/
│   ├── ui/          shadcn/ui-based components + design tokens (Tailwind preset)
│   ├── database/    Prisma schema, client, seed, migrations
│   ├── content/     Zod CMS schemas, Mongo client, JSON-schema export
│   ├── auth/        Supabase SSR helpers (Next) + JWT verify (Express)
│   ├── storage/     Supabase Storage wrapper: upload policy, signed URLs, image pipeline
│   ├── cache/       Redis client, keys, cache-aside + single-flight, invalidation bus
│   ├── payments/    PaymentProvider interface, stripe-test + mock adapters
│   ├── validation/  Shared Zod request/response contracts
│   ├── types/       Inferred types re-exported from validation/content
│   └── config/      tsconfig, eslint, tailwind preset, env loader (Zod-validated)
├── tests/{e2e,integration,unit}
├── docker/  docs/  scripts/  .github/workflows/
```
`validation` is the contract layer: Express validates with it, Next.js infers types from it, OpenAPI 3.1 is generated from it with Zod 4's native `z.toJSONSchema` (`apps/api/src/lib/openapi.ts`); no extra library.

## 3. Request flow

```
Browser ──► apps/web (Next.js, RSC)
              │  server components fetch ──► apps/api  ──► Redis (cache-aside) ──► Mongo / Postgres
              │  client mutations (cart, quote) ──► apps/api (Bearer Supabase JWT or anon cart cookie)
              └─ Supabase Auth (SSR cookies via @supabase/ssr)
Stripe ──webhook──► apps/api /v1/payments/webhooks/stripe
apps/api ──revalidateTag()──► apps/web /api/revalidate (signed secret) after CMS publish
```
Browsers never talk to Postgres/Mongo/Redis. The only direct browser→Supabase call is Auth (and signed-URL uploads that the API issued).

## 4. Authentication & authorization

- **Supabase Auth** is the identity provider for every user type. Next.js uses `@supabase/ssr` (cookie session, refreshed in middleware).
- **Express verifies** the access token on every request against the Supabase JWKS (`jose` `createRemoteJWKSet`, ES256/RS256 only; local dev uses generated ES256 signing keys so all environments share one code path). Checks `iss`, `aud=authenticated`, `exp`. No HS256 shared-secret fallback.
- **Mapping**: `sub` → `User.authUserId`. First authenticated call upserts the `User` and grants `customer`. Staff roles are granted only by an admin (audited).
- **RBAC**: `requirePermission('orders.refund')` middleware loads the user's permission set from Postgres (Redis-cached per user, TTL 60 s, busted on role change). JWT claims are never trusted for roles.
- Admin app is a separate origin; admin routes additionally require MFA-enrolled (`aal2`) sessions for `super_admin`/`admin` once enabled.

| Role | Key permissions |
|---|---|
| super_admin | `*` |
| admin | all except `roles.manage_super`, `settings.secrets` |
| content_manager | `cms.*`, `media.*`, `testimonials.moderate` |
| ecommerce_manager | `products.*`, `orders.*`, `payments.refund`, `customers.read`, `reports.sales` |
| inventory_staff | `inventory.adjust`, `products.read`, `orders.fulfill` |
| hr_manager | `employees.*`, `attendance.*`, `leave.approve`, `reports.attendance` |
| employee | `attendance.self`, `leave.self` |
| customer | `orders.self`, `quotations.self`, `profile.self` |

## 5. Storage (Supabase)

| Bucket | Public | Contents | Access |
|---|---|---|---|
| `public-media` | yes | product, project, gallery, article, CMS, hero images | read: public CDN; write: API only |
| `private-docs` | no | quotation attachments, order docs | signed URL (5 min) issued by API after authz |
| `employee-private` | no | employee photos, clock-in photos (if enabled), leave attachments | signed URL, `hr_manager` or owner |

Upload flow: client asks API for an upload slot (`POST /v1/media/uploads` with mime/size) → API validates type/size against an allow-list, returns a signed upload URL for a server-chosen path (`{bucket}/{yyyy}/{mm}/{uuid}.{ext}`) → client uploads → client calls `POST /v1/media/uploads/:id/complete` → API checks object exists, sniffs magic bytes, generates `webp`/`avif` derivatives (`sharp`), writes `MediaAsset`. Service-role key lives only in `apps/api`. Nightly job deletes `MediaAsset` with `refCount=0` older than 7 days (dry-run log first).

## 6. Caching (Redis) <a id="caching"></a>

Pattern: cache-aside with **single-flight lock** (`SET lock NX PX 5000`) to prevent stampedes; jittered TTLs; every read path works if Redis is down (circuit breaker → straight to DB, logged).

| Key | TTL | Invalidated by |
|---|---|---|
| `gs:{env}:cms:page:{slug}:{locale}` | 1 h | publish/unpublish of that page |
| `gs:{env}:cms:nav:{key}:{locale}` | 6 h | nav publish |
| `gs:{env}:cms:config:{locale}` | 6 h | siteConfig publish |
| `gs:{env}:cms:list:{collection}:{locale}:{hash}` | 10 min | any publish in collection (tag set) |
| `gs:{env}:catalog:list:{hash}` | 5 min | product/variant/price change |
| `gs:{env}:catalog:product:{slug}` | 5 min | product change (stock **not** included) |
| `gs:{env}:authz:user:{userId}` | 60 s | role change |
| `gs:{env}:report:{name}:{hash}` | 15 min | none (aggregate, non-PII, admin-only) |
| `gs:{env}:rl:{route}:{ip}` | window | rate limiter |

Never cached: stock levels, cart, checkout totals, payment/order status, attendance approvals, permissions beyond 60 s. Product pages read live stock via a small uncached endpoint.

Invalidation: each write publishes `{tags:[...]}` → API deletes tagged keys (Redis sets per tag) and calls `web /api/revalidate` with the same Next.js cache tags.

## 7. Payments

```ts
interface PaymentProvider {
  createCheckoutSession(order: OrderSnapshot, urls: { success: string; cancel: string }): Promise<{ ref: string; redirectUrl: string }>;
  verifyPayment(ref: string): Promise<PaymentStatus>;
  handleWebhook(rawBody: Buffer, headers: Record<string, string>): Promise<NormalizedPaymentEvent | null>;
  refundPayment(ref: string, amount: Decimal, reason?: string): Promise<{ refundRef: string; status: string }>;
  getPaymentStatus(ref: string): Promise<PaymentStatus>;
}
```
- `stripe-test` adapter: Checkout Sessions in **PHP** (Stripe supports PHP presentment; settlement account country is a business decision). Refuses to start if the key starts with `sk_live_` unless `PAYMENTS_LIVE_APPROVED=true` (and that flag is not set anywhere in this repo).
- `mock` adapter: local default; a `/mock-pay/:ref` page with Succeed / Fail / Cancel buttons that fires the same normalized webhook path, so e2e tests cover the real state machine.
- Webhook: raw body, signature verification, `WebhookEvent` idempotency insert, then state transition in a transaction. A reconciliation job polls `getPaymentStatus` for `PENDING` payments older than 15 min.
- UI shows a persistent **"Test mode — no real charge"** banner whenever `isTest`.
- Swap path for production: a PayMongo / Xendit / Maya adapter (all support GCash, Maya, cards in PH) implementing the same interface. Recommendation in `docs/implementation-plan.md`.

## 8. API surface (v1)

`/v1/health`, `/v1/auth/me`, `/v1/users`, `/v1/roles`, `/v1/products`, `/v1/categories`, `/v1/inventory`, `/v1/cart`, `/v1/checkout`, `/v1/orders`, `/v1/payments` (+ `/webhooks/:provider`), `/v1/quotations`, `/v1/messages`, `/v1/cms/*`, `/v1/media`, `/v1/employees`, `/v1/schedules`, `/v1/attendance`, `/v1/leave`, `/v1/reports/*`, `/v1/settings`. OpenAPI at `/v1/docs`.

Middleware order: request-id → pino logger → helmet → CORS (allow-list: web, admin origins) → rate limit (Redis store) → body parsers (raw for webhooks) → auth (optional/required) → route Zod validation → handler → central error handler (Zod → 400, AuthZ → 403, NotFound → 404, Prisma P2002 → 409, else 500 + Sentry).

## 9. Environments & deployment

- `.env.example` per app; env parsed by Zod at boot (fail fast).
- `docker/compose.dev.yml`: postgres 17, mongo 8, redis 7, plus apps. Supabase: hosted dev project (or `supabase start` locally).
- Staging and production: separate Supabase projects, databases, Stripe accounts/keys, Sentry environments.
- CI (GitHub Actions): install → typecheck → lint → unit → integration (service containers) → build → Playwright e2e against compose → upload screenshots/report. Deploy jobs exist but are manual-approval only.

## 10. Data privacy (PH DPA 2012 / RA 10173)

Privacy notice + consent capture on forms; purpose-limited fields; employee data in private buckets and permission-gated endpoints; audit log for access to employee records; retention policy (quotations 2 y, attendance per labor-record rules, clock-in photos 90 days if the feature is enabled at all); data-subject export/delete endpoints; breach runbook in `docs/security.md`.
