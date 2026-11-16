# Feature inventory

Business features across the three portals: what each does, where it appears, what it depends on, and its status on
`main` ([status key](system-status.md)). The older audit of the previous website's features is in
[audit/features.md](../audit/features.md).

Status: **V** implemented and verified (screenshot and/or automated test) · **G** implemented, gated by environment
configuration · **P** partial · **N** not on `main`.

## Customer

| Feature | Business flow | Pages | API | Depends on | Status |
|---|---|---|---|---|---|
| Browse services and packages | Service list → service page with packages, before/after, guides | `/services`, `/services/[slug]` | `GET /v1/cms/*` | MongoDB, Redis cache | V |
| Project portfolio | Filter by category → project story with photos | `/projects`, `/projects/[slug]` | `GET /v1/cms/*` | MongoDB | V |
| Masonry gallery + lightbox | Filter by category/place, show more, open viewer, swipe | `/gallery` | `GET /v1/cms/*` | MongoDB, Supabase Storage | V |
| Stories and guides | Article list → article (YouTube embeds) | `/stories`, `/stories/[slug]` | `GET /v1/cms/*` | MongoDB | V |
| Testimonials and reviews | Read approved reviews; signed-in visitors submit one for moderation | `/testimonials` | `POST /v1/testimonials` | Postgres/Mongo, moderation in admin | V |
| Email + password accounts | Register → verify email → sign in; forgot / reset password | `/auth/*` | Supabase Auth, `GET /v1/auth/me` | Supabase | V |
| Google sign-in | Continue with Google → back to the page, action resumes | `/auth/login` | Supabase OAuth | Google OAuth client per environment, `NEXT_PUBLIC_AUTH_GOOGLE` | G |
| Profile, addresses, wishlist, account deletion | Edit details and delivery addresses; delete account | `/account` | `/v1/me/*`, `DELETE /v1/me` | Postgres | V |
| Product catalogue | Search, filter, sort, paginate; product page with sizes, live stock, care text | `/shop`, `/shop/[slug]` | `GET /v1/shop/*` | Postgres (stock never cached), Mongo (care text) | V |
| Cart | Add (signed in), change quantity, remove; header count | `/cart` | `/v1/cart/*` | Postgres | V |
| Checkout and test payment | Delivery address and municipality (fee added) → idempotent checkout → 30-min stock hold → provider → webhook → paid | `/checkout`, `/checkout/pay/[ref]`, `/orders/[number]` | `POST /v1/checkout`, `/v1/payments/webhooks/:provider` | Payment provider (mock locally), Redis-locked expiry job | V (mock) |
| Order history | Account lists orders; order page by owner or signed link | `/account`, `/orders/[number]` | `GET /v1/orders/mine`, `GET /v1/orders/:number` | Postgres | V |
| Quotation request | 3-step form with attachments → numbered reference → emails → status in account | `/quote`, `/account` | `POST /v1/quotations`, attachments | Supabase Storage (private), mail | V |
| Contact form and messages | Contact form → admin inbox, reply by email; two-way chat thread | `/contact`, `/messages` | `POST /v1/contact`, `/v1/messages` | Postgres, mail | V |
| AI assistant chat | Signed-in visitors ask questions; staff configure and review | chat button on every page | `/v1/assistant/*` | AI provider key, knowledge base | G |
| Notifications | Bell and page for order, quote and message updates | `/account/notifications` | `/v1/notifications` | Socket.IO, optional Web Push | V |

## Employee

| Feature | Business flow | Pages | API | Depends on | Status |
|---|---|---|---|---|---|
| Admin-provisioned login | HR "Create login" → temporary password → forced change on first sign-in | `/login`, `/password` | `POST /v1/auth/password` | Supabase Auth | V |
| Clock in / out | One tap; server time; serialised; works before JavaScript | `/` | `POST /v1/me/attendance/punch` | Postgres, schedule | V |
| Clock-in selfie | Off / optional / required by HR setting; private storage, auto-deleted | `/` | signed upload | Supabase Storage (private) | V (off by default) |
| Attendance history | Month calendar, day records with late / undertime / overtime | `/attendance` | `GET /v1/me/attendance` | Postgres | V |
| Schedule | Assigned shifts | `/schedule`, dashboard "Coming up" | — | Postgres | V |
| Leave requests | Type, dates, reason; balance and overlap checks; cancel | `/requests` | `/v1/me/leave` | Postgres | V |
| Attendance corrections | Proposed vs recorded times, photo/PDF attachment | `/requests`, `/attendance` | `POST /v1/me/attendance/corrections` | Supabase Storage | V |
| Notifications | Decisions on leave and corrections, schedule changes | `/notifications`, bell | `/v1/notifications` | Socket.IO, optional Web Push | V |
| Offline notice | Banner when the device is offline; no offline saving | every page | — | — | P |
| Install as an app | Browser install prompt | — | — | web app manifest | N |

## Admin

| Feature | Business flow | Pages | Permission | Status |
|---|---|---|---|---|
| Role-aware dashboard | One overview endpoint; each role gets its own panels | `/` | `admin.access` | V |
| Analytics | Cookieless first-party page views, visitors, funnel, sources, devices; CSV | `/analytics` | `analytics.read` | V |
| Orders | Status tabs, fulfilment steps, cancel, partial/full refund with restock | `/orders`, `/orders/[id]` | `orders.*` | V |
| Products | Editor, photos, sizes and prices (audited), CSV export | `/products`, `/products/new`, `/products/[id]` | `products.*` | V |
| Inventory | Adjust with reason, history, low stock, CSV stock-count import with preview | `/inventory` | `inventory.*` | V |
| Customers | Paid-order totals, quotes, search, detail | `/customers`, `/customers/[id]` | `customers.read` | V |
| Quotations | Queue, detail, notes, attachments, status | `/quotations`, `/quotations/[id]` | `quotations.*` | V |
| Messages | Customer chat inbox with unread counts; contact-form inbox | `/messages`, `/messages/[id]`, `/messages/contact` | `messages.*` | V |
| Sales report | Gross, refunds, net, best sellers, by area; CSV / Excel | `/reports/sales` | `reports.sales` | V |
| CMS | Schema-driven editors, drafts, preview links, scheduled publish, revisions, JSON import/export, media library | `/cms/*` | `cms.*` | V |
| Testimonial moderation, gallery, FAQs, site settings | Approve/reject reviews; manage photos, FAQs, menus, company details | `/cms/testimonials`, `/cms/gallery`, `/cms/faqs`, `/cms/site` | `cms.read`, `testimonials.moderate` | V |
| Employee records and provisioning | Add employee, link or create login, department, manager, schedule | `/employees`, `/employees/new`, `/employees/[id]` | `employees.*` | V |
| Work schedules | Split and overnight shifts, grace period | `/employees/schedules` | `employees.*` | V |
| Attendance board | Daily board, bulk approval, HR edits with reason, per-employee history, selfies | `/attendance`, `/attendance/employee/[id]` | `attendance.*` | V |
| Corrections queue | Proposed vs recorded side by side, approve / reject | `/attendance/corrections` | `attendance.*` | V |
| Leave approvals | Queue with month calendar, balances, leave types, holidays | `/leave`, `/leave/balances`, `/leave/settings` | `leave.*` | V |
| Attendance report | Per employee; table, CSV, XLSX | `/reports/attendance` | `reports.attendance` | V |
| Users and roles | Assign roles, built-in + custom roles, suspend, sign out everywhere | `/users`, `/users/roles`, `/users/roles/[key]` | `users.*` | V |
| Settings and delivery areas | Notification recipients, delivery zones and fees | `/settings`, `/settings/delivery` | `settings.*` | V |
| System monitoring | Live DB / Mongo / Redis / Storage / WebSocket checks, error counts, webhooks, push jobs | `/system` | `system.monitor` | V |
| Audit log | Filter by action, actor, record; before/after | `/audit` | `audit.read` | V |
| AI assistant administration | Provider settings, knowledge base, conversation review | `/assistant/*` | `assistant.*` | V |
| Staff MFA | TOTP enrol / verify | `/mfa` | — | G (`REQUIRE_STAFF_MFA`) |
| Notifications | Bell, centre, categories, sounds, push | `/notifications` | `admin.access` | V |

## Cross-system

| Capability | How | More |
|---|---|---|
| Authentication | Supabase Auth; API verifies every JWT against JWKS; session narrowing (Google → customer only) | [diagrams §2–4](../architecture/diagrams.md#2-customer-authentication) |
| Authorization | Roles → permissions in Postgres, Redis-cached ≤ 60 s, deny by default, object checks | [authorization-matrix.md](../security/authorization-matrix.md) |
| PostgreSQL | Transactional data, Prisma migrations with CHECK constraints | [database-schema.md](../database-schema.md) |
| MongoDB | CMS documents with draft/publish envelopes and revisions | [diagrams §5–6](../architecture/diagrams.md#5-postgresql-and-mongodb-responsibilities) |
| Supabase Storage | Public media and private documents via signed URLs; magic-byte checks | [storage-security.md](../security/storage-security.md) |
| Redis | Cache-aside with stampede lock and tags, rate limits, job locks, Socket.IO adapter | [architecture.md §6](../architecture.md#caching) |
| Socket.IO | Server → client signals after commit; ids only; re-fetch through REST | [realtime/README.md](../realtime/README.md) |
| Web Push | VAPID, per-device subscriptions, delivery log | [notifications.md](../notifications.md) |
| Service worker | Push and notification click only; no offline cache | [diagrams §11](../architecture/diagrams.md#11-pwa-installation-and-offline-behavior) |
| Security controls | CSP, HSTS, rate limits, honeypots, audit log, session revocation | [security.md](../security.md) |
| Docker / Dokploy | One image per app; migration job | [deployment/dokploy.md](../deployment/dokploy.md) |
| CI/CD and production branch | CI + Security gate → snapshot → staging smoke → `production` → Dokploy | [deployment/ci-cd-pipeline.md](../deployment/ci-cd-pipeline.md) |

Payroll is excluded from the project (D5).
