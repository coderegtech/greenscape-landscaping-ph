# Animation System

Motion is a **signal, not decoration**. Every animation answers "what changed?" or "where did that come from?". All of it is `transform`/`opacity` (plus `clip-path` for one image reveal), and all of it turns off under `prefers-reduced-motion: reduce`.

## Tokens (`packages/ui/src/styles/theme.css`)
| Token | Value | Use |
|---|---|---|
| `--dur-micro` | 120 ms | press, tick, colour change |
| `--dur-short` | 220 ms | hover, tooltip, menu, toast, number swap |
| `--dur-long` | 420 ms | drawer, accordion |
| Reveal | 640 ms (mask: 900 ms) | scroll reveals |
| `--stagger-row` / `--stagger-block` | 40 / 80 ms | list rows / blocks; capped at 6 steps (≤ 500 ms) |
| `--ease-out` | `cubic-bezier(0.23, 1, 0.32, 1)` | arrivals (default) |
| `--ease-in` | `cubic-bezier(0.55, 0, 1, 0.45)` | exits |
| `--ease-in-out` | `cubic-bezier(0.77, 0, 0.175, 1)` | toggles |

Never the browser's `ease`, never `transition: all` (lint-enforced), never bounce or overshoot on UI state, never width/height/top/left.

## Primitives (`packages/ui/src/motion/*`)
| Primitive | How | No-JS / reduced motion |
|---|---|---|
| `Reveal kind="rise"` (fade + 12 px) | CSS scroll-driven animation (`animation-timeline: view()`, entry range), zero JS; `index` (`--i`) offsets the range to stagger | Only under `prefers-reduced-motion: no-preference` and `@supports (animation-timeline: view())`; otherwise (and with JS off) content is simply visible |
| `Reveal kind="fade"` | as above, opacity only | same |
| `Reveal kind="mask"` (image) | frame opens upward via `clip-path`, photo settles from 4% zoom | same |
| `Parallax` | CSS scroll-driven animation (`animation-timeline: view()`), ±6% inside a clipped frame, zero JS | static (and where unsupported) |
| `Counter` | `requestAnimationFrame` once in view (IntersectionObserver); server HTML already holds the final number | shows final number |
| Cart count swap | `.gs-swap-in` keyframe (`--dur-short`), re-keyed on each change | instant |
| Button press | `active:scale-[0.98]` at `--dur-micro` | n/a (instant) |
| Loading spinner | `.keep-motion`, appears only after 150 ms so fast actions don't flicker | keeps spinning (it's a status, not decoration) |
| Menus, dialogs, sheets, tooltips | Radix + `tw-animate-css` enter/exit (fade + slight zoom/slide) | instant |

Why reveals are CSS, not Motion: Motion's `initial` state is written into server HTML (`opacity: 0`), which would make content invisible to visitors without JavaScript and to crawlers that don't run it. Phase 12 also removed the IntersectionObserver version: it needed hydration before content showed, which pushed LCP back. Public pages ship no motion library at all (Motion stays in the admin and in client-only widgets).

## Rules of use
- **Never reveal above-the-fold content.** The hero headline, sentence and actions render immediately (they are usually the LCP element).
- **One reveal language per page** (usually `rise`, plus `mask` for photographs). Hero text staggers 0, 1, 2; lists stagger by row. Nothing re-animates on scroll back up.
- **Parallax only on hero/feature photographs**, never on text, never more than one per screen.
- **Counters only for figures the business supplied.**
- **No** scroll hijacking, scroll-jacked carousels, cursor followers, marquees, pulsing dots, auto-rotating sliders, or infinite loops other than loaders.
- **Hover** is one signal: a colour step. **Focus rings never animate.** Tooltips wait 800 ms on hover (provider `delayDuration`), 0 on focus.
- **Route changes:** public pages don't use route-level `loading.tsx` (it makes Next stream a skeleton and swap content with JS, which leaves no-JS visitors on the skeleton). Skeletons are for client-side data views (shop filtering, admin tables) where they hold the final size.

## Hallmark waivers (recorded in the theme stamp)
The dealt theme (*Hedgerow*) keeps motion still, and Hallmark's craft rules forbid parallax and allow one reveal per page. The client brief explicitly asks for scroll reveals, staggered cards, parallax, image masking and animated statistics, so those are provided as the restrained primitives above. Waivers: `craft§5-parallax`, `craft§5-one-reveal`, `theme-motion-still`.

## Tests
`tests/e2e/design-system.spec.ts`: reveals are visible with JS off; reduced motion shows end states without scrolling; below-the-fold reveals start hidden and appear when scrolled to; axe runs on end states.

## White botanical redesign (2026-11)
New CSS-only primitives in `theme.css`, all off or instant under reduced motion:
- `.hero-in` (staggered rise with `--i`) and `.hero-photo-in` (clip-path open)
- `.page-in` (route fade via `app/template.tsx`)
- `.site-header` (scroll-timeline shadow), `.nav-link` (underline grows from the left)
- `.photo-card` (hover zoom, caption rise, arrow nudge; fine pointers only)
- `.lift-card` (2px rise, larger shadow)
- `.frame-shimmer` (image skeleton), `.hero-glow` (18 s drift)
- `.read-progress` (scroll-timeline progress bar)

The masonry cards reuse `[data-reveal]` and `.gs-parallax`. Details and decisions: `docs/design/redesign-white-botanical.md`.
