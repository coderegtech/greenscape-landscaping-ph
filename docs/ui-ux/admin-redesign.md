# Admin console redesign

Before and after screenshots at 390, 768, 1024 and 1440px: `docs/screenshots/portal-redesign/before/` and `after/` (regenerate with `SHOTS=after pnpm exec playwright test tests/e2e/shots --project=desktop`).

## Navigation (`apps/admin/lib/nav.ts`)

Five groups, matching the brief: **Overview** (Dashboard, Analytics, Notifications), **Business** (Orders, Products, Inventory, Customers, Quotations, Messages, Sales report), **Content** (Pages, Services, Projects, Stories, Gallery, Media, Testimonials, FAQs, Site settings), **Workforce** (Employees, Attendance, Work schedules, Leave requests, Attendance report), **Administration** (Users and roles, System monitoring, Settings, Audit logs, the AI assistant pages).

* Only links the person's permissions open are shown (unchanged rule; the permission-matrix e2e test still checks every role).
* "Work schedules" is a new menu entry for the existing `/employees/schedules` page.
* Count badges come from the same overview call as the dashboard (cached per request): orders to send, low stock, new quotes, unanswered messages, corrections, leave, reviews.
* Sign-out moved into the account menu (avatar, top right), which also shows the email and roles.

## Dashboard (`apps/admin/app/(console)/page.tsx`)

Personal greeting, the date and how many items need attention; colourful metric cards; a sales chart; **Waiting for a decision** (leave, corrections, quotes, messages, reviews, unpaid orders, each with its count); **Website traffic** for people with analytics access (new on the dashboard, from the existing analytics API); **Attendance today** as a split bar (on time, late, on leave, not in yet); latest orders; latest quote requests; **Recent content changes** (new: the last five `cms.*` audit entries, for `cms.read`); system status as pills.

API change: `GET /v1/admin/overview` adds a `content` section (id, action, type, record, who, when; never the document body) for `cms.read`.

## Tables and forms

All admin tables use the shared `Table`; in the admin theme it renders as a white card with a header band, row hover and comfortable padding (CSS in `theme.css`, so every list page changed without touching its code). Existing search, filters, sorting, pagination and bulk actions are unchanged. Inputs in the portals are rounded white fields. No form logic changed.

## Sign-in

Split screen with the dark sidebar green and a botanical illustration; the form keeps email + password, show/hide password, "Forgot password?" and the existing MFA step.
