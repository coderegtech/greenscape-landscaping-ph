'use client';
import { useCallback, useSyncExternalStore } from 'react';

const EVENT = 'gs-stored';

/**
 * A small per-browser setting kept in localStorage (sidebar collapsed, sound settings). Server and first client render
 * use `fallback`, so markup matches; other tabs follow through the `storage` event. Storage that is blocked or full
 * simply leaves the setting at its fallback for this page.
 */
export function useStored(key: string, fallback: string): [string, (v: string) => void] {
  const value = useSyncExternalStore(
    (notify) => {
      window.addEventListener('storage', notify);
      window.addEventListener(EVENT, notify);
      return () => { window.removeEventListener('storage', notify); window.removeEventListener(EVENT, notify); };
    },
    () => { try { return localStorage.getItem(key) ?? fallback; } catch { return fallback; } },
    () => fallback,
  );
  const set = useCallback((v: string) => {
    try { localStorage.setItem(key, v); } catch { /* private mode or full: not remembered */ }
    window.dispatchEvent(new Event(EVENT));
  }, [key]);
  return [value, set];
}
