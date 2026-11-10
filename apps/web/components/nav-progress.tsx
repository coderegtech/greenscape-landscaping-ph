'use client';
import { usePathname, useSearchParams } from 'next/navigation';
import { useEffect, useRef } from 'react';

/**
 * Route loading state: a slim bar under the header while the next page renders. It replaces route `loading.tsx`
 * files, which made every page stream a placeholder first and stay on it without JavaScript.
 * Starts on a same-site link click (after 120 ms, so fast navigations never flash) and ends when the URL changes.
 * (No defaultPrevented check: next/link prevents the default before this document listener runs.)
 */
export function NavProgress() {
  const ref = useRef<HTMLDivElement>(null);
  const timer = useRef(0);
  const path = usePathname();
  const search = useSearchParams();
  useEffect(() => {
    clearTimeout(timer.current);
    const el = ref.current;
    if (el) delete el.dataset.on;
  }, [path, search]);
  useEffect(() => {
    const off = () => {
      clearTimeout(timer.current);
      if (ref.current) delete ref.current.dataset.on;
    };
    const click = (e: MouseEvent) => {
      const a = (e.target as Element).closest?.('a[href]') as HTMLAnchorElement | null;
      if (!a || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || a.target === '_blank' || a.hasAttribute('download')) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || (url.pathname === location.pathname && url.search === location.search)) return;
      clearTimeout(timer.current);
      timer.current = window.setTimeout(() => {
        if (ref.current) ref.current.dataset.on = '';
        timer.current = window.setTimeout(off, 10_000); // never stuck if the navigation fails or lands on the same URL
      }, 120);
    };
    document.addEventListener('click', click);
    window.addEventListener('popstate', off);
    return () => {
      off();
      document.removeEventListener('click', click);
      window.removeEventListener('popstate', off);
    };
  }, []);
  return <div ref={ref} aria-hidden className="gs-progress" />;
}
