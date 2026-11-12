import { api } from '@greenscape/auth/api';
import { createSupabaseServerClient } from '@greenscape/auth/next';
import { z } from '@greenscape/validation';
import { NextResponse, type NextRequest } from 'next/server';

/** Ends the session server-side (clears the auth cookies) and sends the visitor on. POST only. */
export async function POST(request: NextRequest) {
  // Tell the API first, while the token is still in the cookie: a copy of it must not outlive the sign-out.
  await api('/v1/auth/logout', z.undefined(), { method: 'POST' }).catch(() => undefined);
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL('/', request.url), 303);
}
