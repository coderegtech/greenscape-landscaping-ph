'use client';
import { ChevronDown, Menu, ShoppingBag, UserRound } from 'lucide-react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Button } from '../components/button';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '../components/dropdown-menu';
import { Sheet, SheetContent, SheetDescription, SheetTitle, SheetTrigger } from '../components/sheet';
import { cn } from '../lib/utils';
import { SwapNumber } from '../motion/presence';

export interface NavLink {
  label: string;
  href: string;
}
export type { FooterColumn } from './site-footer';

export interface NavItem extends NavLink {
  children?: NavLink[];
}

const isActive = (path: string, href: string) => (href === '/' ? path === '/' : path === href || path.startsWith(`${href}/`));

export function Wordmark({ className }: { className?: string }) {
  return (
    <Link href="/" className={cn('flex flex-col leading-none text-ink no-underline', className)}>
      <span className="font-display text-xl">Greenscape</span>
      <span className="mt-[3px] text-xs font-medium text-ink-2">Landscaping services</span>
    </Link>
  );
}

const linkClass =
  'inline-flex h-10 items-center gap-1 px-3 text-sm font-medium text-ink-2 no-underline transition-colors duration-(--dur-short) hover:text-ink aria-[current=page]:text-ink aria-[current=page]:underline aria-[current=page]:decoration-signal aria-[current=page]:decoration-[1.5px] aria-[current=page]:underline-offset-[0.45em]';

/**
 * Sticky site header: wordmark, one line of links (menus for groups), one quiet action, account and cart.
 * Below 64rem the links move into a sheet. Data comes from the CMS `navigation` document (Phase 6).
 */
export function SiteHeader({ items, cartCount, quoteHref = '/quote', accountHref = '/account', cartHref = '/cart' }: { items: NavItem[]; cartCount?: number; quoteHref?: string; accountHref?: string; cartHref?: string }) {
  const path = usePathname() ?? '/';
  return (
    <>
      <a href="#main" className="sr-only z-[300] bg-signal px-4 py-3 font-bold text-signal-ink focus:not-sr-only focus:fixed focus:top-2 focus:left-2">
        Skip to content
      </a>
      <header className="sticky top-0 z-[300] border-b border-rule bg-paper">
        <div className="container-page flex h-16 items-center gap-4">
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
                      <DropdownMenuContent align="start" sideOffset={8} className="min-w-56 border-rule bg-paper-2 p-2">
                        {[{ label: `All ${item.label.toLowerCase()}`, href: item.href }, ...item.children].map((c) => (
                          <DropdownMenuItem key={c.href} asChild className="h-10 px-3 text-base text-ink-2 focus:bg-paper-3 focus:text-ink">
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
            <Button asChild variant="secondary" size="sm" className="hidden md:inline-flex">
              <Link href={quoteHref} className="no-underline">Request a quote</Link>
            </Button>
            <Button asChild variant="ghost" size="icon-sm">
              <Link href={accountHref} aria-label="Your account" className="no-underline">
                <UserRound />
              </Link>
            </Button>
            <Button asChild variant="ghost" size="icon-sm" className="relative">
              <Link href={cartHref} aria-label={`Cart, ${cartCount ?? 0} items`} className="no-underline">
                <ShoppingBag />
                {!!cartCount && (
                  <span className="absolute -top-0.5 -right-0.5 grid min-w-5 place-items-center rounded-pill bg-signal px-[5px] text-xs font-bold text-signal-ink">
                    <SwapNumber value={cartCount} label="items in cart" />
                  </span>
                )}
              </Link>
            </Button>

            <Sheet>
              <SheetTrigger asChild>
                <Button variant="ghost" size="icon-sm" className="lg:hidden" aria-label="Open menu">
                  <Menu />
                </Button>
              </SheetTrigger>
              <SheetContent side="right" className="w-[min(22rem,100vw)] overflow-y-auto border-rule bg-paper p-6">
                <SheetTitle className="font-display text-2xl text-ink">Menu</SheetTitle>
                <SheetDescription className="sr-only">Site navigation</SheetDescription>
                <nav aria-label="Main" className="mt-6">
                  <ul className="flex flex-col border-t border-rule">
                    {items.map((item) => (
                      <li key={item.href} className="border-b border-rule py-2">
                        <Link href={item.href} className="flex h-12 items-center font-display text-xl text-ink no-underline" aria-current={isActive(path, item.href) ? 'page' : undefined}>
                          {item.label}
                        </Link>
                        {!!item.children?.length && (
                          <ul className="mb-2 flex flex-col">
                            {item.children.map((c) => (
                              <li key={c.href}>
                                <Link href={c.href} className="flex h-11 items-center pl-4 text-base text-ink-2 no-underline hover:text-ink" aria-current={path === c.href ? 'page' : undefined}>
                                  {c.label}
                                </Link>
                              </li>
                            ))}
                          </ul>
                        )}
                      </li>
                    ))}
                  </ul>
                </nav>
                <Button asChild className="mt-10 w-full">
                  <Link href={quoteHref} className="no-underline">Request a quote</Link>
                </Button>
              </SheetContent>
            </Sheet>
          </div>
        </div>
      </header>
    </>
  );
}
