# Dashboard components

Shared by both portals, in `packages/ui/src/layout/`.

| Component | File | Use |
|---|---|---|
| `AdminShell` | `admin-shell.tsx` | Dark sidebar with grouped, permission-filtered links, Lucide icons, count badges, active marker that slides between links; collapses to an icon rail with tooltips (remembered per browser); a left drawer below 1024px that closes on navigation; top bar with sidebar toggle, sound switch, bell and account menu |
| `PortalShell` | `employee-shell.tsx` | Employee top bar (brand, four destinations on ≥ 768px, sound switch, bell, profile avatar) and a five-item bottom bar on phones with a sliding active pill and a badge for requests waiting on HR |
| `PortalAuth` | `portal-auth.tsx` | Split sign-in screen: botanical panel (original potted-plant illustration, token colours) beside the form; compact header on phones. `tone="deep"` admin, `tone="fresh"` employee |
| `StatCard` | `dashboard.tsx` | Metric: label, icon on a white chip, figure, optional trend pill with its comparison period, detail line; tinted corner gradient by tone; whole card is the link |
| `Panel` | `dashboard.tsx` | Titled white card with an icon tile and a "see all" link |
| `StatusPill` | `dashboard.tsx` | Status in words on its tone, optional icon |
| `EmptyState` | `dashboard.tsx` | Icon, one line, one sentence |
| `IconTile`, `Card`, `PageHeader` | `dashboard.tsx` | Small building blocks |
| `Counter` | `motion/counter.tsx` | Count-up for real figures (now with prefix and decimals for pesos) |
| `DailyBars` | `apps/admin/components/sales-chart.tsx` | Bar chart with hover and keyboard tooltips and a table view; takes a tone |

## Data rules

* **Only real figures.** Every number comes from the API. A section the person may not see is absent (no card), never shown as 0. If the overview call fails, the dashboard says so instead of showing zeros.
* **Count-ups only when data is ready.** Figures are rendered on the server with their final value; the count-up runs in the browser from 0 to that value once the card is on screen (600 ms). No JavaScript or reduced motion: the final value stays put.
* **Trends only against a real earlier figure** (sales vs yesterday, visitors vs the previous 7 days); no earlier data, no trend.

## Motion

| Interaction | How | Duration |
|---|---|---|
| Card entrance | CSS `card-in`, opacity + 8px rise, 40 ms stagger capped at 8 | 280 ms |
| Sidebar collapse | width transition (the one layout property animated: the content must follow) | 200 ms |
| Active nav marker | Motion `layoutId` slide | 200 ms |
| Dropdowns, account menu, bell | Radix + tw-animate fade/zoom from the trigger | ~150 ms |
| Button and tab press | `scale(0.97–0.98)` | 140 ms |
| Bell on arrival | rocks once (existing) | 420 ms |
| Clock-in confirmed | tick pops, ring spreads | 240 / 700 ms |

Everything respects `prefers-reduced-motion` (global rule in `theme.css`, and `MotionConfig reducedMotion="user"` in both shells).
