# PWA security

The authentication and authorization design is unchanged: Supabase sessions in cookies, checked in `proxy.ts` on every request; roles and permissions enforced by the API. Installing an app changes how it is opened, not what it may do.

| Concern | How it is handled |
|---|---|
| Private data in caches | The worker stores only `/offline` and two icons, at install time. It has no code path that stores a fetched response. Signed-in pages are sent `no-store`. |
| One user seeing another's data from a cache | Not possible: no personal response is ever cached. Tested after signing in and browsing. |
| Offline as a way around sign-in | The offline screen is static. Online, a request without a session is redirected to `/login` as before. |
| Admin / Employee mixing | Different origins: separate cookies, workers, caches, push subscriptions. Cache names carry the app name; each manifest lists only its own icons. |
| Secrets in the worker | None. It contains no keys or tokens; the Supabase service-role key and the VAPID private key exist only on the API. |
| Public routes added | `/manifest.webmanifest` and `/offline` (static, no data). `/sw.js` and `/api/health` were already public. Icons are static files. |
| CSP | Unchanged nonce policy. The worker is same-origin (`worker-src 'self'` / `default-src 'self'`); the offline screen has no script. |
| HTTPS | Service workers and installation require it; production already sends HSTS. `localhost` is exempt for development. |
| Push | Subscriptions are stored per user and app; delivery is scoped by permission; a notification click only opens same-origin addresses. |
| Sign-out | Clears the session as before. There is no cached personal data to remove. The device's push subscription remains until alerts are turned off (existing behaviour, see below). |
| Disabled accounts | Enforced by the API on every call, as before; an installed app is not treated differently. |
| Google sign-in | Exists only on the customer site. The staff apps sign in with email and password, and a Google account has no staff access unless the API holds roles for it (`tests/e2e/auth/customer-google.spec.ts`, `cross-portal-access.spec.ts`). |
| Authenticator apps | Not required (`REQUIRE_STAFF_MFA` stays off by default). |

## Remaining risk to be aware of

On a shared device, someone who signs out without turning alerts off can still receive that account's push notifications (title and a short message) until they sign in again or alerts are turned off. This predates the PWA work. If shared devices are common, removing the subscription on sign-out is the fix.
