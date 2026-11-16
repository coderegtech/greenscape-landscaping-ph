'use client';
import { Download, Share, SquarePlus, WifiOff } from 'lucide-react';
import { useEffect, useState, useSyncExternalStore, type ReactNode } from 'react';
import { Button } from '../components/button';

// ---- connection -----------------------------------------------------------------------------------------------------

const watchConnection = (notify: () => void) => {
  window.addEventListener('online', notify);
  window.addEventListener('offline', notify);
  return () => { window.removeEventListener('online', notify); window.removeEventListener('offline', notify); };
};
/**
 * What the browser reports. `false` is certain; `true` only means a network is attached, so every save still waits for
 * the server's answer.
 */
export const useOnline = () => useSyncExternalStore(watchConnection, () => navigator.onLine, () => true);

/** A quiet notice while the device is offline. `children` says what that means in this app. */
export function OfflineBanner({ children }: { children: ReactNode }) {
  if (useOnline()) return null;
  return (
    <div role="status" data-testid="offline-banner" className="fixed inset-x-3 bottom-[calc(5rem+env(safe-area-inset-bottom))] z-[250] mx-auto flex w-fit max-w-full items-center gap-3 rounded-2xl bg-ink py-2.5 pr-2.5 pl-4 text-sm font-medium text-paper shadow-soft md:bottom-6">
      <WifiOff aria-hidden className="size-4 shrink-0" />
      <span className="min-w-0">You are offline. {children}</span>
      <button type="button" onClick={() => window.location.reload()} className="press min-h-9 shrink-0 rounded-xl bg-paper px-3 text-sm font-bold text-ink">Retry</button>
    </div>
  );
}

// ---- install --------------------------------------------------------------------------------------------------------

type InstallPrompt = Event & { prompt(): Promise<unknown>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
type InstallState = { prompt: InstallPrompt | null; installed: boolean };

// The browser fires `beforeinstallprompt` once, early, on whichever page is open. It is kept here until the person
// opens the settings screen that offers it.
let install: InstallState = { prompt: null, installed: false };
const NONE: InstallState = { prompt: null, installed: false };
const watchers = new Set<() => void>();
const setInstall = (next: InstallState) => { install = next; watchers.forEach((w) => w()); };
const watchInstall = (w: () => void) => { watchers.add(w); return () => { watchers.delete(w); }; };

/**
 * Once per app, in the root layout: registers the service worker (offline screen, push) and holds the browser's
 * install offer. Holding it also keeps Chrome's own install banner from appearing uninvited.
 */
export function PwaRegistration() {
  useEffect(() => {
    if ('serviceWorker' in navigator) void navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).catch(() => undefined);
    const offered = (e: Event) => { e.preventDefault(); setInstall({ prompt: e as InstallPrompt, installed: false }); };
    const done = () => setInstall({ prompt: null, installed: true });
    window.addEventListener('beforeinstallprompt', offered);
    window.addEventListener('appinstalled', done);
    return () => { window.removeEventListener('beforeinstallprompt', offered); window.removeEventListener('appinstalled', done); };
  }, []);
  return null;
}

type Platform = 'standalone' | 'ios' | 'other';
const never = () => () => undefined;
function platform(): Platform {
  if (window.matchMedia('(display-mode: standalone)').matches || (navigator as Navigator & { standalone?: boolean }).standalone) return 'standalone';
  // iPadOS reports itself as a Mac; the touch points give it away.
  return /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1) ? 'ios' : 'other';
}

/**
 * "Install app", for a settings screen. Shows a button only when this browser has really offered installation;
 * otherwise the steps for this device. Never claims the app is installed unless the browser said so.
 */
export function InstallApp({ name }: { name: string }) {
  const { prompt, installed } = useSyncExternalStore(watchInstall, () => install, () => NONE);
  const where = useSyncExternalStore(never, platform, () => null);
  const [declined, setDeclined] = useState(false);
  if (!where) return null;

  const ask = async () => {
    if (!prompt) return;
    await prompt.prompt();
    const { outcome } = await prompt.userChoice;
    setInstall({ prompt: null, installed: false }); // an offer can be used once; `appinstalled` confirms a real install
    setDeclined(outcome === 'dismissed');
  };
  const step = 'flex items-center gap-2';
  return (
    <div className="flex flex-col gap-3 text-sm text-ink-2" data-testid="install-app" data-state={where === 'standalone' ? 'standalone' : installed ? 'installed' : prompt ? 'available' : where}>
      {where === 'standalone' ? (
        <p>You are using the installed {name} app.</p>
      ) : installed ? (
        <p role="status">{name} was installed. Open it from your home screen or app list.</p>
      ) : prompt ? (
        <>
          <p>Add {name} to this device: it opens in its own window, from its own icon.</p>
          <Button size="sm" className="self-start" onClick={ask}><Download /> Install app</Button>
        </>
      ) : where === 'ios' ? (
        <>
          <p>To add {name} to your Home Screen on iPhone or iPad:</p>
          <ol className="flex list-decimal flex-col gap-1.5 pl-5">
            <li>Open this page in Safari.</li>
            <li><span className={step}>Tap Share <Share aria-hidden className="size-4" /></span></li>
            <li><span className={step}>Choose Add to Home Screen <SquarePlus aria-hidden className="size-4" /></span></li>
          </ol>
        </>
      ) : (
        <p>
          {declined ? 'Not installed. You can do it later: ' : `To add ${name} to this device, `}
          open your browser&apos;s menu and choose Install app or Add to Home Screen. Browsers that cannot install apps do not show that option; the site works the same without it.
        </p>
      )}
    </div>
  );
}
