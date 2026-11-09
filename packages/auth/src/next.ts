// Next.js server helpers (Server Components, Route Handlers, Server Actions, proxy).
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import { NextResponse, type NextRequest } from 'next/server';

const url = () => process.env.NEXT_PUBLIC_SUPABASE_URL!;
const key = () => process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!;

export async function createSupabaseServerClient() {
  const store = await cookies();
  return createServerClient(url(), key(), {
    cookies: {
      getAll: () => store.getAll(),
      setAll: (list) => {
        // Server Components can't set cookies; the proxy refreshes the session instead.
        try { list.forEach(({ name, value, options }) => store.set(name, value, options)); } catch { /* read-only context */ }
      },
    },
  });
}

/**
 * Proxy (middleware) step: refresh the session cookie and return the verified user (or null).
 * getUser() validates the token with Supabase; never trust getSession() on the server.
 */
export async function refreshSession(request: NextRequest) {
  let response = NextResponse.next({ request });
  const supabase = createServerClient(url(), key(), {
    cookies: {
      getAll: () => request.cookies.getAll(),
      setAll: (list) => {
        list.forEach(({ name, value }) => request.cookies.set(name, value));
        response = NextResponse.next({ request });
        list.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
      },
    },
  });
  const { data } = await supabase.auth.getUser();
  return { response, user: data.user };
}

/** Access token for calling the Express API from the server, or null when signed out. */
export async function getAccessToken() {
  const supabase = await createSupabaseServerClient();
  const { data: claims } = await supabase.auth.getClaims(); // verifies the JWT locally via JWKS
  if (!claims) return null;
  const { data } = await supabase.auth.getSession();
  return data.session?.access_token ?? null;
}
