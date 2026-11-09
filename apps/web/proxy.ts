import { refreshSession } from '@greenscape/auth/next';
import { NextResponse, type NextRequest } from 'next/server';

const PROTECTED = ['/account'];

export async function proxy(request: NextRequest) {
  const { response, user } = await refreshSession(request);
  const { pathname, search } = request.nextUrl;
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
