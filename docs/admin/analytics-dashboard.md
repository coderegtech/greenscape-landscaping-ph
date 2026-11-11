# Admin dashboard and analytics

Only collected data is shown. Nothing is estimated or invented.

## What the dashboard shows today

One permission-aware endpoint, `GET /v1/admin/overview`: each role receives only the sections its permissions allow.

| Section | Source | Permission |
|---|---|---|
| Sales today, 14-day net sales chart (test payments flagged) | Paid orders and refunds in Postgres | `reports.sales` |
| Orders to send out, awaiting payment, latest orders | Orders | `orders.read` |
| Low stock | Inventory | `inventory.read` |
| New quotations, latest quotations | Quotations | `quotations.read` |
| Unanswered conversations and contact messages | Messages | `messages.read` |
| Attendance today by status, pending corrections | Attendance | `attendance.read` |
| Pending leave | Leave requests | `leave.read` |
| Feedback to moderate | Testimonials | `testimonials.moderate` |
| System status | `/v1/health` | `admin.access` |

Reports: sales (gross, refunds, net, average order, delivery fees, best sellers, by delivery area; CSV and Excel) and
attendance (per employee; table, CSV, XLSX). Customers list with paid-order totals and quotations.

## Website traffic analytics: not collected yet

The site does not record page views, unique visitors, traffic sources, devices, countries, product views, add-to-cart
or checkout-start events. The dashboard therefore shows none of them. Options, in order of fit:

1. **Matomo (self-hosted or Matomo Cloud)**: traffic, sources, devices, regions, goals and funnels; can run without
   cookies (no consent banner needed in cookieless mode). Add its script to `apps/web` only, extend the website CSP, and
   read its Reporting API from the admin.
2. **First-party events**: a small `POST /v1/events` endpoint (page view, product view, add to cart, checkout start)
   storing daily aggregates with a day-rotated hash instead of IP addresses; charts in the admin. Fits the business
   funnel exactly, but needs building.
3. **Microsoft Clarity** for heatmaps and session replay: needs a consent banner and masking of every form; not
   recommended for checkout, account or employee pages.

Whatever is chosen: never on the admin or employee portals, never on form contents, passwords, payment fields or
employee data.
