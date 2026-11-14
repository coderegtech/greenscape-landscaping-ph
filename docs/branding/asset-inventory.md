# Asset inventory

Everything below is written by `node scripts/brand-assets.mjs` (needs only `sharp`, already a dev dependency).

## Vector masters

| Path | Content |
|---|---|
| `packages/branding/logos/greenscape-{horizontal,stacked,mark}{,-dark,-mono}.svg` | 9 logo files |
| `packages/branding/icons/{admin,employee}{,-maskable,-apple}.svg` | 6 app icon masters |
| `packages/branding/icons/badge.svg` | Notification badge |
| `packages/branding/wordmark.json` | Wordmark outlines (Manrope 700 / 500) used by the script |
| `packages/branding/original/` | The previous `icon-512.png` and `apple-icon-180.png` |

## App icons (per app; `<app>` is `admin` or `employee`)

| File | Size | Purpose | Referenced by |
|---|---|---|---|
| `apps/<app>/public/icons/<app>-192.png` | 192 × 192 | Standard PWA icon | Manifest, push notifications, offline screen |
| `apps/<app>/public/icons/<app>-512.png` | 512 × 512 | Large PWA icon, splash | Manifest |
| `apps/<app>/public/icons/<app>-maskable-512.png` | 512 × 512 | Maskable (Android) | Manifest, `purpose: maskable` |
| `apps/<app>/public/icons/badge-96.png` | 96 × 96 | Notification badge | Service worker |
| `apps/<app>/app/apple-icon.png` | 180 × 180 | Apple touch icon | Next metadata (`<link rel="apple-touch-icon">`) |
| `apps/<app>/app/icon.png` | 32 × 32 | Favicon | Next metadata (`<link rel="icon">`) |
| `packages/branding/icons/png/<app>-1024.png` | 1024 × 1024 | High-resolution master | Stores, print, decks |

## Other

| File | Purpose |
|---|---|
| `docs/branding/preview.png` | Contact sheet of every variant |
| `packages/ui/src/layout/brand-mark.tsx` | The mark as a React component (sidebar, header, sign-in) |

## Splash screens

Android builds the splash from the manifest: `background_color`, the 512 icon and `name`. iOS shows the page's background until the first paint; per-device `apple-touch-startup-image` files (about 20 PNGs) were not generated.
