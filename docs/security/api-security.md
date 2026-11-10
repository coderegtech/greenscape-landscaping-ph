# API security (Express)

Entry point: `apps/api/src/app.ts`. Middleware order matters and is deliberate:

1. `requestId`: a correlation id on every response (`x-request-id`) and every log line.
2. `pino-http`: request logging with `authorization` and `cookie` redacted; bodies are never logged.
3. `helmet()`: CSP `default-src 'self'`, HSTS, nosniff, frame-ancestors, no `x-powered-by`.
4. `securityEvents`: 401/403/429 to the security log, with repeat alerts (`rate-limiting.md`, M-4).
5. CORS: an allow-list (`CORS_ORIGINS`), credentials, preflight cached 10 minutes. Requests without an `Origin` (server to server) pass. A foreign origin gets no CORS approval (tested).
6. Public cached reads, mounted before the limiter: `/v1/health`, `/v1/cms`, `/v1/shop` catalogue. Webhooks use a raw body.
7. `apiRateLimit`: per visitor, Redis-backed.
8. `express.json({ limit: '1mb' })`: oversized bodies get 413, malformed JSON 400 `INVALID_JSON`.
9. API docs only when `API_DOCS=true` or outside production (L-5).
10. `authenticate`: optional bearer auth; an invalid header is a 401.
11. Routers: each route declares `requireAuth` / `requirePermission(...)` (deny by default: no permission means 403).
12. `notFound`, then `errorHandler`.

## Validation (Zod)
- Every body, query and path parameter goes through a Zod schema before use: `Schema.parse(req.body | req.query | req.params)`. Ids are `uuid()` or ObjectId regexes; slugs are a strict regex; pagination is `PageQuery` (`pageSize` ≤ 100); sort keys are enums mapped to fixed SQL/Mongo fragments.
- **Mass assignment**: schemas list the writable fields, so anything else (`role`, `userId`, `price`, `status` where not allowed) is stripped before it reaches Prisma or Mongo. Updates use explicit `data: { … }` objects.
- **NoSQL operators**: Mongo filters are built on the server from validated scalars. Request bodies go through strict object schemas, so `$where`/`$ne` keys can't reach a filter or `$set`.
- **SQL**: Prisma query builder, or `$queryRaw` tagged templates (parameterised). `*Unsafe` raw calls are banned (Semgrep rule `greenscape-no-unsafe-raw-sql`). LIKE patterns escape `%`, `_` and `\`.

## Errors
`middleware/error-handler.ts` maps known errors to stable codes: `VALIDATION_ERROR` (with field paths), `INVALID_JSON`, `PAYLOAD_TOO_LARGE`, `CONFLICT`, `NOT_FOUND`, `FORBIDDEN`, `MFA_REQUIRED`, `RATE_LIMITED`, `TEMPORARILY_UNAVAILABLE`. Anything else is a 500 `INTERNAL` with a generic message, logged with the request id and sent to Sentry. Prisma `meta` is never returned (L-2). Stack traces, SQL and connection details never leave the server.

## Other hardening
- **Method restriction**: routers register exact methods; anything else gets 404 from `notFound`.
- **Caching**: personal and stateful responses (`/cart`, `/orders/:number`, `/availability`, admin overview) send `cache-control: no-store`. Public CMS and catalogue reads are cached by tag and never contain stock, prices of unpublished items, or user data.
- **Resource limits**: 1 MB JSON, 1 MB webhook bodies, `pageSize` ≤ 100, CMS lists ≤ 500, CSV imports ≤ 1 MB, uploads via signed URLs with size caps.
- **Timeouts**: Node's `requestTimeout` (300 s) and `headersTimeout` defaults; calls from the Next servers to the API time out after 10 s (`AbortSignal.timeout`).
- **Webhooks**: raw body, provider signature (`Stripe-Signature` or mock HMAC), replay-safe `WebhookEvent` insert first, state change under `SELECT … FOR UPDATE`; bad signatures are logged as security events.

## Tests
`tests/integration/api.test.ts` (health, OpenAPI, Redis down), `security.test.ts` (CORS, API docs switch, event log), `rate-limit.test.ts`, `mfa.test.ts`, and each module's tests for 401/403/validation. `tests/unit/security-log.test.ts` covers the error and event shapes.
