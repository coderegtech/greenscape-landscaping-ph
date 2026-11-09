import { refreshSession } from '@greenscape/auth/next';
import { NextResponse, type NextRequest } from 'next/server';
import { LEGACY_STORY_PATHS } from './lib/legacy-redirects';

const PROTECTED = ['/account'];
const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/** Old story links carried Firestore ids (`story.html?id=…`, `/share/story?id=…`): resolve to the new slug. */
async function legacyStory(request: NextRequest) {
  const id = request.nextUrl.searchParams.get('id');
  let to = '/stories';
  if (id && /^[\w-]{6,40}$/.test(id)) {
    try {
      const res = await fetch(`${API}/v1/cms/articles/legacy/${id}`, { signal: AbortSignal.timeout(3000) });
      if (res.ok) to = `/stories/${(await res.json()).slug}`;
    } catch {
      /* API down: fall back to the stories index rather than an error */
    }
  }
  return NextResponse.redirect(new URL(to, request.url), 301);
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (LEGACY_STORY_PATHS.has(pathname)) return legacyStory(request);

  const { response, user } = await refreshSession(request);
  if (!user && PROTECTED.some((p) => pathname === p || pathname.startsWith(`${p}/`))) {
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
