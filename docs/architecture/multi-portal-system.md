# Multi-portal system

Three browser portals and one API, all on one Supabase Auth project. Each portal is its own Next.js app with its own
login page, layout and host-only session cookie. **Every authorization decision is made by the API.**

| Portal | App | Local | Production host | Sign-in |
|---|---|---|---|---|
| Customer website | `apps/web` | `localhost:3000` | `<domain>` | Google or email/password; public browsing needs none |
| Employee portal | `apps/employee` | `localhost:3002` | `employee.<domain>` | Email + password from HR (temporary at first) |
| Admin / Super admin | `apps/admin` | `localhost:3001` | `admin.<domain>` | Email + password from an administrator |
| API | `apps/api` | `localhost:4000` | `api.<domain>` | Bearer access token (Supabase JWT), verified per request |

```text
Supabase Auth (one identity per person)
   |  access token (JWT: sub, email, aal, amr)
   v
API authenticate()  -- verifies signature (JWKS), issuer, audience, expiry
   |  maps sub -> User row in Postgres (created as `customer` on first sight)
   |  loads roles -> permissions from Postgres (cached <= 60 s, invalidated on change)
   |  narrows them for this session:
   |    - not a password sign-in (Google, link, recovery) -> customer permissions only
   |    - temporary password not yet replaced          -> customer permissions only
   |    - REQUIRE_STAFF_MFA=true and aal1               -> self-service permissions only (optional)
   v
requirePermission(...) on every route (deny by default), plus object-level checks in handlers
```

The Next apps never decide access: they call `/v1/auth/me` to choose what to render and where to redirect, and every
data call goes to the API with the user's token, which refuses anything not allowed.

## What lives where

- **Postgres (Prisma):** users, roles, permissions, employees, schedules, attendance, leave, orders, payments, stock,
  quotations, audit log. Transactional data only.
- **MongoDB:** CMS content and copy (pages, services, projects, stories, site settings, product marketing text) with
  draft/publish envelopes and revisions.
- **Redis:** cache (CMS reads, permissions), rate limits, job locks.
- **Supabase Storage:** media library and quotation attachments.

## Related

- Roles and permissions: `docs/auth/role-permissions.md`
- Sign-in: `docs/auth/supabase-authentication.md`, `docs/auth/google-oauth.md`, `docs/auth/employee-provisioning.md`
- Cross-portal rules: `docs/security/cross-portal-access.md`
- Hosting: `docs/deployment/subdomains.md`
