'use client';
// Keeps the open console page and the menu badges current. The API only sends a topic to people who may read it,
// so listening to a topic here grants nothing.
import { LiveRefresh } from '@greenscape/ui/notifications/live';
import { usePathname } from 'next/navigation';
import { topicsFor } from '@/lib/live-topics';

export function ConsoleLive() {
  return <LiveRefresh topics={topicsFor(usePathname())} />;
}
