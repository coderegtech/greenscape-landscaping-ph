# UI Components & UX Assessment (current site)

Sources: crawl screenshots in `screenshots/`, rendered DOM, `/assets/css/styles.css` (75 KB, single file).

## Design tokens in use today
| Token | Value | Notes |
|---|---|---|
| Brand green | `#163d08` (47 uses) | header CTA, active tabs, headings accents |
| Accent green | `#2d5a27` (`--accent-color`) | |
| Text | `#1a1a1a` (`--primary-color`), greys `#333 #555 #666 #999` | many ad-hoc greys, no scale |
| Surfaces | `#fff`, `#f5f5f5`, `#f8f9fa`, `#f0f0f0` | |
| Borders | `#ddd`, `#e0e0e0`, `#e5e5e5` | |
| Display font | Playfair Display 400–700 (Google Fonts) | headings |
| Body font | Helvetica/Arial (43 declarations) | system fallback, no webfont |
| Icons | Font Awesome 6.4 (full CSS from cdnjs, ~100 KB+) | |
| Breakpoints | 380, 576, 768, 769, 992, 1024, 1200 (max-width, desktop-first) | inconsistent set |
| CSS variables | 5 only | most values hard-coded |

## Component inventory

| Component | Where | Notes / issues |
|---|---|---|
| Header (logo, dropdown nav: About us ▾, Services ▾, Projects ▾, Contact us ▾, "Get a Quote" button, Sign In) | all pages | Hover dropdowns; keyboard access to be checked (see accessibility.md) |
| Mobile header (logo, Sign In, hamburger) | ≤ 768 px | |
| Mobile bottom tab bar (Home, Products, Quote, Message, Me) | ≤ 768 px | App-like; duplicates header nav |
| Hero slider (full-bleed photo, serif headline, subline, 5 dots, auto-advance) | home | Content arrives after Firestore loads → late LCP |
| Service card (photo, stat badge, title, blurb, ✓ list, "View more →") | home, services | 4-up desktop, 2-up mobile |
| Project feature row (image with category tag + "1/4" counter, title, location/date meta, excerpt, "View project details →") | home, projects | alternating left/right |
| Product card (image, heart/like, thumbnails strip, name, scientific name) | home, catalog | no price, no CTA; click navigates via JS (not a link → no open-in-new-tab, not crawlable) |
| Product filter (category pill tabs, plant sub-category select, search input, "View More") | catalog | state not in URL except `?category=` |
| Skeleton grid | catalog | already present |
| Product detail (breadcrumb "Back to Products", category label, name, scientific name, share bar, sizes, watering, description, care instructions) | product-detail | |
| Gallery masonry grid | home, gallery | |
| Story card (thumbnail, title, author, date, views, excerpt, "Read More →") | home, stories | |
| Testimonial card (stars, quote, avatar, name) + "Share Your Experience" modal | home, testimonials, client-feedback | requires Google sign-in |
| 2-step quote form with progress + success state ("Request Submitted!") | home, get-a-quote | native `alert()` used elsewhere for feedback |
| Chat widget ("Message Us", "Sign in to send messages", welcome message) | all pages | |
| Sign-in modal ("Sign In with Google") | all pages | |
| Footer (about blurb, Services, Help, Contact, socials, version string `v1.0.10`) | all pages | rendered by `shared-footer.js` (client-side) |
| Page loader | `loading.js` | full-page loader on navigation |

## UX assessment

**Works well — keep the intent**
- Strong real photography of actual projects; it's the brand's best asset.
- Clear service taxonomy (4 services) and project categories.
- Quote form is short and split into two steps.
- Mobile bottom nav makes Quote and Message one tap away.

**Problems**
1. **Empty-shell rendering.** Nearly all content (hero, services, products, stories, footer) is injected by JS after Firebase loads. Users see skeletons/blank areas first; search engines and link previews see little.
2. **Fragile URLs.** Relative script paths break when a page is opened without its trailing slash: `/pages/services/products` loads `/pages/services/products.js` → 404 → catalog stays on skeletons forever (verified 2026-11-09). Duplicate URL forms (`x.html`, `x`, `x/index.html`) all serve the same page with no canonical.
3. **Product cards aren't links**, so no middle-click, no share, no crawlable product URLs from the catalog.
4. **No prices or purchase path** — catalog is a brochure; users must message or request a quote.
5. **Every interaction that writes needs Google sign-in** (feedback, like, chat) — friction for users without Google, no email alternative.
6. **Visual system is ad-hoc**: ~15 greys, 7 breakpoints, Helvetica body text, Font Awesome full bundle; looks like a template rather than a premium landscaping brand.
7. Feedback via native `alert()`/`confirm()` (admin and parts of public).
8. Two navigation systems on mobile (hamburger + bottom bar) with overlapping items.
9. **Quote form's service list doesn't match the services the site sells**: options are Landscaping Design, Garden Maintenance, Plant Consultation, Delivery & Installation, Other — vs. the four service pages (Garden Design, Garden Essentials, Landscaping, Garden Maintenance).
10. `/pages/testimonials.html` requests `/assets/css/style.css` → 404 (the real file is `styles.css`): header/nav render unstyled, mobile overflows, and the footer shows the literal text `[object Promise]`.
11. `/pages/` serves a duplicate of the home page; share buttons point to `/share/story?id=` pages that redirect with JavaScript.

Rebuild implications are captured in `docs/implementation-plan.md` §4.
