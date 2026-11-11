# Admin dashboard and analytics

Only collected data is shown. Nothing is estimated or invented.

## Analytics page (`/analytics`, permission `analytics.read`)

Granted to `super_admin`, `admin`, `content_manager` and `ecommerce_manager`. Period: last 7, 30 or 90 days (Manila
dates), each figure compared with the previous period of the same length.

| Figure | Source |
|---|---|
| Visitors (unique per day, approximate), page views, most visited pages | Website page-view beacon |
| Product views, most viewed products | Page views of `/shop/<product>` |
| Popular services | Page views of `/services/<service>` |
| Checkout starts | Page views of `/checkout` |
| Add to cart | Counted by the API when an item is added (server side) |
| Traffic sources | Referrer host of a visitor's first view of the day, or "Direct or unknown" |
| Devices | Mobile / tablet / desktop from the browser's user agent |
| Countries | Only when the CDN in front of the website sends a country header (`cf-ipcountry`, `x-vercel-ip-country`) |
| Paid orders, paid order value (gross) | Orders in Postgres paid through the verified payment webhook; value needs `reports.sales`; test-mode orders are flagged |
| New accounts, quotation requests | Postgres |
| Content published | CMS revision log in MongoDB |

Charts: visitors per day (bars with hover/focus tooltips and a table view), the shop funnel (visitors → product views →
add to cart → checkout → paid orders) and ranked lists. Sales and attendance exports stay on the report pages.

## How collection works (privacy)

1. `apps/web` renders `components/page-view.tsx` on public pages (not in CMS preview). On each route it sends a beacon to
   the website's own `/api/collect`. The referrer is sent with the first view only.
2. `/api/collect` drops the view if the browser sends Global Privacy Control (`Sec-GPC: 1`) or Do Not Track, then forwards
   path, referrer, user agent and CDN country to `POST /v1/analytics/pageview` with the internal key. The API refuses any
   other caller.
3. The API ignores bots, non-page paths and anything malformed. It increments daily counters in `AnalyticsDaily`
   (`day, metric, key, count`). A visitor is counted once a day by adding a keyed hash of (day, address, user agent) to a
   Redis HyperLogLog. The hash is never stored or logged, the key changes every day, and the HyperLogLog cannot return it.

No cookies, local storage, IP addresses, user ids or form contents are recorded, so no consent banner is needed for this
counting. The admin and employee portals are never tracked. If Redis is down, page views still count but visitors,
sources, devices and countries do not.

The website privacy notice explains this in a "Website statistics" section. New installs get it from `pnpm content:seed`; an existing site gets it with `pnpm exec tsx scripts/migrate/privacy-analytics.ts` (published through the CMS with a revision; refuses if the privacy page has unpublished edits).

Limits: unique visitors are approximate (HyperLogLog, about 1% error) and per day, so a period total sums daily uniques.
Visitors sharing one address and browser count as one. Without `INTERNAL_API_KEY` set on the website and API, nothing
is collected.

## Dashboard (home page)

One permission-aware endpoint, `GET /v1/admin/overview`: sales today and a 14-day net-sales chart, orders to send out,
low stock, new quotations, unanswered messages, attendance today, corrections, leave, feedback to moderate, system status.

## Not built

Heatmaps and session replay (Microsoft Clarity would need a consent banner and masking of every form; not recommended for
checkout, account or employee pages). CSV export of the analytics page.
