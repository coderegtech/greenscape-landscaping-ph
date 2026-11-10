# Threat model

Scope: the Greenscape platform as built in this repository: public website, admin console, Express API, Postgres, MongoDB, Redis, Supabase Auth and Storage, the payment provider (Stripe test mode or the mock adapter). Method: data-flow diagram, then STRIDE per trust boundary. Reviewed 2026-11-10 with the security audit.

## Assets (what an attacker wants)
| Asset | Where | Why it matters |
|---|---|---|
| Staff accounts, especially admin and super admin | Supabase Auth + `User`/`UserRole` | Full control of orders, refunds, prices, customer data, employee records |
| Customer personal data (names, emails, phones, addresses, chats, quote attachments) | Postgres, private Storage bucket | Data Privacy Act (RA 10173) duty, trust |
| Employee data (attendance, leave, schedules) | Postgres | Employment records; no payroll is held |
| Orders, payments, stock | Postgres | Money and inventory integrity |
| Published content and media | MongoDB, public Storage bucket | Defacement, malicious links |
| Secrets (Supabase service key, DB passwords, payment keys, internal keys) | Server environment only | Each one unlocks a layer above |

## Actors
Anonymous visitors and bots; signed-in customers; employees (self-service); staff by role; a stolen or phished staff session; a malicious insider with one role; the payment provider (webhooks); an attacker able to read the repository (it must hold no secrets).

## Data flow and trust boundaries
```
Browser ──(1)──▶ Website (Next, :3000) ──(3)──▶ API (Express, :4000) ──(5)──▶ Postgres / Mongo / Redis
Browser ──(2)──▶ Admin  (Next, :3001) ──(3)──▶ API                     ──(6)──▶ Supabase Auth / Storage
Browser ──(4)──▶ API (direct: forms, uploads, availability)
Browser ──(7)──▶ Supabase Auth (sign-in, MFA) / Storage (signed upload URLs)
Payment provider ──(8)──▶ API /v1/payments/webhooks
```
Boundaries: (1, 2, 4, 7) the internet; (3) server to server, carrying the user's token and the visitor's address vouched by `INTERNAL_API_KEY`; (5, 6) private network and the service-role key; (8) a third party with a signing secret.

## STRIDE, with controls
| Threat | Example | Control (where) | Residual |
|---|---|---|---|
| **S**poofing a user | Forged or expired JWT; HS256 token signed with the well-known local secret | JWKS signature (ES256/RS256 only), issuer, audience, expiry (`packages/auth/src/verify.ts`) | Low |
| Spoofing a staff member with a stolen password | Phishing, password reuse | **TOTP MFA required for staff permissions** (H-2); Supabase sign-in throttling | Stolen MFA-enrolled device; CAPTCHA recommended (L-7) |
| Spoofing via account relink | New identity with a staff member's email takes over their row | Relink only if Supabase confirms the new identity's email; audited (M-1) | Low |
| Spoofing a visitor address | Fake `X-Forwarded-For`/`x-client-ip` to dodge limits | Address accepted only with the internal key; otherwise the socket/proxy address (H-1) | Low |
| Spoofing the payment provider | Fake "paid" webhook | Signature over the raw body; replay table; state change under row lock | Low |
| **T**ampering with prices or totals | Client sends a price | Server computes everything from Postgres inside the order transaction | Low |
| Tampering with content (XSS) | Script in CMS rich text or links | Structured JSON rendered by React; link schemes allow-listed; `//` refused (L-3); CSP on both apps | `unsafe-inline` on the website CSP (prerendered pages) |
| Tampering cross-site (CSRF) | Another site posts a cookie-authenticated action | API takes bearer tokens only; Next server actions check Origin (tested); SameSite=Lax cookies | Low |
| Tampering with attendance | Employee edits their own day or approves themselves | Server time only; corrections need an approver; nobody approves themselves | Low |
| **R**epudiation | Staff deny a price change or refund | `AuditLog` for roles, status, prices, stock, refunds, CMS publish/moderation, gallery/FAQ, relinks; security log channel | Audit log is in the app database (append-only by convention, not by DB permission; see database-security.md) |
| **I**nformation disclosure (IDOR) | Read another customer's order or chat | Ownership checks in every customer route; a wrong key and a missing order look the same (404) | Low |
| Information disclosure in errors | Stack traces, SQL, constraint names | Central error handler; 500s are generic; P2002 metadata removed (L-2) | Low |
| Secrets in code or bundles | Service key in the browser | Gitleaks over full history; Semgrep rules; bundles scanned for secrets after build | Low |
| **D**enial of service | Flood forms or checkout; exhaust a shared limit | Per-visitor limits (H-1), forms fail closed (M-2), body limits, pagination caps | No WAF/CDN rate limiting yet (deployment) |
| **E**levation of privilege | Assign yourself admin; call staff routes directly | `roles.manage` (+ `roles.manage_super`), never your own roles; permissions from Postgres only; staff routes need aal2 | Insider with `roles.manage` can grant `admin` (by design; audited) |

## Top residual risks, in order
1. Website CSP needs `'unsafe-inline'` for scripts, because pages are prerendered and can't carry a nonce. Mitigated by having no raw HTML rendering.
2. No line-manager scoping for attendance (M-7). An owner decision.
3. Attachments are not malware-scanned (L-6). Mitigated by type checks, a private bucket, short-lived URLs and no inline rendering.
4. Production infrastructure (TLS proxy, managed databases, backups, WAF) is designed (`infrastructure-security.md`) but not deployed; deploying needs approval.
