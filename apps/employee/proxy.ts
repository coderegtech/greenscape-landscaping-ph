import { refreshSession } from '@greenscape/auth/next';
import { NextResponse, type NextRequest } from 'next/server';

// Employee portal: every page needs a session; who is an employee is decided by the API, never here.
const PUBLIC = ['/login', '/auth/callback', '/api/health', '/sw.js', '/manifest.webmanifest', '/offline'];

const origin = (u: string | undefined) => {
  try {
    return u ? new URL(u).origin : '';
  } catch {
    return '';
  }
};
const api = origin(process.env.NEXT_PUBLIC_API_URL) || 'http://localhost:4000';
const supabase = origin(process.env.NEXT_PUBLIC_SUPABASE_URL);

/** Nonce-based CSP, same policy as the admin app: every page renders per request. */
export function contentSecurityPolicy(nonce: string, dev = process.env.NODE_ENV !== 'production') {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    `connect-src 'self' ${api} ${api.replace(/^http/, 'ws')} ${supabase}`.trim(), // ws(s): the realtime socket (older Safari does not map https → wss)
    "frame-src 'none'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const csp = contentSecurityPolicy(btoa(crypto.randomUUID()));
  request.headers.set('content-security-policy', csp);
  const withCsp = (res: NextResponse) => (res.headers.set('Content-Security-Policy', csp), res);
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return withCsp(NextResponse.next({ request }));
  const { response, user } = await refreshSession(request);
  if (!user) {
    const login = new URL('/login', request.url);
    if (pathname !== '/') login.searchParams.set('next', pathname + search);
    return NextResponse.redirect(login);
  }
  return withCsp(response);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif)$).*)'],
};
