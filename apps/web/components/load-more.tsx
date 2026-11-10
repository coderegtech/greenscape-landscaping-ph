'use client';
import { Spinner, buttonVariants } from '@greenscape/ui/components/button';
import Link, { useLinkStatus } from 'next/link';

function Pending() {
  const { pending } = useLinkStatus();
  return pending ? <Spinner /> : null;
}

/**
 * "Show more" for long server-rendered grids: a plain link to the same page with a larger `show` count, so it works
 * without JavaScript and is shareable. Scroll position is kept; a spinner shows while the next page renders.
 */
export function LoadMore({ href, shown, total }: { href: string; shown: number; total: number }) {
  return (
    <div className="mt-12 flex flex-col items-center gap-3">
      <p className="text-sm text-muted tabular" aria-live="polite">
        Showing {shown} of {total}
      </p>
      <Link href={href} scroll={false} className={buttonVariants({ variant: 'secondary' }) + ' no-underline'}>
        <Pending />
        Show more
      </Link>
    </div>
  );
}
