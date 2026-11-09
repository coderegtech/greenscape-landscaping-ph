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
| `Reveal kind="rise"` (fade + 12 px) | CSS + one shared IntersectionObserver; plays once; `index` staggers | Content is hidden only under `html.js` + `no-preference`, so it's visible without JS; under reduced motion it renders at its end state |
| `Reveal kind="fade"` | as above, opacity only | same |
| `Reveal kind="mask"` (image) | frame opens upward via `clip-path`, photo settles from 4% zoom | same |
| `Parallax` | Motion `useScroll`/`useTransform`, ±6% inside a clipped frame | static |
| `Counter` | Motion `animate` once in view; server HTML already holds the final number | shows final number |
| `SwapNumber` | Motion `AnimatePresence`, 220 ms vertical swap (cart count, unread) | instant swap; change announced via `aria-live` |
| Button press | `active:scale-[0.98]` at `--dur-micro` | n/a (instant) |
| Loading spinner | `.keep-motion`, appears only after 150 ms so fast actions don't flicker | keeps spinning (it's a status, not decoration) |
| Menus, dialogs, sheets, tooltips | Radix + `tw-animate-css` enter/exit (fade + slight zoom/slide) | instant |

Why reveals are CSS, not Motion: Motion's `initial` state is written into server HTML (`opacity: 0`), which would make content invisible to visitors without JavaScript and to crawlers that don't run it. The CSS approach keeps server-rendered pages complete.

## Rules of use
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
