'use client';
import { ChevronDown, Menu, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { MotionConfig, motion } from 'motion/react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Popover as PopoverPrimitive } from 'radix-ui';
import { useState, type ReactNode } from 'react';
import { Button } from '../components/button';
import { LogoMark } from '../components/logo';
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from '../components/sheet';
import { Tooltip, TooltipContent, TooltipTrigger } from '../components/tooltip';
import { useStored } from '../hooks/use-stored';
import { cn } from '../lib/utils';

export interface AdminNavItem {
  label: string;
  href: string;
  icon?: ReactNode;
  /** Things waiting behind this link (orders to send, requests to review). Hidden at 0. */
  badge?: number;
}
export interface AdminNavGroup {
  title: string;
  items: AdminNavItem[];
}
export interface AdminUser {
  name: string;
  email: string;
  roles: string[];
}

const matches = (href: string, path: string) => (href === '/' ? path === '/' : path === href || path.startsWith(`${href}/`));

function Brand({ collapsed }: { collapsed?: boolean }) {
  return (
    <Link href="/" className="flex h-10 items-center gap-3 px-2 text-ink no-underline">
      <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-xl bg-signal text-signal-ink"><LogoMark className="w-6" /></span>
      <span className={cn('flex min-w-0 flex-col leading-tight', collapsed && 'sr-only')}>
        <span className="truncate text-base font-bold">Greenscape</span>
        <span className="truncate text-xs text-muted">Admin console</span>
      </span>
    </Link>
  );
}

function NavList({ groups, path, collapsed, id, onNavigate }: { groups: AdminNavGroup[]; path: string; collapsed?: boolean; id: string; onNavigate?: () => void }) {
  // The longest matching link wins, so /employees/schedules does not also light up /employees.
  const active = groups.flatMap((g) => g.items).filter((i) => matches(i.href, path)).sort((a, b) => b.href.length - a.href.length)[0]?.href;
  return (
    <nav aria-label="Admin" className="flex flex-col gap-5">
      {groups.map((g) => (
        <div key={g.title} role="group" aria-label={g.title}>
          <p aria-hidden className={cn('px-3 pb-1 text-xs font-semibold text-muted', collapsed && 'mx-3 mb-2 h-px overflow-hidden bg-rule p-0 text-transparent')}>{g.title}</p>
          <ul className="flex flex-col gap-0.5">
            {g.items.map((it) => {
              const on = it.href === active;
              const link = (
                <Link
                  href={it.href}
                  onClick={onNavigate}
                  aria-current={on ? 'page' : undefined}
                  className={cn(
                    'relative flex h-10 items-center gap-3 rounded-lg px-3 text-sm font-medium text-ink-2 no-underline transition-colors duration-150 hover:bg-paper-2 hover:text-ink aria-[current=page]:font-semibold aria-[current=page]:text-ink [&_svg]:size-[1.125rem] [&_svg]:shrink-0',
                    collapsed && 'justify-center px-0',
                  )}
                >
                  {on && <motion.span layoutId={`nav-active-${id}`} aria-hidden className="absolute inset-0 rounded-lg bg-paper-2 shadow-[inset_3px_0_0_var(--gs-signal)]" transition={{ duration: 0.2, ease: [0.23, 1, 0.32, 1] }} />}
                  <span className="relative grid place-items-center" aria-hidden>
                    {it.icon}
                    {collapsed && !!it.badge && <span className="absolute -top-1 -right-1 size-2 rounded-full bg-signal" />}
                  </span>
                  <span className={cn('relative min-w-0 flex-1 truncate', collapsed && 'sr-only')}>{it.label}</span>
                  {!!it.badge && (
                    <span className={cn('tabular relative rounded-pill bg-signal px-1.5 text-xs leading-5 font-bold text-signal-ink', collapsed && 'sr-only')}>
                      {it.badge > 99 ? '99+' : it.badge}
                      <span className="sr-only"> waiting</span>
                    </span>
                  )}
                </Link>
              );
              return (
                <li key={it.href}>
                  {collapsed ? (
                    <Tooltip>
                      <TooltipTrigger asChild>{link}</TooltipTrigger>
                      <TooltipContent side="right">{it.label}{it.badge ? ` (${it.badge})` : ''}</TooltipContent>
                    </Tooltip>
                  ) : link}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

const initials = (name: string) => name.split(/[\s@._-]+/).filter(Boolean).slice(0, 2).map((p) => p[0]!.toUpperCase()).join('') || '?';

/** Who is signed in, with links and sign-out. A popover (not a menu) so the sign-out form stays a plain, tabbable form. */
function ProfileMenu({ user, children }: { user: AdminUser; children?: ReactNode }) {
  return (
    <PopoverPrimitive.Root>
      <PopoverPrimitive.Trigger asChild>
        <button type="button" className="press flex h-10 items-center gap-2 rounded-pill border border-rule bg-paper-3 py-1 pr-2 pl-1 text-sm font-medium text-ink hover:bg-paper-2" data-testid="account-menu">
          <span className="grid size-8 place-items-center rounded-full bg-signal text-xs font-bold text-signal-ink">{initials(user.name)}</span>
          <span className="hidden max-w-40 truncate md:inline">{user.name}</span>
          <span className="sr-only">, account menu</span>
          <ChevronDown aria-hidden className="size-4 text-muted" />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="end"
          sideOffset={8}
          collisionPadding={8}
          aria-label="Account"
          className="z-[400] flex w-[min(18rem,calc(100vw-1rem))] origin-(--radix-popover-content-transform-origin) flex-col gap-3 rounded-card border border-rule bg-paper-3 p-4 text-ink shadow-lift data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[state=open]:animate-in data-[state=open]:fade-in-0 data-[state=open]:zoom-in-95"
        >
          <div className="flex min-w-0 flex-col gap-0.5">
            <span className="truncate text-sm font-bold">{user.name}</span>
            <span className="truncate text-xs text-muted">{user.email}</span>
            <span className="mt-1 flex flex-wrap gap-1">
              {user.roles.map((r) => <span key={r} className="tone-green rounded-pill bg-(--tone-soft) px-2 py-0.5 text-xs font-semibold text-(--tone-ink)">{r.replaceAll('_', ' ')}</span>)}
            </span>
          </div>
          {children}
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

/**
 * Admin app frame: a dark sidebar (≥ 64rem; it collapses to an icon rail and remembers that) or a drawer on smaller
 * screens, a top bar with the page title, actions and the account menu, and a content column capped at 96rem.
 * Callers filter `groups` by the user's permissions; `account` is the content of the account menu (links, sign out).
 */
export function AdminShell({ groups, title, user, account, actions, children }: { groups: AdminNavGroup[]; title: string; user: AdminUser; account?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  const path = usePathname() ?? '/';
  const [nav, setNav] = useStored('gs-admin-nav', 'open');
  const collapsed = nav === 'rail';
  const [drawer, setDrawer] = useState(false);
  return (
    <MotionConfig reducedMotion="user">
      <div className="flex min-h-dvh">
        <a href="#main" className="sr-only z-[300] rounded-lg bg-signal px-4 py-3 font-bold text-signal-ink focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
          Skip to content
        </a>
        {/* Width is the one layout property animated here: the content column has to follow the sidebar. */}
        <aside
          data-collapsed={collapsed || undefined}
          className="band-sidebar sticky top-0 hidden h-dvh w-64 shrink-0 flex-col gap-6 overflow-x-clip overflow-y-auto p-3 transition-[width] duration-200 ease-(--ease-out) data-collapsed:w-[4.5rem] lg:flex"
          data-testid="sidebar"
        >
          <Brand collapsed={collapsed} />
          <NavList groups={groups} path={path} collapsed={collapsed} id="side" />
          <div className={cn('mt-auto flex min-w-0 flex-col gap-0.5 border-t border-rule px-2 pt-3 text-xs', collapsed && 'sr-only')} data-testid="staff-identity">
            <span className="truncate text-ink">{user.email}</span>
            <span className="truncate text-muted">({user.roles.join(', ')})</span>
          </div>
        </aside>
        <div className="flex min-w-0 flex-1 flex-col">
          <header className="sticky top-0 z-[200] flex h-[calc(4rem+env(safe-area-inset-top))] items-center gap-2 border-b border-rule bg-paper/90 px-4 pt-[env(safe-area-inset-top)] backdrop-blur md:px-6">
            <Sheet open={drawer} onOpenChange={setDrawer}>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon-sm" className="lg:hidden" aria-label="Open menu">
                  <Menu />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="band-sidebar w-[min(18rem,100vw)] gap-6 overflow-y-auto border-r-0 p-3 pt-[max(0.75rem,env(safe-area-inset-top))]">
                <SheetTitle className="sr-only">Greenscape Admin</SheetTitle>
                <SheetDescription className="sr-only">Admin navigation</SheetDescription>
                <Brand />
                <NavList groups={groups} path={path} id="drawer" onNavigate={() => setDrawer(false)} />
              </SheetContent>
            </Sheet>
            <Button variant="ghost" size="icon-sm" className="hidden lg:inline-flex" aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'} aria-pressed={collapsed} onClick={() => setNav(collapsed ? 'open' : 'rail')} data-testid="sidebar-toggle">
              {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
            </Button>
            <h1 className="mr-auto truncate text-base text-ink">{title}</h1>
            {actions}
            <ProfileMenu user={user}>{account}</ProfileMenu>
          </header>
          <main id="main" className="w-full max-w-(--container-admin) flex-1 p-4 md:p-6 lg:p-8">
            {children}
          </main>
        </div>
      </div>
    </MotionConfig>
  );
}
