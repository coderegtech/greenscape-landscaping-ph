# Loading, empty, error, offline and 404 states

One shared kit in `packages/ui/src/components`, used by the website, the admin console and the employee portal.

## Audit: what was blocking

| Where | Finding | Now |
|---|---|---|
| Admin `(console)/loading.tsx` | The only full-screen loader: a fixed, blurred overlay with the logo, shown on every route change (it hid the sidebar and header). | Renders `PageSkeleton` **inside** the shell. |
| Website, employee portal | No `loading.tsx`, so no instant feedback on slow pages. | Employee `(portal)/loading.tsx`; website `shop/loading.tsx`, `gallery/loading.tsx`. |
| Live updates (Socket.IO) | `LiveRefresh` calls `router.refresh()`: the page stays mounted and only changed data re-renders. No overlay, no skeleton. | Unchanged (already correct). |
| Gallery, product and story photos | Already reserve the real aspect ratio and shimmer (`.frame-shimmer`) until the photo paints. | Unchanged. |
| Employee clock-in | Already button-level (`loading={pending}`) and only reports success from the server's answer. | Also disabled while offline. |
| Service worker | Push only; no `fetch` handler, so nothing is cached and there is no offline *page*. | Offline is a notice in the page (below). Nothing sensitive is cached. |
| Auth | Sessions are checked on the server before the layout renders; private content is never sent before that. | Unchanged. |

`LoadingOverlay` (logo + circle over a blurred page) is kept for the rare case where nothing safe can render. Nothing uses it today.

## Components

| Import | Use |
|---|---|
| `components/skeleton` | `Skeleton` (shimmer, or `variant="pulse"`). Static under reduced motion. |
| `components/skeletons` | `TableSkeleton`, `ProductGridSkeleton`, `CardSkeleton`, `StatsSkeleton`, `ChartSkeleton`, `GallerySkeleton` (real photo ratios), `ProfileSkeleton`, `ProseSkeleton`, `PageSkeleton`. |
| `components/section-boundary` | `SectionBoundary`: Suspense + a local error with Retry for one part of a page. |
| `components/empty-state` | `EmptyState` with `variant` (products, orders, gallery, projects, articles, notifications, employees, attendance, leave, search, analytics, generic), `size`, `actionLabel` + `actionHref` or `onAction`. |
| `components/error-state` | `ErrorState` (`kind`: error, offline, forbidden) and `NotFoundState` (the plant-zero 404; `compact` for the portals). |
| `components/offline` | `useOnline()` and `OfflineBanner`. |
| `components/botanical-art` | The original SVG illustrations (`Illustration`). Decorative, `aria-hidden`; the text next to them says the same. |

Skeleton colours come from the design tokens (`--gs-rule` base, a white highlight), so they show on both the white website and the sage-white admin.

### Which state to show

- **Loading**: data not here yet → skeleton.
- **Empty**: the request worked, nothing came back → `EmptyState`.
- **No results**: records exist but the filters match none → `EmptyState variant="search"` with a "clear filters" action.
- **Error**: the request failed → `ErrorState` with Retry. Never "No data".
- **Offline**: `ErrorState kind="offline"` or `OfflineBanner`.
- **Forbidden**: `ErrorState kind="forbidden"` (no retry; no data from the page).
- **Not found**: `notFound()` or an unknown URL → `not-found.tsx` (real 404 status).

Server components can only pass `actionHref`; `onAction` and `onRetry` need a client component.

## Pages

- 404: website (garden-path copy, Back to Home / Explore Our Services), admin (Return to dashboard), employee (Return to dashboard). `(console)/not-found.tsx` and `(portal)/not-found.tsx` render inside the shell for `notFound()`; unknown URLs use `app/not-found.tsx`.
- Error: `error.tsx` in the website, `(console)` and `(portal)`: the shell stays, the page area offers Try again. Only a support reference is shown.
- Offline: `OfflineBanner` in the admin and employee layouts. Employee clock-in is disabled with an explanation. Nothing is queued or cached.

## Limits

- The admin dashboard still loads as one unit (one `Promise.all`). The route-level skeleton covers it, but splitting it into independently suspended sections is a larger refactor. `SectionBoundary` is ready for it.
- There is no `global-error.tsx`: a crash in a root layout still shows Next's default screen.
- The browser's online flag is a hint; a dead connection that still reports online surfaces as a request error.

## Gallery

`/design` (with `ENABLE_DESIGN_GALLERY=true`) shows every skeleton, all 12 empty states and the error, offline and forbidden states. `tests/e2e/states.spec.ts` and the axe run in `design-system.spec.ts` cover it.

## Test results

`tests/e2e/states.spec.ts` + `design-system.spec.ts` (axe, WCAG 2.1 AA on `/design`, now including the new blocks), run against the local dev servers on both Playwright projects: 52 passed, 6 skipped (admin tests on the mobile project). Covered: website 404 (status, copy, link home), admin 404 in the shell, route change keeps the sidebar and shows `Loading page` placeholders with no fixed overlay (the page request is held for 2 s), offline notice on/off, all 12 empty illustrations distinct and `aria-hidden`, error/offline/forbidden announced, shimmer on and off under reduced motion, no overflow at 390/768/1024/1440 px.

Not covered by a test: the `SectionBoundary` Retry path and the employee 404 (same component as the admin one).
