# White botanical redesign

Branch `redesign/white-botanical`, cut from Phase 12 (`07c3f43`). It changes the public website's look and its photo layouts. The CMS, shop, checkout, accounts, attendance, admin and API keep their behaviour; the data comes from the same CMS documents and Supabase Storage images.

Screenshots of home, gallery, projects, stories, shop and services at 390, 768, 1024 and 1440 px are in `docs/screenshots/redesign/` (`node scripts/screenshots.mjs <dir> [base] [paths] [widths]` regenerates them).

## Skills used
- **animate** (installed): its rules shaped every motion choice. CSS before JavaScript; `transform`/`opacity` (plus `clip-path`) only; the existing `--ease-out` token; hover motion only for fine pointers; a reduced-motion variant shipped with each animation; no `transition: all`.
- **No `frontend-design` skill is installed.** **Hallmark** was not used: its own rules exclude redesigning an existing design unless it is asked for by name. This redesign replaces the earlier Hallmark-dealt dark theme (the stamp at the top of `theme.css` now says so).

## Design system (`packages/ui/src/styles/theme.css`)
| Token | Value | Use |
|---|---|---|
| `--gs-paper` | `#FFFFFF` | page ground |
| `--gs-paper-2` | `#F8FAF7` | secondary background, footer, testimonial cards |
| `--gs-paper-3` | `#EEF3EC` | photo frames while loading |
| `--gs-ink` / `--gs-ink-2` | `#202820` / `#3A453C` | headings / body (15.2:1 and 10:1 on white) |
| `--gs-muted` | `#6B756D` | secondary text (4.8:1 on white, 4.6:1 on `#F8FAF7`) |
| `--gs-rule` | `#E5EBE3` | borders |
| `--gs-signal` | `#315C3B` botanical green | buttons, links on hover, focus ring (7.7:1) |
| `--gs-sage` / `--gs-lime` | `#8CA68A` / `#C9E64A` | accents only: link underlines, quote marks, badges (ink on lime 10.7:1), selection, reading progress. **Never text on white** (2.7:1 / 1.4:1) |

Prata (serif) headings over Manrope (sans) body are unchanged. Radii: 20px photos and cards, 12px controls, pill buttons. There are two soft shadow tokens, and the bands are `#EEF3EA` (sage tint) and `#F8FAF7`.

## Components
- **Header** (`site-header.tsx`): sticky, white at 85% with a backdrop blur. A hairline and soft shadow appear after 64px of scroll (CSS scroll timeline, no listener). Nav underlines grow from the left on hover and mark the current page. The quote button is a filled green pill. Dropdowns are rounded and lifted; the mobile sheet is unchanged (lazy-loaded, accessible).
- **Hero** (`page-hero.tsx`): an editorial split. The headline, sentence and actions sit on the left and rise in turn (CSS animation from the first paint, never waiting for JavaScript). The photo is on the right in a 28px-rounded frame with no overlay; it opens upward and has gentle scroll parallax. A sage outline square and a slow-drifting lime glow are the botanical accents. On phones it stacks.
- **Masonry** (`apps/web/components/gallery/`):
  - `MasonryGrid` / `MasonryItem`: Pinterest-style layout in **pure CSS Grid**. Rows are 1/40 of a column wide, so a card's row span (`round(40 × h/w) + 3`) is computed on the server from the CMS image's stored width and height.
    - The browser's ordinary grid placement then fills the column that frees up first. The DOM order (keyboard and screen readers) is the data order.
    - There is no measuring, no layout JavaScript and no layout shift: each frame reserves its exact aspect ratio before the image loads.
    - Columns follow the container width: 2 on phones, 3 from about 768px, 4 from about 1024px, up to 5 for very wide galleries.
  - `MasonryCard`: the photo at its natural proportions in a rounded frame that shimmers until the image paints.
    - On hover, a gradient caption rises in (title, then category and place) with an arrow or expand chip, and the photo zooms gently.
    - Captions are always shown on touch screens and to keyboard focus.
    - Link cards name themselves "Title, category, place"; lightbox cards name themselves "Open photo n of N: …" followed by the caption.
    - Selected cards get the in-frame parallax.
  - `GalleryLightbox`: a client wrapper that opens the existing lazy viewer by event delegation, so the cards stay server components. Arrow keys, Previous/Next, **swipe** (touch and pen), Escape, and focus returns to the photo that opened it.
  - `GalleryFilters`: category and place filters as plain links (work without JavaScript, shareable).
  - `MasonryPhotos`: masonry plus lightbox for project pages and CMS `photos` sections.
- **Service cards**: white, bordered and rounded with a soft shadow; they rise 2px on hover, the photo zooms slightly and a "View service →" nudges.
- **Testimonials**: rounded off-white cards with a large sage quote mark.
- **Product cards**: an aligned grid, kept on purpose so prices and names line up. Photos are rounded and shimmer while loading, and the badges are lime pills.

## Where masonry is used (and isn't)
| Page | Layout |
|---|---|
| `/projects` (the portfolio) | Masonry of every project's cover, linking to the project; category and place filters |
| `/gallery` (project gallery) | All 80 photos: 72 project photos plus 8 curated gallery photos, with project title, category and place. Category and place filters, lightbox, and **24 at a time** with a "Show more photographs" link (server pagination via `?show=`, so the first request never loads the whole library and earlier photos keep their place) |
| Home, "Gardens we have built" | Split feature cards (`ProjectFeature` in `cards.tsx`): the photo on one side with a category pill and a photo count, alternating sides. The other side has the title, place and completion date with icons, a 4-line excerpt and "View project details →". The whole card is one link; it lifts on hover and stacks on phones. Featured projects only (CMS `limit`). Shown on owner request, modelled on the original site's featured-projects layout |
| Home, "From our sites" | Masonry with lightbox (`MasonryPhotos`): the curated gallery photos at natural proportions (changed from a sideways film strip on owner request) |
| Project pages, CMS `photos` sections | `MasonryPhotos` with lightbox |
| `/stories` | Editorial: the newest story as a large lead, the rest in an aligned grid. Titles stay easy to scan, so it is not masonry |
| `/shop` | Aligned product grid (comparison and buying) |

## Motion
- **Scroll reveals**: cards fade and rise 12px as they enter. This is the existing CSS scroll-driven reveal (`animation-timeline: view()`), staggered by column, with **zero JavaScript**.
  - Not Motion or IntersectionObserver as the brief suggested: Phase 12 measured that JavaScript-gated reveals delay LCP.
  - The animation is tied to scroll position, so it plays backwards if you scroll up past the very start of a card's entry. This is the trade-off for no JavaScript.
- **Parallax**: CSS scroll-driven translate of ±6% inside a clipped frame that is 13% larger, so the edges never show. It applies to the hero and to every 3rd–5th masonry card.
- **Smooth scrolling**: CSS `scroll-behavior: smooth`. `data-scroll-behavior="smooth"` lets Next.js turn it off during route changes. Lenis and GSAP were not added; nothing here needs a custom scroll engine, and the brief rules out scroll hijacking.
- **Page transitions**: `app/template.tsx` re-mounts on navigation, and each page fades up 6px over 320ms (CSS).
- **Header shadow, reading progress**: on story pages a lime hairline fills as you read. Both use CSS scroll timelines; the progress bar is hidden where those aren't supported.
- **Loading**: photo frames shimmer (CSS) until the image paints over them, and blur placeholders come from the CMS. The lightbox and mobile menu load on first use. Buttons already had loading spinners.
- **Not added: route-level loading skeletons.** A Next.js `loading.tsx` or streaming fallback leaves visitors without JavaScript stuck on the skeleton (found and removed in Phase 5).
- **Reduced motion**: reveals, parallax, glow drift and shimmer are off; entrances are instant; content is always visible (e2e-tested).

## Verification (2026-11-10)
- **New e2e `tests/e2e/redesign.spec.ts`: 25 passed, 1 skipped** (the touch-caption test runs on the mobile project only). It covers:
  - White pages and a sticky header.
  - Masonry frames rendered at their stored ratio (within 3%), heights that vary, and **no overlapping cards**.
  - Column counts of 2/3/4/4 at 390/768/1024/1440, no horizontal overflow (including clipped overflow on the home page), and keyboard order following the data.
  - Project cards' names and links; lightbox open/arrows/caption/Escape/focus return; swipe; category and place filters; "Show more" keeping earlier photos in place.
  - Captions visible on touch; reduced motion at rest.
- **Regression**: the full e2e suite had 158 passed, 26 skipped and 2 failed under 4-worker load (a CMS create-page redirect and one permission-matrix role timing out); both passed when re-run alone. After the last fixes, public-site, design-system and CSP specs had 82 passed and 8 skipped. Typecheck, lint and unit tests (46) pass.
- **Accessibility fixes found by the axe runs**:
  - Lightbox cards' names now contain their visible caption (WCAG 2.5.3).
  - The tabs list and table rows used the muted *text* colour as a background; now the off-white surface.
  - A card's caption no longer runs together ("San VicenteSustainable…").
  - The cards' screen-reader text no longer escapes the film strip (it stretched the page's layout overflow).
- **Lighthouse** (mobile, simulated, median of 3, `docs/lighthouse/redesign.json`): home **83** (Phase 12: 79), projects **85** (81), shop 87, stories list 80, gallery 76 (new: 24 photos on the first screen). Accessibility, best practices and SEO are 100 on all; CLS is 0.

## Known limitations
- A tap on a gallery photo before the page has hydrated does nothing; the lightbox is a client component, as it was before the redesign. The e2e test retries until hydration.
- Desktop captions appear on hover or focus, as the brief asks; the title is always in the card's accessible name.
- `/gallery` is rendered per request (filters and `?show=`); its data calls are cached. With 80 photos the first view is the heaviest public page (Lighthouse 76). Pre-sized images from a CDN would help most.
- In tests, the image optimiser's first AVIF encodes of 2000px photos are slow when many tests load galleries in parallel.

## Botanical home hero, forest footer, shop-only cart (2026-11-11)
- **Hero** (`apps/web/components/hero/`): the headline rises word by word, the sentence and actions follow, the CMS's portrait photo opens in a tall arch, and a second CMS photo sits in an overlapping circle. 14 drawn decorations (`botanicals.tsx`: tropical and broad leaves, fern, five-petal flowers in pink, lavender and yellow, a leafy branch, a hanging vine, soft shapes) sit on three depth layers.
  - **Breeze**: each decoration floats, sways and breathes on its own period and deterministic delay (CSS keyframes).
  - **Scroll**: layers drift up at different speeds and the text fades and lifts (CSS scroll timelines; native scrolling, no pinning). Parallax distances shrink on tablets and phones.
  - **Pointer**: decorations lean a few pixels towards the cursor and the two actions are gently magnetic (`hero-pointer.tsx`, fine pointers only, rAF-batched, cleaned up on unmount).
  - **Transition**: two foreground leaves reach ≤ 5rem into the next section, clear of its heading.
  - **Phones**: fewer decorations; no pointer effects on touch. Reduced motion: everything still.
  - **Why not GSAP**: the same effects need no new dependency and run off the main thread, without the hydration cost that Phase 12 removed.
- **Footer**: the "forest" band (`.band-forest`, #1E3A28): cream text 11.8:1, sage labels 6.6:1, lime focus and hover; a leaf silhouette; pill social links. The band re-declares the `--color-*` variables, because Tailwind computes them once at `:root`.
- **Cart icon**: shown only on `/shop`, `/cart`, `/checkout` and `/orders` (and the count is only requested there).
- **Tests**: `tests/e2e/hero.spec.ts`, 16 passed (content and actions; decorations hidden from assistive tech; breeze, scroll drift and text fade; pointer lean on desktop only; reduced motion still; no overflow and actions on the first screen at 390/768/1440; forest footer; cart only in the shop). Screenshots of the top, middle and bottom of the hero: `docs/screenshots/hero/`.
