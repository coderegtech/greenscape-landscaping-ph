# Manifests

Each app has `app/manifest.ts`, which returns `manifestFor('<app>')` from `packages/ui/src/pwa/app.ts`. Next serves it at `/manifest.webmanifest` (`application/manifest+json`) and adds `<link rel="manifest">` to every page.

| Field | Admin | Employee |
|---|---|---|
| `id`, `start_url`, `scope` | `/` | `/` |
| `name` | Greenscape Admin | Greenscape Employee |
| `short_name` | GS Admin | GS Employee |
| `description` | Greenscape business administration and management | Greenscape employee attendance and work management |
| `display` | `standalone` | `standalone` |
| `theme_color` | `#193C2B` | `#368A5B` |
| `background_color` | `#F5F8F5` | `#F7FAF7` |
| `icons` | `/icons/admin-192.png`, `-512.png`, `-maskable-512.png` | `/icons/employee-…` |

Notes:

- `id` is `/` on both. Identity is the origin plus the id, so the two apps stay distinct and can be installed side by side.
- The manifest is public (`proxy.ts` lets it through without a session): browsers fetch it without cookies.
- Page metadata (root layouts): `theme-color`, `application-name`, `apple-mobile-web-app-title`, `mobile-web-app-capable`, `viewport-fit=cover`, plus Next's `app/icon.png` (32 px) and `app/apple-icon.png` (180 px).
- To change a name or colour, edit `PWA` in `packages/ui/src/pwa/app.ts`. Installed copies pick up manifest changes on their own schedule (Chrome checks about once a day).
