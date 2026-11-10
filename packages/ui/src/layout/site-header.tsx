'use client';
import { ChevronDown, Menu, ShoppingBag, UserRound } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import dynamic from 'next/dynamic';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Button } from '../components/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../components/dropdown-menu';
import { cn } from '../lib/utils';

export interface NavLink {
  label: string;
  href: string;
}
export type { FooterColumn } from './site-footer';

export interface NavItem extends NavLink {
  children?: NavLink[];
}

// Phone menu dialog: fetched on the first tap, not shipped with every page.
const MobileMenu = dynamic(() => import('./mobile-menu'), { ssr: false });

const isActive = (path: string, href: string) => (href === '/' ? path === '/' : path === href || path.startsWith(`${href}/`));

export function Wordmark({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn('flex flex-col leading-none text-ink no-underline', className)}>
      <span className="font-display text-xl">Greenscape</span>
      <span className="mt-[3px] text-xs font-medium text-muted">Landscaping services</span>
    </Link>
  );
}

// Underline grows in on hover and stays under the current page (.gs-navlink in theme.css).
const linkClass =
  'gs-navlink inline-flex h-10 items-center gap-1 px-3 text-sm font-medium text-ink-2 no-underline transition-colors duration-(--dur-short) hover:text-ink aria-[current=page]:text-ink';

/**
 * Sticky site header: wordmark, one line of links (menus for groups), one quiet action, account and cart.
 * Below 64rem the links move into a sheet. Data comes from the CMS `navigation` document (Phase 6).
 */
/** Cart count fetched after load (pages stay static and cacheable); refreshed on navigation and on a `gs:cart` event. */
function useCartCount(url?: string) {
  const pathname = usePathname();
  const [n, setN] = useState<number | undefined>();
  useEffect(() => {
    if (!url) return;
    const ctrl = new AbortController();
    const load = () => fetch(url, { signal: ctrl.signal, cache: 'no-store' }).then((r) => (r.ok ? r.json() : null)).then((d) => d && setN(d.count)).catch(() => undefined);
    void load();
    window.addEventListener('gs:cart', load);
    return () => { ctrl.abort(); window.removeEventListener('gs:cart', load); };
  }, [url, pathname]);
  return n;
}

export function SiteHeader({ items, cartCount: fixedCount, cartCountUrl, quoteHref = '/quote', accountHref = '/account', cartHref = '/cart', notifications }: { items: NavItem[]; cartCount?: number; cartCountUrl?: string; quoteHref?: string; accountHref?: string; cartHref?: string; notifications?: ReactNode }) {
  const fetched = useCartCount(fixedCount === undefined ? cartCountUrl : undefined);
  const cartCount = fixedCount ?? fetched;
  const path = usePathname() ?? '/';
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuLoaded, setMenuLoaded] = useState(false);
  const menuButton = useRef<HTMLButtonElement>(null);
  return (
    <>
      <a href="#main" className="sr-only z-[300] bg-signal px-4 py-3 font-bold text-signal-ink focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        Skip to content
      </a>
      {/* White and sticky; the shadow fades in once the page scrolls (.gs-header, CSS scroll timeline). */}
      <header className="gs-header sticky top-0 z-[300] border-b border-rule bg-paper">
        <div className="container-page flex h-16 items-center gap-4 md:h-[4.5rem]">
          <Wordmark className="mr-auto" />

          <nav aria-label="Main" className="hidden lg:block">
            <ul className="flex items-center">
              {items.map((item) =>
                item.children?.length ? (
                  <li key={item.href}>
                    <DropdownMenu modal={false}>
                      <DropdownMenuTrigger className={cn(linkClass, 'data-[state=open]:text-ink')} aria-current={isActive(path, item.href) ? 'page' : undefined}>
                        {item.label}
                        <ChevronDown aria-hidden className="size-4 transition-transform duration-(--dur-short) in-data-[state=open]:rotate-180" />
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="start" sideOffset={8} className="min-w-56 rounded-control border-rule bg-paper p-2 shadow-(--shadow-lift)">
                        {[{ label: `All ${item.label.toLowerCase()}`, href: item.href }, ...item.children].map((c) => (
                          <DropdownMenuItem key={c.href} asChild className="h-10 rounded-[0.5rem] px-3 text-base text-ink-2 focus:bg-paper-2 focus:text-ink">
                            <Link href={c.href} aria-current={path === c.href ? 'page' : undefined} className="no-underline">
                              {c.label}
                            </Link>
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  </li>
                ) : (
                  <li key={item.href}>
                    <Link href={item.href} className={linkClass} aria-current={isActive(path, item.href) ? 'page' : undefined}>
                      {item.label}
                    </Link>
                  </li>
                ),
              )}
            </ul>
          </nav>

          <div className="flex items-center gap-1">
            <Button asChild size="sm" className="mr-2 hidden md:inline-flex">
              <Link href={quoteHref} className="no-underline">Request a quote</Link>
            </Button>
            <Button asChild variant="ghost" size="icon-sm">
              <Link href={accountHref} aria-label="Your account" className="no-underline">
                <UserRound />
              </Link>
            </Button>
            {notifications}
            <Button asChild variant="ghost" size="icon-sm" className="relative">
              <Link href={cartHref} aria-label={`Cart, ${cartCount ?? 0} items`} className="no-underline">
                <ShoppingBag />
                {!!cartCount && (
                  <span className="absolute -top-0.5 -right-0.5 grid min-w-5 place-items-center rounded-pill bg-lime px-[5px] text-xs font-bold text-ink">
                    {/* key remounts the number so the CSS slide-in replays when the count changes (no animation library) */}
                    <span key={cartCount} className="gs-swap-in tabular" aria-hidden>{cartCount}</span>
                  </span>
                )}
              </Link>
            </Button>

            <Button ref={menuButton} variant="ghost" size="icon-sm" className="lg:hidden" aria-label="Open menu" aria-haspopup="dialog" aria-expanded={menuOpen} onClick={() => { setMenuLoaded(true); setMenuOpen(true); }}>
              <Menu />
            </Button>
            {menuLoaded && <MobileMenu open={menuOpen} onOpenChange={setMenuOpen} items={items} path={path} quoteHref={quoteHref} returnFocus={menuButton} isActive={isActive} />}
          </div>
        </div>
      </header>
    </>
  );
}
