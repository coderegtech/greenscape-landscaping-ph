'use client';
import { Bell } from 'lucide-react';
import Link from 'next/link';
import { Popover as PopoverPrimitive } from 'radix-ui';
import { useEffect, useRef, useState } from 'react';
import { Button } from '../components/button';
import { NotificationList } from './list';
import { PushToggle } from './push-toggle';
import { useFeed, useNotifications } from './provider';
import { STATUS_LABELS } from './live';
import { SoundToggle } from './sound';

/**
 * Bell with an unread badge and a dropdown of recent notifications. Renders nothing for signed-out visitors.
 * `centerHref` is the full notification centre; the list is only fetched the first time the dropdown opens.
 */
export function NotificationBell({ centerHref }: { centerHref: string }) {
  const { signedIn, unread, status, markAllRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const [opened, setOpened] = useState(false);
  const feed = useFeed({}, opened);
  // Ring once per arrival (not on first load): the key restarts the CSS animation.
  const [rings, setRings] = useState(0);
  const prev = useRef(unread);
  useEffect(() => { if (unread > prev.current) setRings((n) => n + 1); prev.current = unread; }, [unread]);
  if (!signedIn) return null;
  const label = unread ? `Notifications, ${unread} unread` : 'Notifications';
  return (
    <PopoverPrimitive.Root open={open} onOpenChange={(o) => { setOpen(o); if (o) setOpened(true); }}>
      <PopoverPrimitive.Trigger asChild>
        <Button variant="ghost" size="icon-sm" className="relative" aria-label={label} data-testid="notification-bell">
          <Bell key={rings} className={rings ? 'gs-bell-ring' : undefined} />
          {unread > 0 && (
            <span className="absolute -top-0.5 -right-0.5 grid min-w-5 place-items-center rounded-pill bg-signal px-[5px] text-xs font-bold text-signal-ink" data-testid="notification-badge">
              <span key={unread} className="gs-swap-in tabular" aria-hidden>{unread > 99 ? '99+' : unread}</span>
            </span>
          )}
        </Button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="end"
          sideOffset={8}
          collisionPadding={8}
          aria-label="Notifications"
          className="z-[400] flex max-h-[min(34rem,var(--radix-popover-content-available-height))] w-[min(24rem,calc(100vw-1rem))] origin-(--radix-popover-content-transform-origin) flex-col overflow-clip rounded-card border border-rule bg-paper-3 text-ink shadow-lift data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2"
        >
          <div className="flex items-center justify-between gap-2 border-b border-rule px-3 py-2">
            <h2 className="mr-auto font-body text-sm font-bold">Notifications</h2>
            <SoundToggle />
            <Button variant="link" className="text-sm" disabled={unread === 0} onClick={() => void markAllRead()}>
              Mark all as read
            </Button>
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain" data-testid="notification-dropdown">
            <NotificationList items={feed.items.slice(0, 8)} state={feed.state} onOpen={() => setOpen(false)} />
          </div>
          {open && <PushToggle compact />}
          <div className="flex items-center justify-between gap-2 border-t border-rule px-3 py-2 text-sm">
            <span className="text-muted" role="status">{STATUS_LABELS[status]}</span>
            <Link href={centerHref} onClick={() => setOpen(false)} className="font-medium">
              See all and settings
            </Link>
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
      <span className="sr-only" role="status" aria-live="polite">{unread ? `${unread} unread notifications` : ''}</span>
    </PopoverPrimitive.Root>
  );
}
