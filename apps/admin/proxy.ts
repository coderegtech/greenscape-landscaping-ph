import { refreshSession } from '@greenscape/auth/next';
import { NextResponse, type NextRequest } from 'next/server';

// Everything in admin requires a session; permission checks happen server-side against the API.
const PUBLIC = ['/login', '/auth/callback', '/api/health'];

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return NextResponse.next();
  const { response, user } = await refreshSession(request);
  if (!user) {
    const login = new URL('/login', request.url);
    login.searchParams.set('next', pathname + search);
    return NextResponse.redirect(login);
  }
  return response;
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif)$).*)'],
};
