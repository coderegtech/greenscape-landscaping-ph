# Scroll animations (website-wide)

Every public page reveals its sections as they scroll into view: headings rise, columns slide in from their own side, card grids stagger, figures scale in, photographs open through a mask, and a few large photographs drift with the scroll. Timing, easing and the rules of use live in `docs/animation-system.md` (the motion guidelines); this page covers how it is built and where it is used.

## How it works

| Piece | File | What it does |
|---|---|---|
| Keyframes, directions, stagger, latch rule | `packages/ui/src/styles/theme.css` (search "Scroll reveal") | `[data-reveal="kind"]` and `[data-stagger="kind"] > *` run a CSS scroll-driven animation (`animation-timeline: view()`) over the first 60% of the element's entry, eased with `--ease-out`. Travel is `--reveal-y` 20 px / `--reveal-x` 32 px, 12 / 16 px on phones. |
| `Reveal` | `packages/ui/src/motion/reveal.tsx` | Server component: one element, `kind` = `rise` (default), `down`, `left` (in from the right), `right` (in from the left), `scale`, `fade`, `mask` (photos); `index` staggers. |
| `Stagger` | same file | Server component: every direct child reveals, staggered by column, without a wrapper per card. On an existing element, the plain attribute `data-stagger="rise"` does the same. |
| `RevealLatch` | `packages/ui/src/motion/reveal-latch.tsx`, mounted once in `apps/web/app/layout.tsx` | Scroll-driven animations run backwards when an element leaves through the bottom of the screen. Once a reveal has played (its animation reports progress 1), the latch sets `data-revealed` and theme.css drops the animation, so seen content never fades out again. One IntersectionObserver (thresholds every 5%) and one MutationObserver (new reveals from navigation, filters, "show more"), batched per frame; no work on scroll. |
| Parallax | `.gs-parallax` (theme.css), `Parallax` (`packages/ui/src/motion/parallax.tsx`) | ±6% `translate` while the frame crosses the screen, inside a clipping frame. |
| Header entrance | `.hero-in` | Above-the-fold headings (`PageHero`, `PageHeader`) use a CSS time-based entrance that starts with the first paint, never a scroll reveal. |

### Usage

```tsx
import { Reveal, Stagger } from '@greenscape/ui/motion/reveal';

<Reveal>                                   {/* heading group: rises */}
  <h2>Our landscaping services</h2>
</Reveal>

<Reveal kind={photoOnLeft ? 'left' : 'right'}>  {/* words beside a photo come in from their own side */}
  <RichText doc={body} />
</Reveal>

<Reveal kind="mask">                       {/* photograph: opens upward, settles from 4% zoom */}
  <Photo src={src} alt={alt} className="gs-parallax" />  {/* optional drift, clipped by the frame */}
</Reveal>

<Stagger as="ul" className="grid grid-cols-3 gap-6">   {/* cards: one after another */}
  {items.map((x) => <li key={x.id}><Card x={x} /></li>)}
</Stagger>

<dl data-stagger="scale" className="grid grid-cols-4">…</dl>  {/* attribute form on an existing element */}
```

`SectionHeading` already reveals itself (heading rises, its action fades in after it), so section headings need nothing extra.

## Why CSS and not Motion for React (or GSAP, or Lenis)

The brief suggested Motion for React. The project measured that path in Phase 12 and moved away from it, and the reasons still hold:

- Motion writes its `initial` state (`opacity: 0`) into the server HTML. Content is then invisible until hydration, invisible with JavaScript off, and the LCP element waits for the bundle. A Motion `useScroll` parallax measured a **2.9 s LCP render delay** on mobile Lighthouse (`docs/lighthouse/`).
- CSS scroll-driven animations run on the compositor with no JavaScript, can't hide server-rendered content when scripts fail, and need no client components on server-rendered CMS pages.
- One system: Motion stays where it already is (admin, `SwapNumber`); GSAP is not installed and nothing here needs it.
- Smooth scrolling stays native (`scroll-behavior: smooth` under `data-scroll-behavior`, `scroll-padding-top: 5rem` for the sticky header). Lenis would intercept the wheel and buys nothing here.

Trade-off: reveals are scroll-linked (they progress with the scroll) rather than timed (a fixed 650 ms once triggered). Browsers without `animation-timeline` support show everything immediately and still.

## Page coverage

| Page | Reveals | Parallax | Left still on purpose |
|---|---|---|---|
| Home `/` | section headings rise; service cards stagger; featured projects slide in from their photo's side; gallery masonry staggers; stories stagger; testimonials stagger; stats scale in; CTA band rises; footer groups fade | hero photo (existing), some masonry photos, botanical accents | Botanical hero (own entrance, floating and pointer motion) |
| About `/about` | headings rise; media/text columns slide in from their side, alternating down the page; photos (and the footprint map) open through the mask; any stats or photo sets the CMS adds scale in / stagger | media/text photos | wide hero photo (CSS entrance only) |
| CMS pages `/[slug]`, privacy, delivery policy | same section renderer as About | as About | rich-text paragraphs |
| Services `/services` | header entrance; cards stagger | – | – |
| Service `/services/[slug]` | "What it covers" heading in from the left, list staggers; step text alternates sides opposite its photo; step photos mask; packages, before/after pairs and guides stagger | hero photo, step photos | before/after slider interaction |
| Projects `/projects` | header + filters entrance; masonry staggers by column | some masonry photos | filter results already on screen appear at once (no replay) |
| Project `/projects/[slug]` | heading rises; photo masonry staggers; related projects stagger | some masonry photos | story text |
| Gallery `/gallery` | header + filters entrance; masonry staggers | some masonry photos | lightbox keeps its dialog enter/exit |
| Stories `/stories` | header entrance; story cards stagger | – | lead story (above the fold, LCP) |
| Story `/stories/[slug]` | in-article photos mask; videos fade; more stories stagger | cover photo | paragraphs while reading; reading-progress bar unchanged |
| Testimonials | header entrance; cards stagger; "Worked with us?" slides in from the left | – | feedback form |
| FAQ | header entrance; questions stagger | – | accordion open/close unchanged |
| Contact | header entrance; "Find us" slides in from the left; the form only fades | – | form fields, validation |
| Quote | header entrance | – | the form (above the fold) |
| Shop `/shop` | header + category filters entrance; product grid staggers by column | – | search form, prices |
| Product `/shop/[slug]` | description and care sections stagger | – | gallery, price, buy box |
| Cart, checkout, account, auth, orders, messages | heading entrance only | – | everything: purchase and account flows stay immediate |

## Tests

`tests/e2e/scroll-animations.spec.ts` (Chromium):

- At 1440, 1024, 768 and 390 px, every page above plus the first product: the first section renders; on pages taller than two screens a reveal waits hidden below the fold; every `.gs-parallax` sits in a clipping frame; scrolled down in half-screen steps with no horizontal overflow; at the bottom nothing is left hidden; scrolled back up, nothing on screen (even half below the fold) has faded; no page errors, console errors or hydration warnings. Screenshots at 1440 and 390 px are attached to the report.
- Reduced motion: no reveal or parallax layer has opacity < 1, a transform or a translate.
- JavaScript off: the home page's reveals still complete and the quote CTA is visible.
- The revealed quote CTA still navigates to `/quote`.

Results (2026-11-12, `next dev` on the worktree, Chromium, one worker): all 7 tests pass (1440 px 7.8 min with cold compiles; 1024 + 768 px 4.3 min; 390 px 3.0 min). With three workers against the dev server, the image optimizer answered some requests with 504s, which the console check rightly flags; every animation assertion still passed. Run it with few workers against `next dev`, or against a production build as CI does.

Existing coverage that still applies: `design-system.spec.ts` (no-JS, reduced motion, below-fold reveal), `decorations.spec.ts` (accents never cover content, no overflow), `pnpm test:visual` (layout snapshots, reduced motion).
