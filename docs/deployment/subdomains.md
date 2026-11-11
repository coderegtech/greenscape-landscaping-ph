# Subdomains

| Host | Service | Port (container) |
|---|---|---|
| `greenscapelandscapingph.com` | `apps/web` | 3000 |
| `employee.greenscapelandscapingph.com` | `apps/employee` | 3002 |
| `admin.greenscapelandscapingph.com` | `apps/admin` | 3001 |
| `api.greenscapelandscapingph.com` | `apps/api` | 4000 |

Images: `docker build -f docker/next.Dockerfile --build-arg APP=<web|admin|employee> --build-arg PORT=<port> ...` and
`docker/api.Dockerfile`; `docker/compose.prod.yml` has all four services. Only a TLS-terminating reverse proxy is public;
it routes each host to its service and adds HTTPS (HSTS is sent by the apps in production).

## Environment

Every origin comes from the environment; nothing is hard-coded for production.

| Variable | Set on | Example |
|---|---|---|
| `WEB_URL` | api, web, admin, employee | `https://greenscapelandscapingph.com` |
| `ADMIN_URL` | api, web | `https://admin.greenscapelandscapingph.com` |
| `EMPLOYEE_URL` | api, web | `https://employee.greenscapelandscapingph.com` |
| `NEXT_PUBLIC_API_URL` | web, admin, employee (build) | `https://api.greenscapelandscapingph.com` |
| `CORS_ORIGINS` | api | the three portal origins, comma-separated |
| `INTERNAL_API_KEY` | api, web, admin, employee | same random value everywhere |

## Supabase

- Site URL: the website. Redirect URLs: `https://<each portal host>/auth/callback**`. Local: `supabase/config.toml`
  lists `localhost:3000`, `3001`, `3002` (restart Supabase after changing it).
- Google provider: website origin only (`docs/auth/google-oauth.md`).

## Cookies and CSRF

Session cookies are host-only (no `Domain`), `SameSite=Lax`, `Secure` over HTTPS: the three portals never share a
session. State-changing calls go to the API with a bearer token (no cookie auth on the API), and Next server actions
check the request origin. Do not set a parent-domain cookie.

## Local development

`pnpm dev` starts all apps on localhost (3000, 3001, 3002, 4000). No DNS needed.
