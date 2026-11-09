'use client';
import { Menu } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import type { ReactNode } from 'react';
import { Button } from '../components/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from '../components/sheet';

export interface AdminNavGroup {
  title: string;
  items: { label: string; href: string; icon?: ReactNode }[];
}

function NavList({ groups, path }: { groups: AdminNavGroup[]; path: string }) {
  return (
    <nav aria-label="Admin" className="flex flex-col gap-6">
      {groups.map((g) => (
        <div key={g.title}>
          <h2 className="px-3 text-xs font-medium text-muted">{g.title}</h2>
          <ul className="mt-1 flex flex-col">
            {g.items.map((it) => {
              const active = it.href === '/' ? path === '/' : path === it.href || path.startsWith(`${it.href}/`);
              return (
                <li key={it.href}>
                  <Link
                    href={it.href}
                    aria-current={active ? 'page' : undefined}
                    className="flex h-10 items-center gap-3 px-3 text-sm font-medium text-ink-2 no-underline transition-colors duration-(--dur-short) hover:bg-paper-2 hover:text-ink aria-[current=page]:bg-paper-2 aria-[current=page]:text-ink aria-[current=page]:shadow-[inset_2px_0_0_var(--gs-signal)] [&_svg]:size-4 [&_svg]:shrink-0"
                  >
                    {it.icon}
                    {it.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </nav>
  );
}

/**
 * Admin app frame: sidebar (≥ 64rem) or sheet menu, a top bar with the page title and account slot,
 * and a content column capped at 96rem. Callers filter `groups` by the user's permissions.
 */
export function AdminShell({ groups, title, account, actions, children }: { groups: AdminNavGroup[]; title: string; account?: ReactNode; actions?: ReactNode; children: ReactNode }) {
  const path = usePathname() ?? '/';
  return (
    <div className="grid min-h-dvh lg:grid-cols-[15rem_minmax(0,1fr)]">
      <a href="#main" className="sr-only z-[300] bg-signal px-4 py-3 font-bold text-signal-ink focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        Skip to content
      </a>
      <aside className="sticky top-0 hidden h-dvh flex-col gap-10 overflow-y-auto border-r border-rule bg-paper-3 p-4 lg:flex">
        <Link href="/" className="px-3 font-display text-xl text-ink no-underline">Greenscape</Link>
        <NavList groups={groups} path={path} />
      </aside>
      <div className="flex min-w-0 flex-col">
        <header className="sticky top-0 z-[200] flex h-14 items-center gap-3 border-b border-rule bg-paper px-4 md:px-6">
          <Sheet>
            <SheetTrigger asChild>
              <Button variant="ghost" size="icon-sm" className="lg:hidden" aria-label="Open menu">
                <Menu />
              </Button>
            </SheetTrigger>
            <SheetContent side="left" className="w-[min(18rem,100vw)] overflow-y-auto bg-paper-3 p-4">
              <SheetTitle className="px-3 font-display text-xl text-ink">Greenscape</SheetTitle>
              <SheetDescription className="sr-only">Admin navigation</SheetDescription>
              <div className="mt-6">
                <NavList groups={groups} path={path} />
              </div>
            </SheetContent>
          </Sheet>
          <h1 className="mr-auto truncate font-body text-base font-bold text-ink">{title}</h1>
          {actions}
          {account}
        </header>
        <main id="main" className="w-full max-w-(--container-admin) flex-1 p-4 md:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}
