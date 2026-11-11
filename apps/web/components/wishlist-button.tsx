'use client';
import { Heart } from 'lucide-react';
import { useEffect, useState } from 'react';
import { toast } from '@greenscape/ui/components/sonner';
import { useAuth } from './auth/auth-context';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

/** Save a plant to the wishlist (account page). Guests are asked to sign in. */
export function WishlistButton({ productId, productName }: { productId: string; productName: string }) {
  const { user, accessToken, requireAuth } = useAuth();
  const [savedState, setSaved] = useState(false);
  const saved = !!user && savedState; // signed out: nothing is saved
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (!user) return;
    let live = true;
    void (async () => {
      const token = await accessToken();
      const res = await fetch(`${API}/v1/me/wishlist`, { headers: { authorization: `Bearer ${token}` }, cache: 'no-store' }).catch(() => null);
      if (live && res?.ok) setSaved((await res.json()).some((w: { id: string }) => w.id === productId));
    })();
    return () => { live = false; };
  }, [user, accessToken, productId]);

  const toggle = async () => {
    setBusy(true);
    const token = await accessToken();
    const res = await fetch(`${API}/v1/me/wishlist/${productId}`, { method: saved ? 'DELETE' : 'PUT', headers: { authorization: `Bearer ${token}` } }).catch(() => null);
    setBusy(false);
    if (!res?.ok) return void toast.error('Your wishlist did not update. Please try again.');
    setSaved(!saved);
    toast.success(saved ? `${productName} removed from your wishlist` : `${productName} saved to your wishlist`);
  };

  return (
    <button
      type="button"
      aria-pressed={saved}
      disabled={busy}
      data-testid="wishlist-button"
      onClick={() => requireAuth(() => void toggle(), { intent: 'wishlist', reason: 'Please sign in with Google or your account to save plants to your wishlist.' })}
      className="inline-flex min-h-11 items-center gap-2 self-start rounded-[var(--radius-pill)] border border-rule-strong px-4 text-sm text-ink hover:bg-paper-2 focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60"
    >
      <Heart aria-hidden className={saved ? 'size-4 fill-current text-danger' : 'size-4'} />
      {saved ? 'Saved to wishlist' : 'Save to wishlist'}
    </button>
  );
}
