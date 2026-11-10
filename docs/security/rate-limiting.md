# Rate limiting

All limits are fixed windows counted in **Redis**, so they hold across API instances (`express-rate-limit` + `rate-limit-redis`). A 429 response carries `RateLimit-Policy`, `RateLimit` (IETF draft-8) and `Retry-After`, and every 429 is logged on the security channel.

## Who is the "client"? (H-1)
The website and admin call the API from their own servers (server actions), so for those calls the API's socket address is the Next server. Counting that address made every visitor share one budget: 30 checkouts an hour site-wide.

- The Next servers send the visitor's address in `x-client-ip`, together with `x-internal-key` = `INTERNAL_API_KEY` (a server-only secret shared by api, web and admin). The address is taken from `X-Forwarded-For` counting `TRUSTED_PROXY_HOPS` from the right, so a value the browser itself puts in that header is never used.
- The API believes `x-client-ip` **only** when the key matches (constant-time compare). Anyone else is counted by `req.ip` (`trust proxy` = 1 hop).
- Form limits count a **signed-in user by user id** (so an office's shared IP doesn't throttle everyone) and anonymous visitors by address. IPv6 addresses are grouped per /56, so an attacker can't rotate through a block.
- Keys are **HMAC-hashed** with `INTERNAL_API_KEY`, so Redis and logs never hold a raw IP or user id.

## Policies
| Endpoint | Limit | Keyed by | If Redis is down |
|---|---|---|---|
| All `/v1` routes after the public reads | `RATE_LIMIT_PER_MIN` (300/min) | visitor | **fail open** (reads keep working) |
| Contact form `POST /v1/contact` | `FORM_RATE_LIMIT_PER_HOUR` (10/h) | visitor or user | **fail closed: 503** |
| Quote attachments, quote submit | 10/h each | visitor or user | fail closed |
| Checkout `POST /v1/checkout` | 30/h | visitor or user | fail closed |
| Customer messages `POST /v1/me/messages` | 30/h | user | fail closed |
| Testimonials `POST /v1/testimonials` | 5/h | user | fail closed |
| Sign-in and sign-up (Supabase) | 30 per 5 min per IP | IP (Supabase) | n/a |
| Emails sent by Supabase (confirm, reset) | `email_sent` per hour | project | n/a |
| Token refresh (Supabase) | 150 per 5 min per IP | IP | n/a |

Public CMS and catalogue reads are exempt by design: they are cached, read-only and low-cardinality, and the Next servers build and render every page through them. They are the place for CDN/WAF rate limiting in production.

**Compared with the brief's starting values**: login is 30 per 5 min per IP at Supabase rather than 5 per 15 min per account and IP. Per-account lockout isn't available in Supabase; CAPTCHA is the recommended addition (L-7). Registration and password reset are Supabase's limits. The general API limit is 300/min rather than 100/min, because the admin console's server-side calls come from staff working at speed; measured in the Phase 12 load test.

## Repeated refusals: alerts (M-4)
When one client collects 20 refusals (401/403/429) within 5 minutes, the API emits one `security.alert` (error level, also sent to Sentry). Examples: credential stuffing against the API, an IDOR sweep, a script probing staff routes. The counter is in Redis; with Redis down, events are still logged.

## Tests
- `tests/integration/rate-limit.test.ts`: two forwarded visitors get separate budgets; a forged `x-client-ip` (no key, wrong key) is ignored; 429 has `Retry-After` and `RateLimit-Policy`; Redis keys contain no raw addresses; with Redis down, forms return 503 and reads still work.
- `tests/integration/security.test.ts`: one event per refusal, one alert at the threshold.
- Load test (`pnpm load:test`) runs with limits raised to measure the application itself.
