// The two installable apps. One place for what makes each its own app: name, colours, icons, offline wording.
// Each is served from its own origin, so manifests, service workers, caches and push subscriptions never mix.
import type { MetadataRoute } from 'next';

export const PWA = {
  admin: {
    name: 'Greenscape Admin',
    shortName: 'GS Admin',
    description: 'Greenscape business administration and management',
    theme: '#193C2B',
    background: '#F5F8F5',
    offline: 'Orders, customers, attendance and content are loaded live and are not kept on this device. Changes cannot be saved until the connection is back.',
  },
  employee: {
    name: 'Greenscape Employee',
    shortName: 'GS Employee',
    description: 'Greenscape employee attendance and work management',
    theme: '#368A5B',
    background: '#F7FAF7',
    offline: 'Internet connection is required to record attendance. Your schedule, attendance history and requests are loaded live and are not kept on this device.',
  },
} as const;
export type PwaApp = keyof typeof PWA;

export const pwaIcon = (app: PwaApp, kind: '192' | '512' | 'maskable-512') => `/icons/${app}-${kind}.png`;

/** Body of `app/manifest.ts`. Next serves it at /manifest.webmanifest and links it from every page. */
export function manifestFor(app: PwaApp): MetadataRoute.Manifest {
  const a = PWA[app];
  return {
    id: '/',
    name: a.name,
    short_name: a.shortName,
    description: a.description,
    start_url: '/',
    scope: '/',
    display: 'standalone',
    lang: 'en',
    background_color: a.background,
    theme_color: a.theme,
    categories: ['business', 'productivity'],
    icons: [
      { src: pwaIcon(app, '192'), sizes: '192x192', type: 'image/png' },
      { src: pwaIcon(app, '512'), sizes: '512x512', type: 'image/png' },
      { src: pwaIcon(app, 'maskable-512'), sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}

/**
 * The offline screen (`app/offline/route.ts`). The service worker keeps a copy and shows it when a page cannot be
 * loaded. Self-contained on purpose: no scripts (so the nonce CSP has nothing to block), no data, nothing private.
 * It asks again by itself every 20 seconds; "Retry connection" asks now. Both reload the address the person wanted.
 */
export function offlineResponse(app: PwaApp) {
  const a = PWA[app];
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="theme-color" content="${a.theme}">
<meta name="robots" content="noindex">
<meta http-equiv="refresh" content="20">
<title>Offline · ${a.name}</title>
<style>
*{box-sizing:border-box}
body{margin:0;min-height:100dvh;display:grid;place-items:center;padding:max(1.5rem,env(safe-area-inset-top)) 1.5rem max(1.5rem,env(safe-area-inset-bottom));background:${a.background};color:#1c2b21;font:1rem/1.6 system-ui,-apple-system,"Segoe UI",Roboto,sans-serif}
main{max-width:26rem;display:flex;flex-direction:column;align-items:center;gap:1rem;text-align:center}
img{border-radius:22%}
h1{margin:0;font-size:1.75rem;line-height:1.2}
p{margin:0}
.status{display:inline-flex;align-items:center;gap:.5rem;padding:.375rem .875rem;border-radius:999px;background:#fbe9e7;color:#8c2f1f;font-weight:600;font-size:.875rem}
.status::before{content:"";width:.5rem;height:.5rem;border-radius:50%;background:currentColor}
.muted{color:#4d5f53;font-size:.9375rem}
a{display:inline-flex;align-items:center;justify-content:center;min-height:3rem;padding:0 1.5rem;border-radius:999px;background:#193C2B;color:#fff;font-weight:700;text-decoration:none}
a:focus-visible{outline:3px solid #1c2b21;outline-offset:3px}
</style>
</head>
<body>
<main>
<img src="${pwaIcon(app, '192')}" width="80" height="80" alt="">
<h1>You are offline</h1>
<p class="status" role="status">No internet connection</p>
<p>${a.offline}</p>
<p class="muted">This page checks again every 20 seconds and opens what you asked for as soon as the connection is back.</p>
<a href="">Retry connection</a>
</main>
</body>
</html>
`;
  return new Response(html, { headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-cache' } });
}
