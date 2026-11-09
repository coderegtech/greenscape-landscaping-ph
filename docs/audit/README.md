# Audit Summary — greenscapelandscapingph.com

Audited 2026-11-09 with Playwright (Chromium), axe-core 4.10 and Lighthouse 12. **31 unique public pages** crawled at 1440 px and 390 px (62 screenshots), plus static reading of the publicly served `/admin/*` code. No forms submitted, no logins attempted. The one side effect (story view counters) is disclosed in `migration-risks.md`.

## The 12 requested outputs

| # | Output | Where |
|---|---|---|
| 1 | Discovered page inventory | [`routes.md`](routes.md) (31 pages + aliases, JS-only routes, external links, headings) |
| 2 | Existing functionality report | [`features.md`](features.md), [`admin-workflows.md`](admin-workflows.md) |
| 3 | Current UI/UX assessment | [`ui-components.md`](ui-components.md), [`screenshots/`](screenshots/) |
| 4 | Performance & accessibility baseline | [`performance.md`](performance.md), [`accessibility.md`](accessibility.md) |
| 5 | Existing vs proposed features | [`features.md`](features.md) (matrix) |
| 6 | Detailed architecture | [`../architecture.md`](../architecture.md) |
| 7 | PostgreSQL + MongoDB schemas | [`../database-schema.md`](../database-schema.md) |
| 8 | Supabase auth & storage architecture | [`../architecture.md`](../architecture.md) §4–5 |
| 9 | Redis caching strategy | [`../architecture.md`](../architecture.md) §6 |
| 10 | Temporary payment strategy | [`../architecture.md`](../architecture.md) §7 |
| 11 | UI/UX skill selection & animation plan | [`../implementation-plan.md`](../implementation-plan.md) §3–4 |
| 12 | Phased roadmap | [`../implementation-plan.md`](../implementation-plan.md) §2 |
| — | Network/API + forms | [`api-endpoints.md`](api-endpoints.md) |
| — | Migration risks | [`migration-risks.md`](migration-risks.md), [`../migration-plan.md`](../migration-plan.md) |

## What the site is
Static HTML + vanilla JS on Firebase Hosting; all content loaded in the browser from Cloud Firestore (`greenscape-palawan`) and Firebase Storage; Google-only sign-in; an `/admin` area with 11 modules (content, quotations, messages, products, employees with time logs and leave). **No first-party API, no cart or checkout, no prices shown publicly, no roles.**

## Headline findings

**Performance** (Lighthouse mobile): Performance 57–84, home **59**. Home page weighs **33 MB** and its mobile LCP is **26 s**; gallery mobile LCP is **60 s**. Cause: original-resolution phone photos (3,000–5,700 px) served to 288–550 px slots, no responsive images, content rendered only after Firestore responds. Every page fails "properly size images", "next-gen formats" and "render-blocking resources".

**Accessibility** (Lighthouse mobile 70–79, axe on 31 pages): icon-only social/nav links without names (29 pages), unnamed slider/nav buttons, contrast failures (product scientific names, story meta), unlabeled plant-type `<select>`, heading order, small touch targets, untitled map iframe. Testimonials page overflows horizontally on mobile.

**SEO / Best practices**: Lighthouse scores 100/100, but `sitemap.xml` is 404 (robots.txt points to it), content is client-rendered, duplicate URL forms (`x`, `x.html`, `x/`, `/pages/` = home) have no canonical, and product/story URLs are Firestore IDs.

**Bugs verified**
1. `/pages/services/products` (no trailing slash) requests `/pages/services/products.js` → 404 → catalog stuck on skeletons ([screenshot](screenshots/bug_products_no_trailing_slash--mobile.png)).
2. `/pages/testimonials.html` requests `/assets/css/style.css` (real file: `styles.css`) → 404 → header and nav render unstyled (oversized logo, raw bullet list), page overflows horizontally on mobile, and the footer prints the literal text `[object Promise]` ([screenshot](screenshots/pages_testimonials_html--mobile.png)).
3. The quote form's service options don't match the four services the site offers.

**Security / privacy (high)**
- Admin access is decided in the browser from an email list in Firestore; real protection rests on Firestore rules, which could not be inspected.
- The employee module stores **payroll and government-ID fields** (daily rate, SSS, PhilHealth, Pag-IBIG, allowances) and **clock-in photos**. These are out of scope for the rebuild and flagged for an explicit decision (D5, D6).

## Blocking decisions
See [`../implementation-plan.md`](../implementation-plan.md) §1 (D1–D9): Supabase project, Stripe test account, read-only Firestore export, admin walkthrough, payroll-field exclusion, clock-in photos, delivery fees, PH payment provider, Git remote.
