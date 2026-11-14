# App icon guidelines

Both icons use the same parts (a white ring, the lime Greenscape leaf, a green tile) so they read as one family. The symbol on the ring tells them apart; there is no text.

| | Greenscape Admin | Greenscape Employee |
|---|---|---|
| Tile | Deep forest green (`#255039` → `#193C2B`) | Fresh green (`#41996A` → `#2C7A4E`) |
| Symbol | The ring is a **gear**: management | The ring is a **clock**, the leaf its hand: attendance |
| Feel | Formal, dark | Friendly, bright |

At 32 px the gear teeth and the clock hand are still visible (see the bottom row of `preview.png`).

## Compositions

| Master (`packages/branding/icons/`) | Tile | Symbol size | Used for |
|---|---|---|---|
| `<app>.svg` | Rounded corners (radius about 23%), transparent outside | 100% | 192, 512, favicon, 1024 |
| `<app>-maskable.svg` | Full bleed, no transparency | 80% | Android adaptive icons |
| `<app>-apple.svg` | Full bleed (iOS rounds it) | 92% | Apple touch icon |
| `badge.svg` | Transparent, white mark | – | Android notification badge |

**Maskable safe area.** Launchers crop to a circle, squircle or rounded square that always contains the central 80% circle (radius 205 px of 512). The symbol's outermost point (a gear tooth) is 184 px from the centre at 100%, so at 80% it is 147 px: inside the safe circle with room to spare. `preview.png` shows both icons under a circular mask.

## Rules

- Do not add "ADMIN" / "EMPLOYEE" text, shadows, or a different leaf.
- Do not use the maskable file where the icon is shown uncropped (it looks small), or the rounded file as maskable (launchers would show transparent corners).
- Change artwork only in `scripts/brand-assets.mjs`, then run it. Do not edit the PNGs.
