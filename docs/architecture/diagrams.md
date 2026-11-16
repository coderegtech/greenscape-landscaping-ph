# Architecture diagrams

Thirteen diagrams of the system **as built**, drawn from the code. Each one links to the page that covers that part
in prose. Where the code differs from the original brief, the
[stack discrepancies](../overview/system-status.md#stack-discrepancies) table says how.

Contents:
1. [Overall architecture](#1-overall-architecture)
2. [Customer authentication](#2-customer-authentication)
3. [Employee authentication](#3-employee-authentication)
4. [Admin authentication and authorization](#4-admin-authentication-and-authorization)
5. [PostgreSQL and MongoDB responsibilities](#5-postgresql-and-mongodb-responsibilities)
6. [CMS publishing and cache invalidation](#6-cms-publishing-and-cache-invalidation)
7. [Purchase and payment](#7-purchase-and-payment)
8. [Employee attendance](#8-employee-attendance)
9. [Socket.IO communication](#9-socketio-communication)
10. [Web Push delivery](#10-web-push-delivery)
11. [PWA installation and offline behavior](#11-pwa-installation-and-offline-behavior)
12. [Docker and Dokploy deployment](#12-docker-and-dokploy-deployment)
13. [CI/CD and the production branch](#13-cicd-and-the-production-branch)

## 1. Overall architecture

```mermaid
flowchart LR
  subgraph Browsers
    C[Customer<br/>apps/web :3000]
    E[Employee PWA<br/>apps/employee :3002]
    A[Admin PWA<br/>apps/admin :3001]
  end
  subgraph API["apps/api :4000 (Express 5)"]
    REST[REST /v1/*<br/>authenticate → requirePermission]
    WS[Socket.IO<br/>server → client only]
    JOBS[Redis-locked jobs<br/>stock holds · day close · CMS schedule · push]
  end
  SA[(Supabase Auth)]
  ST[(Supabase Storage)]
  PG[(PostgreSQL 17<br/>Prisma 7)]
  MG[(MongoDB 8<br/>CMS documents)]
  RD[(Redis 7<br/>cache · rate limits · locks · socket adapter)]
  PAY[Payment provider<br/>mock · Stripe test]
  LLM[AI assistant provider<br/>Anthropic / OpenAI-compatible]

  C & E & A -- sign in --> SA
  C & E & A -- server components + mutations<br/>Bearer JWT --> REST
  C & E & A <-. live events .-> WS
  REST --> PG & MG & RD & ST
  REST -- verify JWT (JWKS) --> SA
  WS --- RD
  REST <--> PAY
  REST --> LLM
  JOBS --> PG & RD
```

Browsers never reach Postgres, MongoDB or Redis. The only direct browser → Supabase calls are sign-in and uploads to
signed URLs the API issued. More: [architecture.md](../architecture.md),
[multi-portal-system.md](multi-portal-system.md).

## 2. Customer authentication

```mermaid
sequenceDiagram
  autonumber
  actor V as Visitor
  participant W as apps/web
  participant SA as Supabase Auth
  participant API as apps/api
  participant PG as PostgreSQL
  V->>W: Sign in (email + password, or Google when NEXT_PUBLIC_AUTH_GOOGLE=true)
  W->>SA: signInWithPassword / OAuth redirect
  SA-->>W: session (httpOnly cookies via @supabase/ssr)
  W->>API: GET /v1/auth/me (Bearer access token)
  API->>SA: verify signature against JWKS (ES256/RS256), iss, aud, exp
  API->>PG: upsert User by sub, grant `customer` on first sight
  API-->>W: user + permissions
  W-->>V: back to ?next= page, the interrupted action resumes (?intent=cart|quote|chat…)
```

Google sessions keep **customer permissions only**, even for a staff member: internal tools need a password
sign-in. More: [auth/supabase-authentication.md](../auth/supabase-authentication.md),
[auth/google-oauth.md](../auth/google-oauth.md).

## 3. Employee authentication

```mermaid
sequenceDiagram
  autonumber
  actor HR as HR (admin portal)
  actor EM as Employee
  participant API as apps/api
  participant SA as Supabase Auth
  participant P as apps/employee
  HR->>API: Create login on the employee record
  API->>SA: create identity + one-time temporary password (shown once, never stored or emailed)
  API->>API: User.mustChangePassword = true, role `employee`
  EM->>P: /login with the temporary password
  P->>API: /v1/auth/me → mustChangePassword
  P-->>EM: /password (choose a new one)
  EM->>API: POST /v1/auth/password
  API-->>P: full employee permissions (attendance.self, leave.self)
  P-->>EM: dashboard with clock card
```

Employees never self-register; there is no Google button on this portal. More:
[auth/employee-provisioning.md](../auth/employee-provisioning.md).

## 4. Admin authentication and authorization

```mermaid
flowchart TD
  L["Admin /login<br/>email + password only"] --> SA[Supabase session]
  SA --> MFA{REQUIRE_STAFF_MFA?}
  MFA -- true and aal1 --> M["/mfa: enrol or verify TOTP"] --> ME
  MFA -- false (default) --> ME
  ME[GET /v1/auth/me] --> N{narrow permissions}
  N -- not a password sign-in --> CUST[customer permissions only → no-access notice]
  N -- temporary password --> PW["/password"]
  N -- staff roles --> NAV[menu = permissions<br/>apps/admin/lib/nav.ts]
  NAV --> R[every API route: requirePermission, deny by default<br/>roles → permissions from Postgres, cached ≤ 60 s in Redis]
  R --> AUD[(AuditLog: role changes, edits, approvals)]
```

8 built-in roles plus custom roles edited at `/users/roles`. More:
[auth/role-permissions.md](../auth/role-permissions.md),
[security/authorization-matrix.md](../security/authorization-matrix.md).

## 5. PostgreSQL and MongoDB responsibilities

```mermaid
flowchart LR
  subgraph PG["PostgreSQL (Prisma): transactional truth"]
    U[User · Role · Permission · AuditLog]
    S[Product · Variant · Inventory · StockMovement · Cart · Order · Payment · Refund · DeliveryZone]
    Q[Quotation · Conversation · Message · ContactInquiry]
    H[Employee · WorkSchedule · AttendanceRecord · TimePunch · Correction · Leave* · Holiday]
    NT[Notification · PushSubscription · Preference · Delivery · AnalyticsDaily · MediaAsset]
  end
  subgraph MG["MongoDB: CMS copy"]
    C[pages · services · projects · articles · gallery · faqs · testimonials · site settings · product marketing text]
    RV[pageRevisions]
  end
  subgraph RD["Redis: disposable"]
    K[cache-aside keys + tag sets]
    RL[rate limits]
    LK[job locks]
    HL[visitor HyperLogLogs]
  end
  MG -. read through .-> K
  PG -. permissions .-> K
```

Never cached: stock, carts, checkout totals, payment status, attendance approvals. Schema:
[database-schema.md](../database-schema.md).

## 6. CMS publishing and cache invalidation

```mermaid
sequenceDiagram
  autonumber
  actor CM as Content manager
  participant A as apps/admin
  participant API as apps/api
  participant MG as MongoDB
  participant RD as Redis
  participant W as apps/web
  CM->>A: edit draft (schema-driven fields, rich text, images)
  A->>API: PUT /v1/cms-admin/... (revision check)
  API->>MG: save draft + snapshot to pageRevisions
  CM->>A: Preview → signed, path-bound 10-minute link → web draft mode
  CM->>A: Publish now, or schedule it (a 60 s Redis-locked worker publishes due ones)
  API->>MG: copy draft → published in one conditional update
  API->>RD: delete keys in the document's tag sets
  API->>W: POST /api/revalidate (signed) with the same Next.js cache tags
  W-->>W: next request renders fresh HTML
```

More: [admin/cms-management.md](../admin/cms-management.md), [architecture.md §6](../architecture.md#caching).

## 7. Purchase and payment

```mermaid
sequenceDiagram
  autonumber
  actor CU as Customer
  participant W as apps/web
  participant API as apps/api
  participant PG as PostgreSQL
  participant PP as Provider (mock / Stripe test)
  CU->>W: Add to cart (signed in)
  W->>API: POST /v1/cart/items
  CU->>W: /checkout: delivery address and municipality
  W->>API: POST /v1/checkout (idempotency key)
  API->>PG: server-side prices, conditional stock reservation (30-minute hold)
  API->>PP: createCheckoutSession
  PP-->>CU: pay page (mock: /checkout/pay/[ref] with Pay / Decline / Cancel)
  PP->>API: webhook (signature check, WebhookEvent idempotency)
  API->>PG: order → paid, payment row, events
  API-->>CU: confirmation email, /orders/[number]
  Note over API,PG: expired holds: a Redis-locked job re-asks the provider, then cancels and releases stock
```

The UI shows a "Test mode — no real charge" banner. Live Stripe keys are refused. More:
[security/payment-security.md](../security/payment-security.md).

## 8. Employee attendance

```mermaid
flowchart TD
  CI[Clock in / out button<br/>form post, works before JS] --> SV[POST punch: server time only,<br/>serialised per employee]
  SV --> SEL{selfie policy<br/>off · optional · required}
  SEL --> TP[(TimePunch)]
  TP --> RC[recompute AttendanceRecord:<br/>late · undertime · overtime · worked<br/>Manila UTC+8, split & overnight shifts]
  RC --> LIVE[live 'attendance' signal → admin board]
  JOB[every 15 min, Redis-locked:<br/>close last 2 days → absent · missing out · holiday · leave] --> RC
  EMP[Employee: correction request<br/>+ optional photo/PDF] --> QQ[Admin /attendance/corrections]
  QQ -- approve / reject --> RC
  LV[Employee: leave request<br/>checked against balance + overlaps] --> LQ[Admin /leave]
  LQ -- approve: row-locks balance, marks days --> RC
  QQ & LQ --> NOTIF[notification + push to the employee]
```

No payroll, pay or government-ID fields exist anywhere. More:
[employee/attendance-system.md](../employee/attendance-system.md).

## 9. Socket.IO communication

```mermaid
sequenceDiagram
  autonumber
  participant EP as Employee tab
  participant API as API instance A
  participant RD as Redis adapter
  participant API2 as API instance B
  participant AD as Admin tab (attendance.read)
  EP->>API: REST POST clock in
  API->>API: COMMIT, then events.emit('attendance.changed')
  API->>RD: live {v:1,id,topic:'attendance',kind:'clocked_in'} → room perm:attendance.read
  RD->>API2: fan out
  API2-->>AD: 'live' event (ids only, no names or times)
  AD->>API2: router.refresh() → re-fetch through the authorized REST API
```

Clients never emit; a client that does is disconnected. More: [realtime/README.md](../realtime/README.md).

## 10. Web Push delivery

```mermaid
sequenceDiagram
  autonumber
  participant B as Browser (PWA)
  participant SW as /sw.js
  participant API as apps/api
  participant PS as Push service (browser vendor)
  B->>B: user turns on push (permission prompt)
  B->>API: POST subscription (endpoint + keys) → PushSubscription
  Note over API: business event → Notification row → preferences say "push"
  API->>PS: web-push (VAPID-signed)
  PS->>SW: push event
  SW-->>B: system notification, a click opens the linked page
  API->>API: NotificationDelivery row: sent / failed / expired (410 removes the subscription)
```

Needs `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` (`pnpm vapid:keys`); without them push is off and the in-app bell
still works. More: [notifications.md](../notifications.md).

## 11. PWA installation and offline behavior

```mermaid
flowchart LR
  SW[app/sw.js route, one per app<br/>packages/ui/src/notifications/sw.ts] --> L[install → skipWaiting<br/>activate → clients.claim]
  SW --> PUSH[push → showNotification<br/>notificationclick → focus or open the link]
  NET{navigator.onLine} -- false --> BAN[OfflineBanner: changes can't be saved]
  NET -- true --> LIVE[socket reconnects with backoff,<br/>pages re-fetch after reconnect]
  MAN[Web app manifest:<br/>not on main] -. on unmerged branches .-> INST[Install prompt]
```

**As built on `main`:** the service worker exists for **push only**. It has no `fetch` handler, so nothing is
cached for offline use, and offline shows as a banner (`packages/ui/src/components/offline.tsx`). There is **no web
app manifest** on `main` (`apps/*/app/manifest.ts` is absent), so browsers do not offer to install the portals yet.
Admin and employee manifests exist on the unmerged branches `claude/greenscape-pwa-branding-09917e` and
`claude/pwa-push-gaps`. See [system status](../overview/system-status.md).

## 12. Docker and Dokploy deployment

```mermaid
flowchart LR
  subgraph Dokploy host
    API[api image<br/>apps/api/Dockerfile]
    WEB[web image]
    ADM[admin image]
    EMP[employee image]
    MIG[migration job<br/>prisma migrate deploy]
    PG[(postgres)]
    MG[(mongo)]
    RD[(redis)]
  end
  SUPA[(Supabase project<br/>Auth + Storage)]
  DNS[domain · admin.domain · employee.domain · api.domain] --> WEB & ADM & EMP & API
  MIG --> PG
  API --> PG & MG & RD & SUPA
  WEB & ADM & EMP --> API
```

One image per service, built from the repository root. More: [deployment/dokploy.md](../deployment/dokploy.md),
[deployment/subdomains.md](../deployment/subdomains.md).

## 13. CI/CD and the production branch

```mermaid
flowchart TD
  PR[feature branch → pull request] --> MAIN[main]
  MAIN --> CI[CI: typecheck · lint · unit · integration · build · e2e · Trivy]
  MAIN --> SEC[Security: audit · OSV · Gitleaks · Semgrep · image scans]
  CI & SEC --> G{gate: both green on the<br/>same commit, still head of main?}
  G -- no --> STOP[end green, reason in summary]
  G -- yes --> SNAP[snapshot from config/production-files.json + Gitleaks]
  SNAP --> STG[staging on the runner: build images from snapshot,<br/>migrate, start, smoke test]
  STG --> PUB[publish: fast-forward `production`]
  PUB --> DEP[deploy-production.yml → Dokploy]
```

More: [deployment/ci-cd-pipeline.md](../deployment/ci-cd-pipeline.md),
[deployment/production-branch.md](../deployment/production-branch.md).
