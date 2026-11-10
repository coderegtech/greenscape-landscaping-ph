'use client';
import Link from 'next/link';
import type { CSSProperties, RefObject } from 'react';
import { Button } from '../components/button';
import { Sheet, SheetContent, SheetDescription, SheetTitle } from '../components/sheet';
import type { NavItem } from './site-header';

/**
 * The phone menu sheet. Loaded on the first tap of the menu button (site-header.tsx), so the dialog code is not part of
 * every page's first load. Focus returns to the menu button when it closes.
 */
export default function MobileMenu({ open, onOpenChange, items, path, quoteHref, returnFocus, isActive }: { open: boolean; onOpenChange: (o: boolean) => void; items: NavItem[]; path: string; quoteHref: string; returnFocus: RefObject<HTMLButtonElement | null>; isActive: (path: string, href: string) => boolean }) {
  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      {/* Slides in on the drawer curve (300ms in, 200ms out); rows rise in one after another (.gs-stagger). */}
      <SheetContent side="right" className="w-[min(22rem,100vw)] overflow-y-auto rounded-l-card border-rule bg-paper p-6 ease-[cubic-bezier(0.32,0.72,0,1)] data-[state=closed]:duration-200 data-[state=open]:duration-300" onCloseAutoFocus={(e) => { e.preventDefault(); returnFocus.current?.focus(); }}>
        <SheetTitle className="font-display text-2xl text-ink">Menu</SheetTitle>
        <SheetDescription className="sr-only">Site navigation</SheetDescription>
        <nav aria-label="Main" className="mt-6">
          <ul className="gs-stagger flex flex-col border-t border-rule">
            {items.map((item, i) => (
              <li key={item.href} className="border-b border-rule py-2" style={{ '--i': i } as CSSProperties}>
                <Link href={item.href} onClick={() => onOpenChange(false)} className="flex h-12 items-center font-display text-xl text-ink no-underline" aria-current={isActive(path, item.href) ? 'page' : undefined}>
                  {item.label}
                </Link>
                {!!item.children?.length && (
                  <ul className="mb-2 flex flex-col">
                    {item.children.map((c) => (
                      <li key={c.href}>
                        <Link href={c.href} onClick={() => onOpenChange(false)} className="flex h-11 items-center pl-4 text-base text-ink-2 no-underline hover:text-ink" aria-current={path === c.href ? 'page' : undefined}>
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
          <Link href={quoteHref} onClick={() => onOpenChange(false)} className="no-underline">Request a quote</Link>
        </Button>
      </SheetContent>
    </Sheet>
  );
}
