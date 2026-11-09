import { createSupabaseServerClient } from '@greenscape/auth/next';
import { safeNext } from '@greenscape/validation';
import { NextResponse, type NextRequest } from 'next/server';

// Landing point for email confirmation, password recovery and OAuth (PKCE code exchange).
export async function GET(request: NextRequest) {
  const url = request.nextUrl;
  const next = safeNext(url.searchParams.get('next'), '/');
  const code = url.searchParams.get('code');
  if (code) {
    const supabase = await createSupabaseServerClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(next, url.origin));
  }
  const login = new URL('/login', url.origin);
  login.searchParams.set('error', 'link'); // fixed codes only: never echo provider text into the page
  return NextResponse.redirect(login);
}
