'use client';
import { usePathname } from 'next/navigation';
import { useEffect, useRef } from 'react';

/**
 * Counts a page view (cookieless; nothing is stored in the browser). The referrer goes with the first view only, since
 * later views are in-site navigations. The server ignores visitors who send Global Privacy Control or Do Not Track.
 */
export function PageView() {
  const path = usePathname();
  const first = useRef(true);
  useEffect(() => {
    const body = JSON.stringify({ path, referrer: first.current ? document.referrer : '' });
    first.current = false;
    if (!navigator.sendBeacon?.('/api/collect', body)) void fetch('/api/collect', { method: 'POST', body, keepalive: true }).catch(() => undefined);
  }, [path]);
  return null;
}
