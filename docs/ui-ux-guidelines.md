# UI/UX Guidelines

Phase 5 design system. Source of truth for tokens: `packages/ui/src/styles/theme.css`. Live gallery: `/design` in the web app (development only).

## Skills used
| Skill | Used for |
|---|---|
| **hallmark** | Direction (theme dealt: *Hedgerow*, 1 of 3), the Floor rules below, type/colour/surface/motion craft numbers |
| **shadcn** | CLI used to install Radix-based primitives into `packages/ui`; every component was then normalised to the floor (no `transition-all`, no rounded corners/shadows, no OS-driven `dark:` variants, global focus outline) and re-skinned with our tokens |
| emil-design-eng / animate (principles) | Easing curves, press feedback, spinner delay, enter/exit asymmetry |

`ui-ux-pro-max`'s palette/font search was not needed: the dealt theme plus the brand green settled both.

## Direction: "Field guide to a tropical garden"
A dark page that reads as **green, not night**: a deep leaf-green ground derived from Greenscape's own brand green, cream ink, sharp high-contrast **Prata** headings over a quiet **Manrope** body, real project photographs in true colour, and one **chartreuse** signal that marks controls and the few lines the page draws. The catalogue is presented like a field guide (common name in Prata, scientific name beside it), which the existing product data already supports. It should feel botanical, exact and calm. It should not feel like black luxury with gold, rustic kraft paper, or a SaaS template.

- **Theme:** Hallmark *Hedgerow* (colourway `hedge`), greens rotated from hue 158 to **140** to sit on the brand green `#163d08` (= `oklch(32% 0.091 139)`).
- **Posture:** drenched (the surface is the colour). The accent stays a signal: under 5% of any viewport.
- **Genre:** editorial.
- **What is kept from the current site:** the Greenscape wordmark, the dark brand green, a serif display voice, the photography.
- **What is dropped:** tracked-caps eyebrows ("OUR SERVICES"), Helvetica body, flat greys, Font Awesome, native `alert()`s.

## Tokens (summary)
| Role | Token | Value |
|---|---|---|
| Ground | `--color-paper` (raw: `--gs-paper`) | `oklch(24% 0.058 142)` |
| Band / well | `--color-paper-2` / `-3` | `oklch(19.5% 0.05 142)` / `oklch(29.5% 0.055 142)` |
| Brand green | `--color-brand` | `oklch(32% 0.091 139)` (`#163d08`) |
| Ink / secondary / muted | `--color-ink` / `-ink-2` / `-muted` | cream `oklch(93% 0.022 88)` / `oklch(81% 0.035 135)` / `oklch(70% 0.045 135)` |
| Rule | `--color-rule` | `oklch(35% 0.05 142)` |
| Signal | `--color-signal` (+ `-2` hover, `-deep` moss for cream bands, `-ink` text on signal). Named *signal*, not *accent*, because shadcn uses `accent` for subtle hover surfaces | chartreuse `oklch(87% 0.19 118)` |
| Danger | `--color-danger` | `oklch(72% 0.15 35)` (terracotta, readable on green; never the only signal) |
| Display / body | `--font-display` / `--font-body` | Prata 400 / Manrope 400·500·700 |

Type scale is 1.25 from a 16px body (17px for body copy, `text-md`): `text-xs` … `text-4xl`, `text-display-s`, `text-display` (84px at 1440, `clamp`ed). Spacing uses Tailwind's numeric scale (4px base) with Hallmark's names mapped as 2xs=1, xs=2, sm=3, md=4, lg=6, xl=10, 2xl=16, 3xl=24, 4xl=36. Named `--spacing-*` tokens were tried and removed: in Tailwind v4 they override `max-w-sm/md/lg` container sizes (caught by e2e: `max-w-md` became 16px). Radii: `--radius-card: 0` (photos, wells, inputs are square), `--radius-pill` for buttons and chips. Shadows: none on the site; one hairline ring in the admin. Z-scale: base 1 · raised 10 · dropdown 100 · sticky 200 · nav 300 · modal 400 · toast 500 · tooltip 600.

**Admin** uses the same families on a light "cream proof" surface (`[data-theme="admin"]`): cream paper, green ink, the brand green as primary, moss as the signal. It is an app screen: denser (14–15px UI text), 36–40px controls with 44px hit targets.

## The Floor (binding, from Hallmark)
1. Every colour and font goes through a token. No literal colours past `theme.css`.
2. Never `transition: all`; never animate width/height/top/left. Transform and opacity only.
3. No single italic word in a roman heading; a heading is one weight, one colour.
4. `overflow-x: clip` on `html` and `body` (never `hidden`, never `100vw`).
5. Image grid tracks use `minmax(0, 1fr)`; display heads wrap (`overflow-wrap: break-word; min-width: 0`).
6. Every interactive element has an instant `:focus-visible` ring (chartreuse on green, brand green on cream).
7. Every animation has a `prefers-reduced-motion: reduce` fallback; content is visible with scripting off.
8. Never an invented metric, testimonial, logo or count. Figures come from the business (e.g. "50+ projects" is on their current site) or are omitted.
9. No eyebrows and no tracked capitals: labels, nav links, captions and table heads are Manrope a step smaller, sentence case.
10. No middle-dot meta strings, no arrows glued to link text, no decorative status dots.
11. No purple-blue gradients, cards inside cards, emoji icons or drawn browser windows.
12. The hero's headline, one sentence and primary action fit in 1280×800.
13. About 80 words per screen.
14. The container is capped (`--container: 80rem`) and centred; at 1920 the gutters grow, not the grid.

## Layout templates (`packages/ui/src/layout/*`)
| Template | Use |
|---|---|
| `SiteHeader` | Wordmark left, 4–5 text links (Services and Projects open accessible menus), one quiet action ("Request a quote"), account link. Below 60rem: a sheet menu. 64px tall, sticky, hides nothing behind it (`scroll-padding-top`). |
| `SiteFooter` | Mast: wordmark over the link columns (Services, Shop, Company, Help), contact facts as a `<dl>`, socials as labelled icon links, photo credits slot. |
| `Container`, `Section`, `Band` | One container width; sections separated by space, a hairline, or a paper step (`band="deep" \| "cream"`, two bands per page at most). |
| `PageHero` | Photo-led (full-bleed image, scrim 45–70%, headline + one sentence + actions bottom-left) or type-led (no image). |
| `FieldIndex` | Field-guide list: common name (Prata), scientific name (label style), one line; chartreuse top rule. |
| `AdminShell` | Sidebar navigation (collapsible to a sheet below 64rem), top bar with page title and account menu, content area max 96rem. |

## Components (`packages/ui/src/components/*`)
Button (primary / secondary / ghost / danger / link; sizes `md` 48px marketing, `sm` 40px app, icon sizes; built-in `loading` state), Input, Textarea, Label, Field (label + control + hint/error wiring, reserved message line), Select, Checkbox, Dialog, Sheet, DropdownMenu, Accordion, Tabs, Tooltip, Badge, Separator, Skeleton + ProductCard/ProductGrid/Table/Prose skeletons, Toaster (sonner, token-themed), Table (focusable labelled scroll region), Photo (`next/image`, reserved ratio, blur placeholder, caption), Spinner.

Live gallery of all of them, in every state: `/design` (enabled with `ENABLE_DESIGN_GALLERY=true`; never in production). Screenshots at 390/768/1024/1440: `docs/screenshots/phase-5/`.

Every control documents and implements eight states: default, hover, focus-visible, active/pressed, disabled, loading, invalid, selected (where applicable).

## Responsive specification
Mobile-first. Checked at **390 · 768 · 1024 · 1440** (and 1920 for the cap).
| Width | Layout |
|---|---|
| < 48rem (768) | One column; header collapses to wordmark + menu button + cart; 16px gutters; body 17px; controls 48px; tables restack as labelled rows |
| 48–64rem | Two-column grids; sheet menu still used for the nav |
| ≥ 64rem (1024) | Full nav with menus; three/four-column grids; admin sidebar visible |
| ≥ 90rem (1440) | Display size reaches 84px; container stops growing at 80rem |

## Rendering rule
Public pages render complete HTML on the server. No route-level `loading.tsx` in the web app: it streams a skeleton and swaps content in with JavaScript, so visitors without JS (and crawlers that don't run it) only ever see the skeleton. Caught by the "content visible with JavaScript off" e2e test.

## Accessibility checklist (every PR)
- [ ] Contrast: body ≥ 4.5:1 (target 7:1), large text/icons/focus rings ≥ 3:1. Verified by axe in e2e (on end states, reduced motion).
- [ ] A link or button's accessible name contains its visible text (WCAG 2.5.3); no `aria-label` on plain `<span>`s.
- [ ] Wide content that scrolls sideways is a focusable, labelled region.
- [ ] `pnpm lint` passes (`jsx-a11y` recommended rules).
- [ ] Keyboard: every action reachable and operable; visible focus; no traps (Radix handles dialogs/menus); Escape closes overlays; focus returns to the trigger.
- [ ] Landmarks: one `<main>`, `<header>`/`<footer>`/`<nav aria-label>`; a skip link to `#main`.
- [ ] Headings step one level at a time; one `<h1>` per page.
- [ ] Every input has a label; errors are linked with `aria-describedby` and announced; the first invalid field takes focus on submit.
- [ ] Images: meaningful `alt`, or `alt=""` when the caption names it; width/height set.
- [ ] Touch targets ≥ 44px (48px on coarse pointers).
- [ ] Reduced motion: reveals show their end state; parallax off; only loaders keep moving.
- [ ] Works at 200% zoom and 390px without horizontal scrolling.
- [ ] `lang`, page `<title>`, meta description.
