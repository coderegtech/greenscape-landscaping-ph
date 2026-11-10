import { refreshSession } from '@greenscape/auth/next';
import { NextResponse, type NextRequest } from 'next/server';
import { LEGACY_PRODUCT_PATHS, LEGACY_STORY_PATHS } from './lib/legacy-redirects';

const PROTECTED = ['/account', '/staff', '/messages'];
const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/** Old story and product links carried Firestore ids (`story.html?id=…`, `product-detail?id=…`): resolve to the new slug. */
async function legacyById(request: NextRequest, lookup: string, base: string) {
  const id = request.nextUrl.searchParams.get('id');
  let to = base;
  if (id && /^[\w-]{6,40}$/.test(id)) {
    try {
      const res = await fetch(`${API}${lookup}/${id}`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) to = `${base}/${(await res.json()).slug}`;
    } catch {
      /* API down: fall back to the index rather than an error */
    }
  }
  return NextResponse.redirect(new URL(to, request.url), 301);
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (LEGACY_STORY_PATHS.has(pathname)) return legacyById(request, '/v1/cms/articles/legacy', '/stories');
  if (LEGACY_PRODUCT_PATHS.has(pathname)) return legacyById(request, '/v1/shop/legacy', '/shop');

  const isProtected = PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const { response, user } = await refreshSession(request);
  if (!user && isProtected) {
    const login = new URL('/login', request.url);
    login.searchParams.set('next', pathname + search);
    return NextResponse.redirect(login);
  }
  return response;
}

export const config = {
  // Skip static assets and images; run on pages and route handlers.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif)$).*)'],
};
