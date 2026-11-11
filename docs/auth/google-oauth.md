# Sign-in, Google OAuth and the admin portal

How customers and staff sign in, what needs an account, how roles work, and the external setup still to do before
Google sign-in and the admin subdomain work outside local development.

## What needs an account

Browsing stays public: pages, services, projects, stories, the gallery, the shop catalogue and prices.
Everything below needs a signed-in account. **The API enforces this.** The web app's "Sign in to continue" prompt is
only a convenience for the visitor.

| Action | API | Guest gets |
|---|---|---|
| Contact form | `POST /v1/contact` | 401 → sign-in prompt (the typed message is kept for the round trip) |
| Quote request and attachments | `POST /v1/quotations`, `POST /v1/quotations/attachments` | 401 → prompt before step 2, before attaching, and on send |
| Cart and checkout | `POST/PATCH /v1/cart/items`, `POST /v1/checkout`; `/checkout` page | 401 → prompt on "Add to cart"; `/checkout` redirects to `/auth/login?next=/checkout` |
| AI assistant | `/v1/assistant/messages`, `/v1/assistant/conversations*` | 401 → prompt when the chat button is pressed |
| Reviews (testimonials) | `POST /v1/testimonials` | 401 (unchanged) |
| Profile, addresses, wishlist, order and inquiry history, account deletion | `/v1/me/*`, `DELETE /v1/me` | 401; `/account` redirects to sign-in |

After signing in, the visitor returns to the page they were on, with `?intent=chat|contact|quote|cart|wishlist`, and
the action resumes: the chat reopens, or the saved form draft is restored.

## Pages

- Web: `/auth/login`, `/auth/register`, `/auth/callback`, `/auth/forgot-password`, `/auth/reset-password`.
  The old `/login`, `/signup`, `/forgot-password` and `/reset-password` redirect permanently.
- Admin: `/login` on the admin host (`admin.<domain>/login`): email and password only, no Google button, no sign-up.
  Staff accounts are created by an administrator (`docs/auth/employee-provisioning.md`).
- Employee portal: `/login` on `employee.<domain>`: email and password only. HR creates every employee login.

## Roles

Roles are stored in Postgres and resolved by the API on every request (cached briefly, invalidated on change).
**Nothing from the browser, the email domain or the OAuth provider grants a role.**

| Brief's role | Implemented as |
|---|---|
| Guest | Not signed in. Public reads only. |
| Customer | `customer`. **Every new account gets this role**, whether it came from Google or email. |
| Staff | The operational roles: `content_manager`, `ecommerce_manager`, `inventory_staff`, `hr_manager` and `employee`. Each has only the permissions its job needs. |
| Admin | `admin`. |
| Super Admin | `super_admin` (also manages roles and admins). |

**Google never opens internal tools.** A session that was not a password sign-in (Supabase `amr` has no `password`:
Google, magic link, recovery link) keeps customer permissions only, even if the account holds staff or employee roles
(`passwordSignInRequired` on `/v1/auth/me`, API code `PASSWORD_SIGN_IN_REQUIRED`). Supabase links a Google identity to an
existing account with the same verified email, so this check, not the provider, is what keeps the portals apart.

Authenticator-app MFA is **not required** (`REQUIRE_STAFF_MFA` defaults to `false`). It can be switched on as extra
hardening; then staff permissions also need an aal2 session.

## Google sign-in setup (external, not done yet)

Automated tests use local email and password test identities and never call Google, so Google sign-in has **not
been tested end to end**: it needs credentials only you can create.

1. **Google Cloud Console** → APIs & Services:
   - Configure the OAuth consent screen (External; app name, support email, logo; scopes `openid`, `email`, `profile`).
   - Credentials → Create OAuth client ID → **Web application**.
   - **Authorised JavaScript origins:** `https://<domain>` (Google is for the customer website only).
   - **Authorised redirect URI:** `https://<project-ref>.supabase.co/auth/v1/callback`. This is Supabase's callback,
     not ours: Supabase completes the exchange, then sends the browser to our `/auth/callback`.
2. **Supabase dashboard** → Authentication:
   - Providers → Google: enable it, and paste the client ID and secret.
   - URL Configuration:
     - **Site URL:** `https://<domain>`.
     - **Redirect URLs:** `https://<domain>/auth/callback**`, `https://admin.<domain>/auth/callback**` and
       `https://employee.<domain>/auth/callback**` (the last two for password-recovery links only).
     - Add any staging hosts the same way.
3. **Environment:** set `NEXT_PUBLIC_AUTH_GOOGLE=true` for the web build. This shows the Google button, which
   stays hidden while Google is not configured.
4. **Local Google (optional):** in `supabase/config.toml`, enable `[auth.external.google]` with
   `client_id = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_CLIENT_ID)"`, `secret = "env(SUPABASE_AUTH_EXTERNAL_GOOGLE_SECRET)"` and
   `skip_nonce_check = true`. Add `http://localhost:54321/auth/v1/callback` as a redirect URI on the Google client.

The Google profile picture is stored as `User.avatarUrl` (https only) and shown on `/account`. The name is display only.

## Admin portal on its own subdomain

(The employee portal follows the same pattern on `employee.<domain>`: see `docs/deployment/subdomains.md`.)

The admin is a separate Next.js app, already built to run on its own host:

| Setting | Web (`<domain>`) | Admin (`admin.<domain>`) |
|---|---|---|
| Next app | `apps/web` (port 3000) | `apps/admin` (port 3001) |
| `WEB_URL` / `ADMIN_URL` (API, emails) | `https://<domain>` | `https://admin.<domain>` |
| `CORS_ORIGINS` (API) | both origins, comma-separated | |
| Supabase redirect URLs | `https://<domain>/auth/callback**` | `https://admin.<domain>/auth/callback**` |

- **DNS:** a `CNAME` (or `A`/`AAAA`) record for `admin` pointing at the host or load balancer that serves `apps/admin`.
  The API (for example `api.<domain>`) gets its own record. Issue TLS certificates for all three hosts.
- **Hosting:** run `apps/admin` as its own service (Docker image `docker/next.Dockerfile` built for the admin app, or `next start -p 3001`
  behind the proxy). Route `admin.<domain>` to it and `<domain>` to `apps/web`.
- **Sessions:** Supabase cookies are host-only (no `Domain` attribute), so the web site and the admin hold separate
  sessions. Signing in on one does not sign you in on the other, and an admin session cookie is never sent to the
  public site. Keep it that way: do not set a parent-domain cookie.
- **Optional hardening:** restrict `admin.<domain>` by IP or VPN at the proxy, and keep the admin out of search
  engines (it already sends `noindex`).

## Environment variables added or changed

| Variable | Where | Purpose |
|---|---|---|
| `NEXT_PUBLIC_AUTH_GOOGLE` | web | Show the Google button (`true` once step 2 above is done) |
| `ANTHROPIC_API_KEY` | API only | Claude for the AI assistant (see `ai-assistant.md`) |
| `OPENAI_COMPAT_BASE_URL`, `OPENAI_COMPAT_API_KEY` | API only | Optional OpenAI-compatible provider |

Supabase service-role keys stay on the API. The browser only ever receives the publishable key.
