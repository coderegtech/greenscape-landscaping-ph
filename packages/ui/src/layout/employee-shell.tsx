'use client';
import { LogoMark } from '../components/logo';
import { NotificationBell } from '../notifications/bell';
import { SoundToggle } from '../notifications/sound';
import { LiveRefresh, LiveStatus } from '../notifications/live';
import { CalendarCheck, CalendarClock, FileText, Home, UserRound, type LucideIcon } from 'lucide-react';
import { MotionConfig, motion } from 'motion/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';

const NAV: { href: string; label: string; icon: LucideIcon }[] = [
  { href: '/', label: 'Dashboard', icon: Home },
  { href: '/attendance', label: 'Attendance', icon: CalendarCheck },
  { href: '/schedule', label: 'Schedule', icon: CalendarClock },
  { href: '/requests', label: 'Requests', icon: FileText },
  { href: '/profile', label: 'Profile', icon: UserRound },
];

/**
 * Portal frame: a top bar (brand, navigation on wide screens, sound switch, bell) and, on phones, a bottom navigation
 * bar with the five destinations. `pending` is the number of the employee's own requests still waiting for HR.
 */
export function PortalShell({ name, pending, children }: { name: string; pending: number; children: ReactNode }) {
  const path = usePathname() ?? '/';
  const on = (href: string) => (href === '/' ? path === '/' : path === href || path.startsWith(`${href}/`));
  const initials = name.split(/\s+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('');
  const badge = (href: string) => (href === '/requests' && pending > 0 ? pending : 0);
  return (
    <MotionConfig reducedMotion="user">
      <a href="#main" className="sr-only z-[300] rounded-lg bg-signal px-4 py-3 font-bold text-signal-ink focus:not-sr-only focus:fixed focus:top-2 focus:left-2">Skip to content</a>
      <header className="sticky top-0 z-[200] border-b border-rule bg-paper/90 backdrop-blur">
        <div className="mx-auto flex h-16 w-full max-w-[64rem] items-center gap-2 px-4 md:px-6">
          <Link href="/" className="mr-auto flex items-center gap-2.5 text-ink no-underline md:mr-6">
            <span aria-hidden className="grid size-9 place-items-center rounded-xl bg-signal-deep text-signal-ink"><LogoMark className="w-6" /></span>
            <span className="text-base font-bold">Greenscape<span className="sr-only"> employee portal</span></span>
          </Link>
          <nav aria-label="Portal" className="mr-auto hidden items-center gap-1 md:flex">
            {NAV.slice(0, 4).map((n) => (
              <Link key={n.href} href={n.href} aria-current={on(n.href) ? 'page' : undefined} className="relative flex h-10 items-center gap-2 rounded-pill px-3.5 text-sm font-semibold text-ink-2 no-underline transition-colors duration-150 hover:text-ink aria-[current=page]:text-signal-2">
                {on(n.href) && <motion.span layoutId="top-nav" aria-hidden className="tone-green absolute inset-0 rounded-pill bg-(--tone-soft)" transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }} />}
                <n.icon aria-hidden className="relative size-4" />
                <span className="relative">{n.label}</span>
                {badge(n.href) > 0 && <span className="tone-orange tabular relative rounded-pill bg-(--tone-soft) px-1.5 text-xs leading-5 font-bold text-(--tone-ink)">{badge(n.href)}<span className="sr-only"> waiting</span></span>}
              </Link>
            ))}
          </nav>
          <LiveStatus />
          <SoundToggle />
          <NotificationBell centerHref="/notifications" />
          <Link href="/profile" aria-current={on('/profile') ? 'page' : undefined} className="press hidden size-10 place-items-center rounded-full bg-signal text-sm font-bold text-signal-ink no-underline outline-offset-2 aria-[current=page]:outline-2 aria-[current=page]:outline-signal md:grid">
            {initials}<span className="sr-only"> profile</span>
          </Link>
        </div>
      </header>
      {/* The API sends an employee only changes to their own records: a punch from another device, a decision by HR. */}
      <LiveRefresh topics={['attendance', 'corrections', 'leave', 'schedule', 'employees']} />
      <main id="main" className="mx-auto w-full max-w-[64rem] px-4 pt-6 pb-28 md:px-6 md:pt-8 md:pb-16">{children}</main>
      <nav aria-label="Portal" className="fixed inset-x-0 bottom-0 z-[200] border-t border-rule bg-paper-3/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden" data-testid="bottom-nav">
        <ul className="mx-auto grid max-w-md grid-cols-5">
          {NAV.map((n) => (
            <li key={n.href}>
              <Link href={n.href} aria-current={on(n.href) ? 'page' : undefined} className="press relative flex h-16 flex-col items-center justify-center gap-1 text-[0.6875rem] font-semibold text-muted no-underline aria-[current=page]:text-signal-2">
                {on(n.href) && <motion.span layoutId="bottom-nav" aria-hidden className="tone-green absolute top-1.5 h-8 w-14 rounded-pill bg-(--tone-soft)" transition={{ duration: 0.22, ease: [0.23, 1, 0.32, 1] }} />}
                <span className="relative">
                  <n.icon aria-hidden className="size-5" />
                  {badge(n.href) > 0 && <span className="tone-orange tabular absolute -top-1.5 -right-3 rounded-pill bg-(--tone) px-1 text-[0.625rem] leading-4 font-bold text-ink">{badge(n.href)}<span className="sr-only"> waiting</span></span>}
                </span>
                <span className="relative">{n.label}</span>
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </MotionConfig>
  );
}
