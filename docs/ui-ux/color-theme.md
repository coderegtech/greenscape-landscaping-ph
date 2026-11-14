# Portal colour themes

Source of truth: `packages/ui/src/styles/theme.css`. Each portal sets `data-theme` on `<html>` (`admin`, `employee`); the public website is untouched.

## Admin (`data-theme="admin"`)

| Role | Token | Value |
|---|---|---|
| Page background | `--gs-paper` | `#F5F8F5` |
| Sidebar | `.band-sidebar` | `#193C2B` (ink `#F5F8F5` 11.4:1, muted `#A3C2B0` 6.3:1, focus and active marker lime `#C9E64A` 8.7:1) |
| Primary green (buttons, links) | `--gs-signal` | `#2E7D4F` (white text 5.0:1) |
| Secondary green | `--gs-sage` | `#75B798` (decoration only) |
| Card | `--gs-paper-3` | `#FFFFFF` |
| Text | `--gs-ink` | `#1F2937` |
| Danger text | `--gs-danger` | `#C81E1E` (the brighter `#EF4444` is used for icons and fills) |

## Employee (`data-theme="employee"`)

| Role | Token | Value |
|---|---|---|
| Background | `--gs-paper` | `#F7FAF7` |
| Brand green (clock card, large type, icons) | `--gs-signal-deep`, `--tone-green` | `#368A5B` |
| Buttons with white text | `--gs-signal` | `#2F7A50`: white on `#368A5B` is 4.25:1, below AA for 14px text, so buttons use one step darker (5.2:1) |
| Fresh lime | `--tone-lime` | `#C9E64A` (decoration) |
| Soft blue / purple / peach | `--tone-*-soft` | `#DBEAFE` / `#EDE9FE` / `#FFEDD5` |
| Card | `--gs-paper-3` | `#FFFFFF` |
| Text | `--gs-ink` | `#202820` |

## Semantic tones (both portals)

Put `tone-<name>` on an element; inside it `var(--tone)` is the solid, `var(--tone-soft)` the tint, `var(--tone-ink)` the text colour. Every ink is ≥ 4.5:1 on its tint and on white (lowest: orange `#A14D08`, 5.1:1 on its tint).

| Tone | Solid | Means |
|---|---|---|
| green | `#2E7D4F` | success, healthy, active staff, clocked in |
| blue | `#3B82F6` | information, analytics, scheduled, leave |
| purple | `#8B5CF6` | content and CMS, holidays |
| orange | `#F59E0B` | waiting for a decision, late, pending correction |
| red | `#EF4444` | errors, urgent, absent or missing clock-out |
| gray | `#6B7280` | idle, finished, clocked out |

**A colour is never the only signal.** Every tone sits beside words or an icon: status pills say the status, calendar days carry an icon and a label, chart bars have tooltips and a table view, unread rows have a dot *and* bold text *and* a screen-reader "unread".

Typography in the portals: Manrope throughout (headings 700, tighter scale: `text-3xl` = 28px), figures in tabular Manrope. The public site keeps Prata headings.
