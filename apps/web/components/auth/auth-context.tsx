'use client';
import { createSupabaseBrowserClient } from '@greenscape/auth/browser';
import type { User } from '@supabase/supabase-js';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';

// The modal is fetched the first time someone needs it, never with the page.
const SignInPrompt = dynamic(() => import('./sign-in-prompt'), { ssr: false });

interface AuthState {
  /** The signed-in Supabase user, or null. `ready` is false until the session has been read once. */
  user: User | null;
  ready: boolean;
  /** A fresh access token for direct API calls (the API verifies it; it never trusts this state). */
  accessToken: () => Promise<string | null>;
  /** Open "Sign in to continue". `intent` is added to the return URL so the page can resume the action. */
  promptSignIn: (opts?: { reason?: string; intent?: string }) => void;
  /** Run `action` if signed in, otherwise prompt. */
  requireAuth: (action: () => void, opts?: { reason?: string; intent?: string }) => void;
}

const Ctx = createContext<AuthState | null>(null);

/**
 * Keeps every component in step with the Supabase session (sign-in, sign-out and token refresh in this or another tab).
 * Only a convenience for the UI: every protected action is enforced by the API.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [supabase] = useState(createSupabaseBrowserClient);
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(false);
  // The prompt belongs to the page it was opened on: its links navigate, and the layout (this provider) stays mounted.
  const pathname = usePathname();
  const [prompt, setPrompt] = useState<{ reason?: string; intent?: string; path: string } | null>(null);
  const [promptLoaded, setPromptLoaded] = useState(false);
  const promptOpen = !!prompt && prompt.path === pathname;

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => { setUser(data.session?.user ?? null); setReady(true); });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => setUser(session?.user ?? null));
    return () => data.subscription.unsubscribe();
  }, [supabase]);

  const accessToken = useCallback(async () => (await supabase.auth.getSession()).data.session?.access_token ?? null, [supabase]);
  const promptSignIn = useCallback((opts?: { reason?: string; intent?: string }) => { setPromptLoaded(true); setPrompt({ ...opts, path: pathname }); }, [pathname]);
  const requireAuth = useCallback(
    (action: () => void, opts?: { reason?: string; intent?: string }) => (user ? action() : promptSignIn(opts)),
    [user, promptSignIn],
  );
  const value = useMemo(() => ({ user, ready, accessToken, promptSignIn, requireAuth }), [user, ready, accessToken, promptSignIn, requireAuth]);

  return (
    <Ctx.Provider value={value}>
      {children}
      {promptLoaded && <SignInPrompt open={promptOpen}reason={prompt?.reason} intent={prompt?.intent} onOpenChange={(o) => !o && setPrompt(null)} />}
    </Ctx.Provider>
  );
}

export function useAuth() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useAuth must be used inside AuthProvider');
  return v;
}
