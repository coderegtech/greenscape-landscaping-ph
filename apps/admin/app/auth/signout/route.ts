import { createSupabaseServerClient } from '@greenscape/auth/next';
import { NextResponse, type NextRequest } from 'next/server';

/** Ends the session server-side (clears the auth cookies) and sends the visitor on. POST only. */
export async function POST(request: NextRequest) {
  const supabase = await createSupabaseServerClient();
  await supabase.auth.signOut();
  return NextResponse.redirect(new URL('/login', request.url), 303);
}
