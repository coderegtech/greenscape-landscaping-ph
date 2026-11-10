# Security testing

Everything here runs locally against local services: Docker Postgres/Mongo/Redis and the local Supabase. Nothing runs against production. Commands: `pnpm test` (unit), `pnpm test:integration`, `pnpm test:e2e`, and the scanners in `.github/workflows/security.yml`.

## What is tested, and where
| Area (brief §13) | Test | File |
|---|---|---|
| **Unauthenticated access refused** | every staff router answers 401/403 without a staff token | module integration tests; `security.test.ts` |
| **Invalid and forged tokens** | malformed header → 401; HS256 token signed with the legacy local secret → 401 | `auth.test.ts` |
| **Unauthorized roles on admin endpoints** | 8-role matrix: menu = permissions, allowed pages open, others redirect | e2e `permissions.spec.ts` |
| **MFA required for staff** | aal1 staff → 403 `MFA_REQUIRED`, self-service still OK; aal2 → staff permissions; customers never asked | `mfa.test.ts`; e2e `mfa.spec.ts` |
| **Logout and session end** | sign-out ends the session; a suspended user is refused at once, banned at Supabase, unbanned on reactivation | e2e `auth.spec.ts`; `security.test.ts` |
| **Reset doesn't reveal accounts** | the same answer for unknown emails | e2e `auth.spec.ts` |
| **Customer A vs Customer B** | an order is visible only to its owner or the link key; carts by user or hashed token; chats by user | `shop.test.ts`, `admin.test.ts` |
| **Employee A vs Employee B** | the portal shows only your own records; nobody approves their own days, corrections or leave | `attendance.test.ts` |
| **Content editors can't touch inventory; customers can't change prices** | 403 on shop-admin for customers and non-shop roles | `shop.test.ts`, permission matrix |
| **No self-promotion** | nobody changes their own roles or status; `super_admin` needs `roles.manage_super` | `auth.test.ts` |
| **Account takeover by relink** | an unconfirmed identity with a staff email is refused and stays unlinked; a confirmed relink is audited | `security.test.ts` |
| **Malformed JSON, oversized bodies, unexpected fields** | 400 `INVALID_JSON`, 413, unknown keys stripped (prices ignored) | `api.test.ts`, `shop.test.ts` |
| **Invalid ids, injection-shaped input** | non-UUID/slug ids → 400; customer search with `%`, `_`, quotes and SQL fragments returns safely | module tests; `admin.test.ts` (hostile search) |
| **NoSQL operators** | CMS bodies parsed by strict schemas, so `$` keys are dropped; unsafe link schemes and `//host` refused | `cms.test.ts`, unit `content-schemas.test.ts` |
| **Unsafe uploads** | mislabelled and corrupt images refused and deleted; attachment type checked by magic bytes | `cms.test.ts`, `quotations.test.ts` |
| **Private files** | the anon key and a signed-in customer can't read or list `private-docs`; its public URL fails; a signed URL works | `security.test.ts` |
| **Rate limits** | per-visitor budgets; forged `x-client-ip` ignored; 429 with `Retry-After`; Redis down → forms 503, reads OK; no raw IPs in Redis | `rate-limit.test.ts` |
| **Security logging** | one event per refusal with ids only (no token, email or IP); one alert at 20; bad webhook signature logged; event shape | `security.test.ts`, unit `security-log.test.ts` |
| **CSRF** | a server action with a foreign `Origin` is refused and stores nothing; the same action from the site works | e2e `csrf.spec.ts` |
| **CORS** | a foreign origin gets no CORS approval; the website origin does | `security.test.ts` |
| **Headers and CSP** | both apps send CSP (admin nonce changes per request); zero `securitypolicyviolation` events on the main website pages and every admin page | e2e `security-headers.spec.ts` |
| **Prices can't be overridden** | a `price` in the cart request is ignored; totals come from the server | `shop.test.ts` |
| **Duplicate webhooks** | replay is a no-op | `shop.test.ts` |
| **Not paid before confirmation** | paid only via a signed provider event | `shop.test.ts` |
| **Refunds by unauthorised users** | 403 without `payments.refund` | `shop.test.ts` |
| **Inventory under concurrency** | 8 parallel checkouts for the last item → 1 order; load test 300 shoppers / 40 units → 40 orders, no oversell | `shop.test.ts`; `pnpm load:test` |
| **Distributed limits across instances** | counters live in Redis (shared); not run with two API processes | design; `rate-limit.test.ts` covers the shared store |

## Results on this branch (2026-11-10)
- Unit: **49 passed** (46 before plus the event and error-shape tests).
- New integration suites: `security.test.ts` **8/8**, `rate-limit.test.ts` **4/4**, `mfa.test.ts` **5/5**.
- New e2e: `mfa.spec.ts` and `csrf.spec.ts` **passed**; `security-headers.spec.ts` passed with the stricter violation listener.
- Full-suite numbers: see the final run in `security-audit.md` → "Verification".
- Scans: `vulnerability-report.md`.

## Not covered (and why)
- **OWASP ZAP baseline**: needs a deployed staging site. Run it against staging before launch (checklist).
- **Two API instances sharing limits**: the store is Redis by construction; a two-process test is a staging item.
- **Penetration test by a third party**: recommended before handling live payments.
