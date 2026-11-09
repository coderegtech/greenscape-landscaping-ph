# Migration Risks

Audit date: 2026-11-09. Severity: **H** high, **M** medium, **L** low.

| # | Risk | Sev | Evidence | Mitigation |
|---|---|---|---|---|
| R1 | **Admin authorization is client-side.** `/admin/js/auth-guard.js` reads `settings/adminAccess.emails` from Firestore in the browser and falls back to a hard-coded email. Real protection depends entirely on Firestore Security Rules, which were **not** inspected (no access, and probing them on production would be unauthorized). | H | Public file `/admin/js/auth-guard.js` | Rebuild enforces RBAC in Express. Owner should review current Firestore/Storage rules now, independent of the rebuild. |
| R2 | **Payroll and government-ID data in `employees`**: `dailyRate`, `foodAllowance`, `uniformBond`, `sss`, `philhealth`, `pagibig`. Out of scope for the rebuild and sensitive personal information under RA 10173. | H | Field names in public `/admin/employees/employees.js` | Exclude from migration (D5). Keep in the offline archive under owner control only. |
| R3 | **Clock-in/out photos** (`timeInPhoto`, `timeOutPhoto`) are biometric-adjacent personal data. | H | `employees.js` | Feature off by default in rebuild; migrate photos only on explicit decision (D6), with retention limit. |
| R4 | **No source-data access yet.** Products, quotations, employees, time logs can't be counted or validated. | H | — | D3: read-only export. Until then only public content can be migrated (from rendered pages). |
| R5 | **Firebase Auth is Google-only** today; rebuild adds email/password. Existing users must re-link. Firebase UIDs referenced by `conversations`, product `likes`, testimonials. | M | `signInWithPopup(GoogleAuthProvider)` in public JS | Map by email; Google OAuth in Supabase with same email auto-links. |
| R6 | **Product data is unstructured for e-commerce**: single `price`/`originalPrice`, `sizes`/`colors` as free lists, `payment` as free text, no stock or SKU. | M | admin `products.js` fields | Variant generation rules + manual review screen; inventory counts needed from the business before shop launch. |
| R7 | **Story/product detail URLs use Firestore ids** (`story.html?id=…`). Query-string URLs need id→slug lookup redirects or SEO equity is lost. | M | crawl `routes.md` | Keep `legacy.firestoreId`; middleware redirect `story.html?id=` → `/stories/{slug}`. |
| R8 | **`sitemap.xml` returns HTTP 404** while `robots.txt` points to it — search engines currently have no sitemap. | M | `curl /sitemap.xml` | New site generates `sitemap.xml` from CMS + catalog. Submit in Search Console after cutover. |
| R9 | **Content is client-rendered from Firestore**, so the HTML crawlers see is mostly empty shells; current SEO relies on JS rendering. | M | network trace: content via Firestore `Listen/channel` after load | SSR/ISR in rebuild should improve indexing; expect ranking churn during cutover — keep URLs via 301s. |
| R10 | **Visitor tracker writes to Firestore from every homepage visit** (`analytics/visitors`, `analytics/chartData`) — unauthenticated client writes. Historical chart data would be lost. | L | public `visitor-tracker.js` | Export to archive; GA4 (already present, `G-N27FXT3Z26`) is the continuity source. |
| R11 | **Hosting cutover**: Firebase Hosting has `max-age=3600` HTML caching; DNS and CDN caches may serve old site up to an hour+. | L | response headers | Lower TTLs 48 h before cutover. |
| R12 | **No security headers** besides HSTS (no CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy). | L | response headers | Helmet + Next.js headers in rebuild. |
| R13 | **Embedded images from external hosts** (Google avatars, possibly Facebook CDN) may expire. | L | testimonials `userPhoto` | Don't depend on them; initials avatar fallback. |
| R14 | **Payments are new.** PH-local methods (GCash, Maya) matter more than cards for this audience; Stripe test is a dev stand-in only. | M | — | Provider-independent interface; choose PH provider (D8) before launch. |

## What was deliberately not done during the audit
- No form was submitted (quote, feedback, contact). Their fields were recorded from the DOM only.
- No login was attempted on the public site or `/admin`.
- No Firestore/Storage reads or writes were made directly; only the requests the public pages make on their own were observed. The site's visitor tracker and Google Analytics were blocked in the scripted crawl so the audit didn't add fake visits.
- **Side effect that did happen:** each story page increments its own view counter in Firestore on load (an inline script, not the visitor tracker). The audit crawls loaded the 7 story pages about 4 times each (2 runs × desktop + mobile), so their view counts are inflated by roughly 4. The first manual Playwright check of the home page (before blocking was set up) also registered one homepage visit in the site's own visitor counter. `crawl.mjs` now also blocks Firestore `Write/channel`, so re-runs don't do this.
- Admin feature descriptions come from the **publicly served** admin HTML/JS (`/admin/*`) and are labeled *inferred, unverified*.
