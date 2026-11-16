# PWA testing

## Automated (Playwright, Chromium, production builds)

`tests/e2e/pwa.spec.ts`, run on the `desktop` (1440 px) and `mobile` (Pixel 7, 390 px) projects:

```bash
pnpm build
pnpm exec playwright test pwa
```

| Test | Checks |
|---|---|
| serves its own manifest, icons and page metadata (per app) | Manifest reachable without a session, right content type, name, short name, start URL, scope, display, colours; three icons load as PNG with the declared pixel sizes; a maskable icon exists; the other app's icons are 404 on this origin; `<link rel=manifest>`, theme colour, application name, Apple title, `viewport-fit=cover`; Apple icon 180 px, favicon 32 px; **Chromium's own checks**: `Page.getAppManifest` reports no errors and `Page.getInstallabilityErrors` reports no blocker (other than the private test profile) |
| the service worker covers its origin… (per app) | `/sw.js` content type and `no-cache`; names only this app's cache; contains no `cache.put`; registered with scope `/`; the cache holds exactly the offline screen and two icons; after a new worker installs, older `gs-<app>-*` caches are gone and unrelated caches remain; exactly one registration |
| admin: signed-in pages are never cached… | Signed-in pages are `no-store`; after browsing, the cache still holds only the public shell; offline: notice shown, navigation shows the offline screen with the app icon, without the person's details, at the address asked for; back online, Retry opens the page; without a session the page redirects to sign-in |
| employee: attendance needs a connection… | Offline: clock button disabled, "Internet connection is required to record attendance.", no confirmation shown; online again: nothing was recorded; Install: no button without a browser offer, button after an offer, a declined offer is not reported as installed, `appinstalled` is |
| both apps fit phones, tablets and desktops | No sideways scrolling on the main pages at 390, 768, 1024 and 1440 px; bottom navigation on phones only |

### Result (2026-11-14, Windows 11, Chromium, local production builds)

| Run | Result |
|---|---|
| `tests/e2e/pwa.spec.ts`, desktop + mobile | **13 passed**, 1 skipped (the multi-width test runs once, on desktop). Repeated twice more: all passed. |
| Staff suites against the same builds: `portal-redesign`, `portal-sound-blocked`, `notifications`, `permissions`, `csrf`, `mfa`, `admin.spec`, `admin/`, `auth/`, `employee/`, `attendance`, `security-headers` (admin, employee) | Passed, except the three below |
| Three tests that go through the customer site (`attendance`: "/staff link", on both projects; `security-headers`: "public site") | **Not verified here.** The run used a development server of the customer site from another checkout (port 3000), which sends a development CSP and links to a different employee port. The customer site is not changed by this work. Re-run with `pnpm build && pnpm test:e2e` on a free machine or in CI. |
| Customer-site suites (`public-site`, `shop`, `hero`, `design-system`, …) | Not run against a production build, for the same reason |
| Visual baselines (`pnpm test:visual`): staff sign-in screens | Refreshed (the mark changed); 4 passed |
| `pnpm exec eslint .`, `pnpm typecheck` (ui, admin, employee, tests), `pnpm test` | Clean; 118 unit tests passed |
| `docker build -f apps/employee/Dockerfile` and a run of the image | Built; container healthy; `/manifest.webmanifest`, `/sw.js`, `/offline`, `/icons/*`, `/apple-icon.png` answer 200 with the right content types |

After merging `main` (2026-11-15, GS mark in the brand tiles): the PWA suite passed again on both projects. One existing test (`portal-redesign`: "clock-in is confirmed by the server") timed out when four workers ran at once, because the local API was answering in 2 to 7 seconds under that load; it passes alone and with two workers.

Found on the way: several existing test files cleaned up employees by a label shared between parallel workers, so one worker could delete the employee another was using ("account is not linked to an employee record"). `portal-redesign`, `auth/logout`, `auth/session-persistence`, `auth/cross-portal-access` and `employee/attendance-access` now use a per-worker tag, like `auth/employee-login` already did.

## What automation does not prove

Playwright cannot install an app into an operating system, and the install button test **simulates** the browser's `beforeinstallprompt` and `appinstalled` events. Chromium's installability check passing means Chrome considers the app installable; it is not an installation. These need a person with the device, on the deployed HTTPS origins:

| # | Device | Check | Result |
|---|---|---|---|
| 1 | Android, Chrome | Profile / Settings → Install app → app icon on the home screen is the right one (gear = Admin, clock = Employee) | not yet done |
| 2 | Android, Chrome | Icon looks right under the launcher's mask (circle, squircle); nothing cut off | not yet done |
| 3 | Android | Opens without browser bars; status bar is green; back gesture stays in the app; still signed in after closing and reopening | not yet done |
| 4 | Android | Turn on alerts → send an announcement from Admin → system notification with the app icon; tapping opens the right page | not yet done |
| 5 | iPhone, Safari (16.4+) | Share → Add to Home Screen → icon and name correct; opens without Safari's bars; content clear of the notch and the home indicator | not yet done |
| 6 | iPhone, installed | Sign in, close, reopen: session kept. Turn on alerts: notification arrives | not yet done |
| 7 | iPad | Same as 5, in portrait and landscape | not yet done |
| 8 | Windows / macOS, Chrome or Edge | Install from Settings or the address bar; own window with the right title and icon; resizing works; sign-in works | not yet done |
| 9 | macOS, Safari 14+ | File → Add to Dock | not yet done |
| 10 | Any installed app | Airplane mode: offline screen appears; clock button disabled (Employee); back online: Retry opens the page | not yet done |
| 11 | Both apps on one phone | Two icons, two apps, separate sign-ins | not yet done |
| 12 | After the next deployment | Reopen an installed app: new version loads without clearing data | not yet done |

Also not automated: real push delivery through FCM / APNs (needs VAPID keys and a real push service), and Lighthouse (its PWA category was removed in Lighthouse 12; the Chromium checks above replace it).

## Remaining issues

- A network that is attached but has no internet is reported as "online" by browsers. The clock button is then enabled and the punch fails with an error message (never a false success).
- Opening `/offline` directly while online still says "You are offline" (nothing links to it).
- iOS splash images are not generated; iOS shows the app background until the first paint.
- On a shared device, push notifications continue after sign-out until alerts are turned off (`docs/pwa/security.md`).
- The brand tile in the apps is the GS mark while the app icons use the leaf with a gear or clock: whether the icons should be redrawn around the GS mark is an open design decision (`docs/branding/logo-guidelines.md`).
- Visual baselines exist for Windows only (`tests/e2e/visual`); the staff sign-in baselines were refreshed on 2026-11-14, before the GS mark replaced the brand tile; they still pass within the 2% tolerance, but refresh them (`pnpm test:visual --update-snapshots=all`) to make them exact.
