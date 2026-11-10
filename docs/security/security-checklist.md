# Pre-deployment security checklist

Use before every production deployment. A box that can't be ticked needs a written exception: what, why, who approved it (the owner) and an expiry date. Record it in the release notes and, for scanner findings, in `osv-scanner.toml` / `.trivyignore` / `.gitleaks.toml`.

## Every release
- [ ] CI green: typecheck, lint, unit, integration, e2e (including `mfa`, `csrf`, `security-headers`, `permissions`).
- [ ] Security workflow green: `pnpm audit --prod`, OSV-Scanner, Gitleaks, Semgrep, Trivy (no fixable HIGH/CRITICAL). No expired exceptions.
- [ ] Migrations reviewed (no destructive change without a backup and a restore plan); run with the **migrate** role, not the app role.
- [ ] No new `NEXT_PUBLIC_*` variable holds a secret; no secret in images (Trivy secret scan, Gitleaks).
- [ ] New API routes declare `requirePermission` / `requireAuth` and validate input with Zod; object ownership checked; a test refuses the wrong user.
- [ ] New state-changing website or admin features use server actions or bearer calls (CSRF covered); new forms have a rate limit that fails closed.
- [ ] CSP still has zero violations (e2e); no new third-party origin without updating the policy.

## Environment (first deployment and after infrastructure changes)
- [ ] HTTPS only at the proxy/CDN; HTTP redirects to HTTPS; HSTS present; `TRUSTED_PROXY_HOPS` matches the proxy count.
- [ ] Separate Supabase projects, databases, secrets and payment accounts per environment.
- [ ] Supabase production: email confirmations on, TOTP MFA on, refresh-token rotation on, site URL and redirect list set to the production domains only, CAPTCHA on (L-7), custom SMTP.
- [ ] `REQUIRE_STAFF_MFA=true`, `PAYMENTS_LIVE_APPROVED=false` until the owner approves live payments, `API_DOCS` unset (off in production).
- [ ] Postgres, Mongo and Redis not reachable from the internet; app roles least-privilege (`docker/init/*`); TLS to managed databases (`sslmode=require`, `mongodb+srv`, `rediss`).
- [ ] Secrets in the platform's secret store; `docker/prod.env.example` complete; nobody has the service key on a laptop.
- [ ] Containers run read-only, non-root, all capabilities dropped (compose defaults).
- [ ] Backups enabled for Postgres, Mongo and Storage; **a restore has been tested** in the last 30 days.
- [ ] Logs shipped and retained (application 30 days, security channel 180 days); Sentry DSN set; someone receives `security.alert`.
- [ ] Every staff account has MFA enrolled; ex-staff suspended (which bans them at Supabase too).

## Before taking real payments (owner approval required)
- [ ] Live keys in the secret store only; webhook endpoint and secret registered; one live low-value payment and refund tested.
- [ ] Daily reconciliation between provider payouts and `Payment` rows.
- [ ] Third-party penetration test or at least an OWASP ZAP baseline against staging, with findings triaged.

## Known open items (from the audit)
- [ ] M-7: decide on line-manager scoping for attendance (owner).
- [ ] L-6: malware scanning for attachments if volume grows.
- [ ] L-7: CAPTCHA on sign-in, sign-up and reset.
- [ ] Make `AuditLog` append-only at the database level (revoke UPDATE/DELETE from `greenscape_app`).
- [ ] Scheduled payment reconciliation job.
- [ ] Lighthouse/Puppeteer upgrade in `scripts/audit` before the OSV exceptions expire (2027-02-10).
