'use client';
import { useSyncExternalStore } from 'react';

const subscribe = (cb: () => void) => {
  addEventListener('online', cb);
  addEventListener('offline', cb);
  return () => { removeEventListener('online', cb); removeEventListener('offline', cb); };
};
/** The browser's connection flag. It is a hint (true on a dead Wi-Fi), so a request failure still has to be handled. */
export const useOnline = () => useSyncExternalStore(subscribe, () => navigator.onLine, () => true);

/** Strip above the page while offline. Nothing is cached or queued for later: changes need a connection. */
export function OfflineBanner({ message = 'You’re offline. Changes can’t be saved until your connection is back.' }: { message?: string }) {
  if (useOnline()) return null;
  return <p role="status" className="rounded-lg border border-rule-strong bg-paper-2 px-4 py-2 text-sm text-ink-2">{message}</p>;
}
