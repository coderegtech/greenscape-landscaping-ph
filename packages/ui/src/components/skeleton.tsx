import { cn } from '../lib/utils';

/** Placeholder block in the layout's final size (no layout shift). Pulse stops under reduced motion. */
function Skeleton({ className, ...props }: React.ComponentProps<'div'>) {
  return <div data-slot="skeleton" aria-hidden className={cn('animate-pulse rounded-none bg-paper-3', className)} {...props} />;
}

export { Skeleton };
