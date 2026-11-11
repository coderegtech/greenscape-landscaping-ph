'use client';
import { Button } from '@greenscape/ui/components/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@greenscape/ui/components/dialog';
import { GoogleButton } from '@greenscape/ui/auth-forms';
import { safeNext } from '@greenscape/validation';
import Link from 'next/link';
import { BLOOMS, Flower, GREENS, TropicalLeaf } from '../hero/botanicals';

/** "Sign in to continue": shown when a visitor tries something that needs an account. Returns them here afterwards. */
export default function SignInPrompt({ open, reason, intent, onOpenChange }: { open: boolean; reason?: string; intent?: string; onOpenChange: (o: boolean) => void }) {
  // Client-only (loaded with ssr: false), so the current location is read directly.
  const back = new URLSearchParams(window.location.search);
  if (intent) back.set('intent', intent);
  // Only same-site paths survive (safeNext); everything else falls back to the account page.
  const next = safeNext(`${window.location.pathname}${back.size ? `?${back}` : ''}`, '/account');
  const q = `?next=${encodeURIComponent(next)}`;
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[26rem] overflow-clip rounded-[var(--radius-card)] border-rule bg-paper p-0" data-testid="sign-in-prompt">
        <div className="relative h-24 bg-[#eef3ea]">
          <TropicalLeaf aria-hidden color={GREENS.forest} vein={GREENS.sage} className="absolute -bottom-6 left-6 w-14 rotate-[-28deg]" />
          <Flower aria-hidden petal={BLOOMS.pink} center={BLOOMS.amber} className="absolute top-5 right-10 w-8" />
          <Flower aria-hidden petal={BLOOMS.lavender} center={BLOOMS.yellow} className="absolute top-12 right-24 w-5" />
        </div>
        <div className="flex flex-col gap-4 p-6 pt-5">
          <DialogTitle className="font-display text-3xl font-normal text-ink">Sign in to continue</DialogTitle>
          <DialogDescription className="text-base text-ink-2">
            {reason ?? 'Please sign in with Google or your account to send messages, chat with our AI assistant, and access more features.'}
          </DialogDescription>
          <div className="mt-2 flex flex-col gap-3">
            <GoogleButton next={next} />
            <Button asChild>
              <Link href={`/auth/login${q}`} className="no-underline">Sign in with email</Link>
            </Button>
            <p className="text-center text-sm text-ink-2">
              New here? <Link href={`/auth/register${q}`}>Create an account</Link>
            </p>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
