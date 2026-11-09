# Testing

| Layer | Tool | Location | Needs services | Runs in CI |
|---|---|---|---|---|
| Unit | Vitest (`unit` project) | `tests/unit/` | no | yes |
| Integration | Vitest (`integration` project) + supertest | `tests/integration/` | Postgres, Mongo, Redis (`pnpm services:up`) + local Supabase (`pnpm supabase:start`) | yes |
| End-to-end | Playwright (desktop 1440, mobile 390) | `tests/e2e/` | all services + built apps | yes |

## Rules
- Tests never touch production or the live Firebase site. Integration tests use the local Docker databases with unique, per-run keys/slugs and clean up after themselves.
- Integration files run serially (`fileParallelism: false`) because they share databases.
- The app factory (`createApp(deps)`) takes injected dependencies, so tests can run the API in-process with different configurations (e.g. Redis pointed at a dead port).
- Every new business rule gets a unit or integration test in the same PR; every user flow gets a Playwright spec.

## Test accounts
- Integration tests create users through the Supabase admin API at `*@test.greenscape.local` and delete them (and their Postgres rows) afterwards.
- E2E uses `*@e2e.greenscape.local`; a Playwright global teardown deletes all of them after every run.
- Email flows (sign-up confirmation, password reset) are tested end-to-end by reading the real message from the local Mailpit inbox.

## What is covered (Phases 3–4)
- Env loading: coercion, comma lists, one error listing every invalid key.
- CMS schemas: valid page, unknown section types, unsafe `javascript:` links, slug format, **prices refused in product marketing content**.
- Cache: falls through to the source when Redis is down; one load under a 20-request stampede across two instances; tag invalidation leaves other keys; loader errors aren't cached.
- API: health (ok / degraded with Redis down), standard error body with caller's request id, malformed JSON → 400, CORS allow-list, security + rate-limit headers, OpenAPI 3.1 document, rate limiter passes when its store is down.
- Database: inventory CHECK (reserved ≤ on hand, no negatives), negative price rejected, duplicate SKU → P2002.
- E2E: public shell renders with correct title/H1/lang, no console errors, no horizontal overflow at 390 px; web security headers; admin is `noindex`.
- Auth (integration): no/garbage/malformed tokens → 401; HS256 token forged with the local legacy secret → 401; ES256 token from a key not in the JWKS → 401; first sign-in creates exactly one user (5 concurrent requests) with only the customer role; customers get 403 with the missing permission listed; role changes apply on the next request and are audited with before/after; only super admins can grant super admin; nobody can change their own roles; unknown roles → 400; suspension locks the user out immediately; user search and role listing.
- RBAC catalog (unit): every grant exists; admin = all minus super-admin and secrets; only staff roles get admin.access; duty separation (content ≠ HR/payments, HR ≠ orders/CMS, inventory staff can't change prices or refund).
- Redirect guard (unit): relative paths pass; `//host`, `/\host`, absolute and `javascript:` URLs fall back.
- Auth (e2e, desktop + mobile): sign-up → real confirmation email → account page; client-side validation messages + aria-invalid; wrong password message; protected page redirect and return; sign-out ends the session; open-redirect attempt stays on site; forgot password → email → new password → sign in with it; bogus callback code → friendly error; admin: signed-out → login, customer → no access, staff → in (after a role grant outside the API, within the 60 s permission TTL).
- Design system (e2e, desktop + mobile): axe WCAG 2.1 AA (no serious/critical) on /design, /, /login, /signup, /forgot-password, admin /login; content visible with JavaScript off; reduced motion shows end states; reveals start hidden below the fold and appear on scroll; skip link is the first tab stop; desktop menus open from the keyboard and Escape returns focus; mobile sheet lists every section and closes with Escape; no horizontal overflow at 390/768/1024/1440; hero action within 1280×800; dialog + toast.
- Static: `pnpm lint` (jsx-a11y recommended, React hooks, Next core-web-vitals, no `transition-all`).
- CMS API (integration): site/nav, page sections, 404/400 slugs, service order + package prices (placeholder item dropped), project filters, story topics, legacy id → slug, approved-only short-name testimonials, Redis tags.
- Quotes (integration): real upload through the signed URL, numbering, normalised phone, attachment verification (fake PNG rejected, reuse rejected, unknown id rejected, type/size refused before a slot), validation errors, honeypot not stored, emails to customer and team (Mailpit), signed-in linking and /mine, customer 403 on inbox, staff triage audited and visible to the customer; contact stored + emailed; feedback needs sign-in and stays private until approved; form rate limit 429.
- CMS editing (integration, 13): customers get 403; validation errors carry field paths; drafts stay private until published and publishing replaces the cached public version; stale revision → 409; revisions + restore; preview header shows the draft only with the server secret; scheduled publish applied by the worker; export/import round trip; unpublish and archive; testimonial moderation; gallery add/remove live; media upload through the signed URL with dimensions + blur (mislabelled and corrupt images refused and removed); usage-guarded delete. Not yet covered: FAQ CRUD, site settings/menus, the `cms.write`-without-`cms.publish` split.
- CMS editing (e2e, desktop): staff creates a page from a template, edits rich text, saves, opens the signed preview (draft visible, banner shown), publishes → public `/slug` shows it, edits the title and republishes → public page updates via tag revalidation, history lists versions, archive → 404; validation errors marked on the fields; media upload → alt text → delete; non-image refused.
- Shop (unit): Stripe adapter refuses live keys, verifies `Stripe-Signature` (payloads signed offline with Stripe's documented scheme), maps Checkout events; peso → centavo conversion is exact.
- Shop (integration, 16): catalogue (server prices, no stock in cached data, live availability); zones (only active with a fee); cart pricing ignores client prices, guest → account merge; **8 parallel checkouts on stock 1 → exactly one order**; **webhook replay is a no-op**; bad signature 400; double-submitted checkout → one order; failed payment releases stock; expired hold released, and a payment arriving after someone else bought the stock is refunded automatically; inactive zone and empty cart refused; order visible only to its owner or the link key; fulfilment order enforced, paid orders can't be cancelled; partial then full refund with restock; customers get 403 on shop admin; stock never below reserved; CSV export and dry-run/apply import; low-stock filter.
- Shop (e2e, desktop + mobile): guest product page → cart (quantity change, header count) → checkout → test payment → confirmation page and email, stock decremented; declined payment cancels and releases stock; sold-out button disabled, unpriced product asks for a price (contact subject prefilled); legacy product and catalogue URLs redirect; axe on shop, product, cart, checkout; staff fulfils an order through to delivered (desktop).
- Local e2e runs use 4 Playwright workers. With 6, the browsers, three Next servers, the API and Supabase kept a 12-core machine at 100% CPU and API calls timed out; the API alone serves 100 concurrent requests in under 200 ms.
- Public site (e2e): CMS-driven home + JSON-LD; every internal link on six main pages resolves; sitemap URLs all 200 + robots; 9 legacy URL redirects (all hops permanent, story ids → slugs); lightbox keyboard + focus return; before/after keyboard; maintenance prices; full quote flow with upload, reference number and confirmation email; staff inbox status change; contact form; axe on 15 content pages × 2 viewports.
