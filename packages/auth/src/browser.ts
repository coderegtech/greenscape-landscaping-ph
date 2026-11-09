'use client';
import { createBrowserClient } from '@supabase/ssr';

/** Browser Supabase client (cookie-based session shared with the server). */
export function createSupabaseBrowserClient() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
}
