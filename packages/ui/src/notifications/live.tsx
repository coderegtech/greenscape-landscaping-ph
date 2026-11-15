'use client';
// Live pages: server-rendered pages re-render in place (router.refresh) when what they show changes elsewhere, e.g. an
// employee clocks in while an admin has the attendance board open. Client state (open dialogs, typed text) survives.
import type { LiveTopic } from '@greenscape/validation';
import { useRouter } from 'next/navigation';
import { cn } from '../lib/utils';
import { useLive, useNotifications, type LiveStatus as Status } from './provider';

export function LiveRefresh({ topics }: { topics: LiveTopic[] }) {
  const router = useRouter();
  useLive(topics, () => router.refresh());
  return null;
}

export const STATUS_LABELS: Record<Status, string> = { connecting: 'Connecting…', connected: 'Live', reconnecting: 'Reconnecting…', offline: 'Offline', disconnected: 'Disconnected' };

/** A small dot beside the bell: green when live updates are flowing, amber while reconnecting, grey when offline. */
export function LiveStatus({ className }: { className?: string }) {
  const { signedIn, status } = useNotifications();
  if (!signedIn) return null;
  const label = `Live updates: ${STATUS_LABELS[status]}`;
  return (
    <span role="status" title={label} data-testid="live-status" data-status={status} className={cn('inline-flex size-6 items-center justify-center', className)}>
      <span aria-hidden className={cn('size-2 rounded-full', status === 'connected' ? 'bg-emerald-600' : status === 'offline' || status === 'disconnected' ? 'bg-zinc-400' : 'animate-pulse bg-amber-500')} />
      <span className="sr-only">{label}</span>
    </span>
  );
}
