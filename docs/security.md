# Security

Living document; each phase adds its section. Threat model and DPA notes are in `architecture.md` §10.

## Authentication (Phase 4)

| Concern | Implementation |
|---|---|
| Identity provider | Supabase Auth: email + password (verification required), password reset, Google OAuth (enabled per environment with `NEXT_PUBLIC_AUTH_GOOGLE=true` + provider credentials in Supabase). |
| Password policy | ≥ 8 chars, upper + lower + digit; enforced by Supabase (`supabase/config.toml`) and mirrored in the form schema so users see the rules before submitting. |
| Token signing | Asymmetric ES256 keys (same as hosted Supabase). The local private key `supabase/signing_keys.json` is gitignored; CI generates a throwaway one per run. |
| API verification | `packages/auth/src/verify.ts`: signature against the project JWKS (cached; refetched on unknown `kid`), issuer, audience `authenticated`, expiry; algorithms limited to ES256/RS256, so an HS256 token signed with the well-known local secret is rejected (integration-tested). |
| Authorization | Roles and permissions live in Postgres (`packages/database/src/rbac.ts` → `pnpm db:seed`). Express loads them per request (Redis-cached ≤ 60 s, invalidated immediately when changed through the API). **Nothing role-related is read from the token or the browser.** |
| Admin app | Separate origin. `proxy.ts` requires a session; the page then asks the API for `admin.access`. Customers see "No admin access". |
| Privileged changes | Changing roles or suspending users requires `roles.manage` / `users.manage`; touching `super_admin` additionally needs `roles.manage_super`; nobody can change their own roles or status. Every change writes an `AuditLog` row (actor, before/after, IP, user agent) in the same transaction. |
| Suspension | A suspended user is refused (403 `ACCOUNT_SUSPENDED`) on their next API request, even with a still-valid token. |
| Redirects | Post-login `next` must be a same-site relative path (`safeNext`); `//host`, `/\host`, absolute and `javascript:` URLs fall back. Error banners use fixed codes, never text from the query string. |
| Forms before JS loads | Auth forms use `method="post"`, so a submit before hydration can't put credentials in the URL or logs. Sign-out is a form POST to `/auth/signout` (server-side `signOut`, 303 redirect), so it works before hydration; SameSite=Lax cookies mean a cross-site form can't trigger it with the session. |
| Enumeration | Password reset answers the same whether or not the account exists. |
| First admin | `pnpm --filter @greenscape/database grant-role <email> super_admin` from a server shell (person must have signed in once). Audited with `via: cli`. |
| Account linking | A new Supabase identity with a **verified** email that matches an existing user is linked to that user (re-created accounts, Firebase migration). Email confirmation is required before any session exists, so only the mailbox owner can trigger this. |

### Known limitations
- MFA (TOTP) for admins is designed (`aal` is extracted from the token) but not enforced yet; planned for the admin hardening pass.
- Locally, web (`:3000`) and admin (`:3001`) share cookies because browsers scope cookies by host, not port. In staging/production they're on different subdomains.
- Session revocation: suspension blocks the API immediately, but an already-issued Supabase access token stays valid at Supabase until expiry (1 h). Admin "sign out everywhere" (Supabase admin API) is a follow-up.

## CMS (Phase 7)
| Concern | Implementation |
|---|---|
| Who can do what | `cms.read` / `cms.write` (drafts) / `cms.publish` (live, schedule, site settings) / `media.*` / `testimonials.moderate`, checked by the API on every call; the admin hides controls the user lacks but never relies on that. |
| Draft leakage | Public reads return `published` only. Drafts are served only with `x-preview-secret`, which only the web server sends, and only while Next draft mode is on. |
| Preview links | `/api/preview?path=&token=` where token = `exp.HMAC-SHA256(path + exp, PREVIEW_SECRET)`, valid 10 minutes, bound to one path, compared in constant time (`packages/auth/src/preview.ts`). Signed by the admin server; the secret never reaches a browser. |
| Revalidation | `/api/revalidate` needs `x-revalidate-secret` and only accepts `cms:*` tags (≤ 50). |
| Content safety | Bodies are Zod-validated (links limited to relative, http(s), mailto, tel; no `javascript:`); rich text is structured JSON rendered by our own renderer, never HTML. Old revisions are re-validated on rollback. |
| Uploads | Signed one-time upload URLs; type and size checked before the slot; magic bytes and a full decode checked after, otherwise the file and row are deleted. Deletion refused while any content references the file. |
| Lost updates | Saves carry the revision they started from; a stale save is a 409, never a silent overwrite. |
| Audit | Testimonial moderation and site settings/menu changes write `AuditLog`; every content save/publish/rollback is a revision snapshot with its author. |

## Shop and payments (Phase 8)
| Concern | Implementation |
|---|---|
| Live money | `PAYMENT_PROVIDER` is `mock` locally. The Stripe adapter refuses `sk_live_`/`rk_live_` keys unless `PAYMENTS_LIVE_APPROVED=true`, which this repository never sets (unit-tested). Checkout and order pages show a test-mode banner or badge. |
| Price tampering | The client sends variant ids and quantities only; prices, delivery fee and totals are computed from Postgres inside the order transaction and snapshotted on `OrderItem`. |
| Overselling | Reservation is one conditional `UPDATE … WHERE onHand - reserved >= qty` per line (sorted by variant), plus the `reserved <= onHand` CHECK. Integration test: 8 parallel checkouts for the last item → exactly one order. |
| Double submits | `idempotencyKey` is unique on `Order`; a repeat (even concurrent) returns the same order. |
| Webhooks | Raw body, signature verified (Stripe `Stripe-Signature`; mock HMAC with `MOCK_PAYMENT_SECRET`), `WebhookEvent` insert first so replays are no-ops, state change under `SELECT … FOR UPDATE` on the order. Unknown refs are recorded, not applied. |
| Stale state | Stock and payment status are never cached. Unpaid holds expire after `RESERVATION_MINUTES`; the job asks the provider before cancelling. A payment that lands after expiry re-takes stock or is refunded automatically. |
| Cart and order access | Guest cart token and order link key are random 24-byte values, stored only as sha256; the cart token lives in an httpOnly SameSite=Lax cookie and is sent server-to-server only. A wrong key and a missing order both answer 404. |
| Staff actions | Permissions per action (products, inventory, orders, refunds, settings); price changes, stock changes, cancellations, refunds, fulfilment and zone fees are audited. CSV export escapes formula prefixes. |
| Mock provider | `/v1/payments/mock/*` exists only when `PAYMENT_PROVIDER=mock`; anyone holding the unguessable ref can settle that payment, so mock must never be the provider in production. |
| Image optimiser | `dangerouslyAllowLocalIP` is enabled only when the configured Supabase host is `127.0.0.1`/`localhost` (local dev and CI), never for a hosted project. |

## HTTP hardening (Phase 3)
API: helmet defaults (CSP `default-src 'self'`, HSTS, nosniff, frame-ancestors self), CORS allow-list with credentials, Redis-backed rate limit (300/min/IP, fails open if Redis is down), 1 MB JSON body limit, request ids, no `x-powered-by`, log redaction of `authorization`/`cookie`. Next.js apps: nosniff, referrer policy, frame options, permissions policy; admin is `noindex`.
