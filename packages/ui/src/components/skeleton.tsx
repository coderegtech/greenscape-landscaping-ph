import { cn } from '../lib/utils';

/** Placeholder block in the layout's final size (no layout shift). Shimmer by default; `pulse` for tiny inline spots. Both stop under reduced motion. */
function Skeleton({ className, variant = 'shimmer', ...props }: React.ComponentProps<'div'> & { variant?: 'shimmer' | 'pulse' }) {
  return <div data-slot="skeleton" aria-hidden className={cn(variant === 'pulse' ? 'animate-pulse bg-rule' : 'skeleton', 'rounded-md', className)} {...props} />;
}

export { Skeleton };
