import { refreshSession } from '@greenscape/auth/next';
import { NextResponse, type NextRequest } from 'next/server';

// Everything in admin requires a session; permission checks happen server-side against the API.
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

/** Nonce-based CSP: every admin page renders per request, so only scripts Next stamps with this request's nonce run. */
export function contentSecurityPolicy(nonce: string, dev = process.env.NODE_ENV !== 'production') {
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${dev ? " 'unsafe-eval'" : ''}`,
    "style-src 'self' 'unsafe-inline'", // next/image, Radix and the rich-text editor set style attributes
    `img-src 'self' data: blob: ${supabase}`.trim(),
    "font-src 'self'",
    `connect-src 'self' ${api} ${api.replace(/^http/, 'ws')} ${supabase}`.trim(), // ws(s): the realtime socket (older Safari does not map https → wss)
    "frame-src 'none'",
    "worker-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const nonce = btoa(crypto.randomUUID());
  const csp = contentSecurityPolicy(nonce);
  // Next reads the nonce from the request's CSP header and stamps its own scripts with it.
  request.headers.set('content-security-policy', csp);
  request.headers.set('x-pathname', pathname + search); // lets the MFA redirect (lib/session.ts) come back here
  const withCsp = (res: NextResponse) => (res.headers.set('Content-Security-Policy', csp), res);
  if (PUBLIC.some((p) => pathname === p || pathname.startsWith(`${p}/`))) return withCsp(NextResponse.next({ request }));
  const { response, user } = await refreshSession(request);
  if (!user) {
    const login = new URL('/login', request.url);
    login.searchParams.set('next', pathname + search);
    return NextResponse.redirect(login);
  }
  return withCsp(response);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif)$).*)'],
};
