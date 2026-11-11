'use client';
import type { NotificationView } from '@greenscape/validation';
import { BellOff, X } from 'lucide-react';
import Link from 'next/link';
import { Badge } from '../components/badge';
import { Skeleton } from '../components/skeleton';
import { cn } from '../lib/utils';
import { groupByDay, timeAgo } from './format';
import { useNotifications } from './provider';

function Item({ n, onOpen }: { n: NotificationView; onOpen?: () => void }) {
  const { markRead, remove } = useNotifications();
  const body = (
    <>
      <span aria-hidden className={cn('mt-[0.45rem] size-2 shrink-0 rounded-full', n.read ? 'bg-transparent' : 'bg-signal')} />
      <span className="flex min-w-0 flex-col gap-0.5">
        <span className="flex flex-wrap items-center gap-2">
          <span className={cn('text-sm text-ink', n.read ? 'font-medium' : 'font-bold')}>{n.title}</span>
          {(n.priority === 'URGENT' || n.priority === 'HIGH') && <Badge variant={n.priority === 'URGENT' ? 'danger' : 'muted'}>{n.priority === 'URGENT' ? 'Urgent' : 'Important'}</Badge>}
        </span>
        <span className={cn('text-sm break-words', n.read ? 'text-muted' : 'text-ink-2')}>{n.message}</span>
        <time dateTime={n.createdAt} title={new Date(n.createdAt).toLocaleString('en-PH')} className="text-xs text-muted">
          {timeAgo(n.createdAt)}
        </time>
      </span>
    </>
  );
  const open = () => { if (!n.read) void markRead(n.id); onOpen?.(); };
  const rowClass = 'flex min-w-0 flex-1 items-start gap-3 py-3 pr-2 pl-3 text-left no-underline outline-offset-[-2px]';
  return (
    <li className={cn('gs-notif-in group relative flex items-start border-b border-rule last:border-b-0 hover:bg-paper-3', !n.read && 'bg-paper-2')} data-testid="notification" data-unread={!n.read || undefined}>
      {n.href ? (
        <Link href={n.href} onClick={open} className={rowClass}>
          {body}
        </Link>
      ) : (
        <button type="button" onClick={open} className={rowClass}>
          {body}
        </button>
      )}
      <button
        type="button"
        onClick={() => void remove(n.id)}
        aria-label={`Delete notification: ${n.title}`}
        className="mt-2 mr-2 grid size-8 shrink-0 place-items-center text-muted opacity-60 transition-opacity duration-(--dur-micro) hover:text-ink focus-visible:opacity-100 group-hover:opacity-100 pointer-coarse:opacity-100"
      >
        <X className="size-4" aria-hidden />
      </button>
    </li>
  );
}

export function NotificationList({ items, state, onOpen, empty }: { items: NotificationView[]; state: 'idle' | 'loading' | 'ready' | 'error'; onOpen?: () => void; empty?: string }) {
  if (state === 'idle' || state === 'loading') {
    return (
      <div role="status" aria-label="Loading notifications" className="flex flex-col gap-4 p-4">
        {[0, 1, 2].map((i) => (
          <div key={i} className="flex flex-col gap-2">
            <Skeleton className="h-4 w-2/3" />
            <Skeleton className="h-3 w-full" />
          </div>
        ))}
      </div>
    );
  }
  if (state === 'error' && !items.length) return <p role="alert" className="p-6 text-sm text-ink-2">We could not load your notifications. Check your connection; this page retries when it reconnects.</p>;
  if (!items.length) {
    return (
      <div className="flex flex-col items-center gap-2 p-8 text-center">
        <BellOff className="size-8 text-muted" aria-hidden />
        <p className="text-sm font-medium text-ink">{empty ?? 'You are all caught up'}</p>
        <p className="text-sm text-muted">New notifications show up here as they happen.</p>
      </div>
    );
  }
  return (
    <div>
      {groupByDay(items).map(({ group, items: rows }) => (
        <section key={group} aria-label={group}>
          <h3 className="sticky top-0 z-[1] border-b border-rule bg-paper px-3 py-1.5 font-body text-xs font-medium text-muted">{group}</h3>
          <ul>{rows.map((n) => <Item key={n.id} n={n} onOpen={onOpen} />)}</ul>
        </section>
      ))}
    </div>
  );
}
