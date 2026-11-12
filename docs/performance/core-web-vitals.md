# Core Web Vitals and Lighthouse (Phase 12)

How it's measured: `node scripts/lighthouse.mjs <label> [baseUrl] [pages]` runs mobile Lighthouse with simulated throttling (slow 4G, 4× CPU) against a production build, visits each page once to warm the image optimiser, then takes the **median of 3 runs** (`LH_RUNS`). Single runs on this machine swing by 10–15 points. Results are in `docs/lighthouse/*.json`, with each run's spread, the LCP element and its phase breakdown.

## Results: baseline vs final (local production build, 2026-11-10)

| Page | Baseline perf (single run) | **Final perf (median, runs)** | Final LCP | Final TBT | A11y | Best pr. | SEO |
|---|---|---|---|---|---|---|---|
| `/` | 87 | **79** (77/79/86) | 3.6 s | 450 ms | 100 | 100 | 100 |
| `/services/garden-maintenance` | 91 | **93** (92/93/96) | 3.1 s | 110 ms | 100 | 100 | 100 |
| `/projects` | 78 | **81** (81/81/87) | 3.7 s | 360 ms | 100 | 100 | 100 |
| `/projects/sustainable-landscaping-in-action` | 79 | **92** (76/92/93) | 2.8 s | 220 ms | 100 | 100 | 100 |
| `/stories/a-new-digital-home…` | 96 | **92** (86/92/93) | 2.7 s | 230 ms | 100 | 100 | 100 |
| `/shop` | 85 | **89** (87/89/91) | 3.3 s | 210 ms | 100 | 100 | 100 |
| `/shop/golden-pothos` | 91 | **92** (91/92/92) | 2.7 s | 220 ms | 100 | 100 | 100 |
| `/quote` | 90 | **92** (91/92/92) | 2.2 s | 300 ms | 100 | 100 | 100 |
| `/contact` | 90 | **90** (88/90/93) | 2.2 s | 370 ms | 100 | 100 | 100 |

The baseline column is single runs, so it isn't directly comparable to the medians. The baseline was also 96 on best practices everywhere (missing favicon) and failed heading order on `/projects` and `/shop`; both are fixed. CLS is 0 on every page.

**Targets.** Accessibility and SEO ≥ 95: met everywhere (100). Performance ≥ 90: met on 6 of 9 pages. **Not met: home (79), project list (81), shop (89).** CLS ≤ 0.1: met. LCP ≤ 2.5 s under simulated slow 4G: met on quote and contact (2.2 s); 2.7–3.7 s on the photo-led pages. INP isn't measurable in a lab run; TBT, its lab proxy, is 110–450 ms.

## What changed
- **Reveals are pure CSS** (scroll-driven `animation-timeline: view()`), with no JavaScript. Content no longer waits for hydration to become visible, which was the biggest LCP render-delay cause.
- **No motion library on public pages.** Counter uses `requestAnimationFrame`; the cart-count swap is a CSS keyframe. That's 23 KB gzipped off every page.
- **Dialogs load on first use.** The phone menu sheet and the photo lightbox viewer are fetched only when opened (`next/dynamic`, `ssr: false`). Focus return and keyboard behaviour are unchanged (e2e).
- **TooltipProvider** was moved off the public layout (only the design page uses tooltips).
- **Blur placeholders** on every CMS photo (cards, sections, heroes, photo grids), from the MediaRef generated at upload.
- **App icons** (`icon.png`, `apple-icon.png`) for both apps; hidden section headings fix heading order.
- **Zod runs without its `new Function` fast path in the browser.** The CSP has no `unsafe-eval`, and the probe was reported as a violation (best practices 96 → 100 on forms).

## Why home and the project list are still below 90
Lighthouse's simulation counts all main-thread work before the observed LCP into the LCP time. On these pages the work is React hydration: about 830 ms of the 4×-throttled main thread goes to `react-dom` reconciling ~30 `next/image` client components (photo grids, cards). The hero image itself arrives in about 250 ms (TTFB 460 ms + load 30–250 ms); the rest is "render delay". The A/B test showed parallax isn't the cause (`ab-no-parallax.json`).

Options that would close the gap, not done in this phase:
1. Server-render the below-the-fold photo grids as plain `<img srcset>` instead of `next/image` client components. This cuts hydration work in half; it needs an image-URL helper that mirrors the optimiser.
2. Fewer photos on the home page's first load: show 6 gallery photos and lazy-render the rest on scroll.
3. A CDN in front of Next (TTFB 460 ms locally is the Next server rendering ISR pages on a busy laptop; a CDN edge hit is about 50 ms).

## Phase 13 re-check (2026-11-12): two hypotheses tested, neither moved the score

Same script and settings (median of 3, mobile, simulated slow 4G). Files: `docs/lighthouse/phase13-*.json`.

| Build | `/` | `/projects` | `/shop` |
|---|---|---|---|
| Current `main` (`phase13-before`) | 82 (81/82/85) | 79 (74/79/81) | 86 (81/86/87) |
| Option 1: photos as plain server `<img>` via `getImageProps`, no `next/image` client component (`phase13-after`) | 79 (77/79/80) | 81 (75/81/82) | 89 (77/89/90) |
| Decoration animations switched off (`phase13-exp-still`) | 84 (81/84/85) | 79 (78/79/87) | 87 (0/87/87) |

Both changes are within run-to-run noise, so neither was kept. What a full report on `/shop` shows: first contentful
paint 1.1 s, but the LCP element (the plain-text page intro, no image to load) is only recorded at 3–5 s. All of that is
"render delay", and main-thread work before it is spread over framework script evaluation (~1 s, the Next/React runtime
chunk), rendering (~2 s) and style/layout (~1 s) under the 4× CPU slowdown. Photo hydration and the floating decorations
are not the deciding factor any more.

**Recommendation:** stop tuning against a busy laptop's simulated numbers. Measure the deployed staging site (with its
CDN) using PageSpeed Insights and the Chrome UX Report field data. Act on what real visitors see: field LCP and INP at
the 75th percentile, not lab scores. If field LCP on mobile is above 2.5 s, the next things to try are, in order:
serving pages from a CDN edge cache, then trimming the shared client JavaScript (the runtime chunk) with a bundle
analysis.

## Security headers
CSP and headers were added this phase (`docs/security.md` → Content-Security-Policy) and cost nothing measurable: the policy is a static header on the website.
