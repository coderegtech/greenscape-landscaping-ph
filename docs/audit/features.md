# Feature Inventory & Matrix

Legend — **Status today**: ✅ verified on the live public site · 🔎 inferred from publicly served admin code (unverified) · ❌ does not exist.
**Rebuild**: ⬆ keep & improve · ➕ new · ✂ drop.

## Public website

| Feature | Today | Evidence | Rebuild |
|---|---|---|---|
| Home: hero slider (5 slides, dots), headline "Green today, greener tomorrow." | ✅ | crawl, `settings/hero` | ⬆ CMS-driven, LCP-optimized first slide |
| Service cards ×4 with stat badges (50+ Projects, 200+ Products, 100+ Installations, 150+ Clients) | ✅ | home | ⬆ animated stats |
| Service pages: Garden Design, Garden Essential, Landscaping, Garden Maintenance — banner + alternating image/text "Step 1–4" process. Landscaping page states fees: free site visit in-city, from ₱3,000 within 60 km; design fee from ₱15,000 (residential ≤ 150 sqm); installation from ₱1,560/sqm | ✅ | screenshots | ⬆ (slug `garden-essentials`, 301 from old); fees become structured CMS fields feeding the quote form |
| Featured projects (4, alternating image/text, image counter "1/4") | ✅ | home | ⬆ |
| Project category pages: Residential Garden, Commercial Landscaping, Indoor Landscaping, Landscape Rehabilitation | ✅ | routes | ⬆ `/projects?category=` + project detail pages ➕ |
| Products catalog: tabs Plants / Soil & Fertilizers / Hardscape / Tools / Accessories; plant sub-filter (Trees, Shrubs, Grass, Palms & Cycads, Vines & Climbers, Ferns, Indoor & Shade, Water & Wetland); search; "View More" paging; skeleton loading | ✅ | `/pages/services/products/` | ⬆ server-side search/filter, URL state |
| Product detail: scientific name, sizes, watering, description, care instructions, share (FB/Twitter/LinkedIn/copy) | ✅ | `product-detail?id=` | ⬆ + variants, price, stock, add to cart |
| Product price shown | ❌ on public pages (field exists in admin) | product detail text | ➕ |
| Product likes (heart, Google sign-in) | ✅ | product cards | ⬆ → wishlist for signed-in customers |
| Home product tabs: New / Featured / Best Sellers | ✅ | home | ⬆ |
| Gallery grid + "View All Gallery" | ✅ | home, `/pages/gallery.html` | ⬆ lightbox, categories |
| Stories (articles) list + detail `story.html?id=`; author, date, view count, YouTube embeds | ✅ | routes | ⬆ slugs, rich text JSON |
| Testimonials list + "Share Your Experience" (Google sign-in, admin approval) | ✅ | home, `/pages/testimonials.html`, `/pages/contact/client-feedback.html` | ⬆ moderation in CMS |
| Get a Quote — 2-step form (name, phone, email → service, location, preferred date, best time to talk, message) + "Request Submitted!" | ✅ (not submitted during audit) | DOM | ⬆ multi-step with attachments, Postgres, status tracking for customer |
| Contact page, FAQ page | ✅ | routes | ⬆ CMS |
| Delivery Terms, Privacy Notice | ✅ | routes | ⬆ CMS |
| Message Us chat widget (Google sign-in) + mobile bottom nav (Home, Products, Quote, Message, Me) | ✅ | every page | ⬆ keep chat; bottom nav reconsidered in design phase |
| Sign In (Google popup only) / Log Out | ✅ | header | ⬆ Supabase: email+password, verification, reset, Google |
| Customer account ("Me") | ✅ minimal (sign-in state) | bottom nav | ➕ profile, addresses, orders, quotes, wishlist |
| Social links: Facebook `greenscapepalawan`, Instagram `greenscape.palawan` | ✅ | footer | ⬆ |
| Contact info: Tian Suy Go, San Jose, Puerto Princesa; 0917 844 3330; greenscapepalawan@gmail.com | ✅ | footer | ⬆ from `siteConfig` |
| GA4 `G-N27FXT3Z26` | ✅ | network | ⬆ keep, consent-aware |
| Custom visitor counter (Firestore) | ✅ | `visitor-tracker.js` | ✂ replaced by GA4 + server analytics |
| Cache-buster script (forces reload on version bump) | ✅ | `cache-buster.js` | ✂ replaced by hashed assets |
| Launch countdown script | ✅ (script loaded) | `launch-countdown.js` | ✂ unless still wanted |
| sitemap.xml | ❌ (404, though robots.txt references it) | curl | ➕ generated |
| Cart, checkout, online payment, orders | ❌ | 404s, no UI | ➕ |
| Multilingual | ❌ | — | ➕ optional (en / fil) |

## Admin / back office

| Feature | Today | Rebuild |
|---|---|---|
| Admin login (Google) + email allow-list | 🔎 | ⬆ Supabase + server RBAC, 8 roles, MFA for admins |
| Dashboard: visit stats, chart, recent messages/quotes, changelog, notes | 🔎 | ⬆ sales, quotes funnel, low stock, attendance today |
| Quotations inbox: statuses pending/contacted/completed, delete, email notification recipients | 🔎 | ⬆ NEW→CONTACTED→SITE_VISIT→QUOTED→WON/LOST, assignment, notes, attachments |
| Messages inbox | 🔎 | ⬆ |
| Products CRUD with images | 🔎 | ⬆ variants/SKUs, inventory, CSV import/export |
| Projects, Gallery, Stories, Services, Hero, Testimonials CRUD | 🔎 | ⬆ unified CMS: drafts, revisions, schedule, preview, SEO, JSON import/export |
| Settings: admins, notifications, cache version | 🔎 | ⬆ users & roles, site config; cache handled automatically |
| Employees: profiles, designations, status | 🔎 | ⬆ + departments, employee numbers, manager |
| Work schedule (morning/afternoon blocks, flexible) | 🔎 | ⬆ schedule templates, split + overnight shifts |
| Time records (4 punches/day, photos, hours calc, batch delete) | 🔎 | ⬆ clock-in/out, late/undertime/OT, corrections with approval, audit trail; photos optional + consented |
| Leave requests (approve paid/unpaid, reject) | 🔎 | ⬆ leave types, balances, calendar, history |
| Announcements (priority, expiry), employee notes | 🔎 | ⬆ |
| Salary details, default deductions (daily rate, SSS, PhilHealth, Pag-IBIG, allowances) | 🔎 | ✂ **payroll is out of scope** |
| Employee clock-in UI | ❓ not found | ➕ employee portal in `web` (`/staff`) |
| Inventory, orders, payments, refunds, customers | ❌ | ➕ |
| Reports & CSV/XLSX exports | ❌ | ➕ attendance + sales reports |
| Audit log | ❌ | ➕ |
| Media library | ❌ (per-module uploads) | ➕ |
