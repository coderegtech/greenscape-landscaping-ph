import { clientHeaders } from '@greenscape/auth/api';
import type { NextRequest } from 'next/server';

export const dynamic = 'force-dynamic';

/**
 * Same-origin page-view beacon (components/page-view.tsx), forwarded to the API with the visitor's address vouched for
 * by the internal key. Honours Global Privacy Control and Do Not Track. Always 204: analytics never shows an error.
 */
export async function POST(request: NextRequest) {
  const h = request.headers;
  if (h.get('sec-gpc') === '1' || h.get('dnt') === '1') return new Response(null, { status: 204 });
  try {
    const { path, referrer } = JSON.parse((await request.text()).slice(0, 2000)) as { path?: unknown; referrer?: unknown };
    await fetch(`${process.env.NEXT_PUBLIC_API_URL}/v1/analytics/pageview`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...(await clientHeaders()) },
      // Country only when the CDN in front supplies it (Cloudflare / Vercel); no GeoIP lookup here.
      body: JSON.stringify({ path, referrer, ua: h.get('user-agent') ?? '', country: h.get('cf-ipcountry') ?? h.get('x-vercel-ip-country') ?? undefined }),
      signal: AbortSignal.timeout(3000),
    });
  } catch {
    /* bad body or API down: drop the view */
  }
  return new Response(null, { status: 204 });
}
