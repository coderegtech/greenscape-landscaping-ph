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

## Security headers
CSP and headers were added this phase (`docs/security.md` → Content-Security-Policy) and cost nothing measurable: the policy is a static header on the website.
