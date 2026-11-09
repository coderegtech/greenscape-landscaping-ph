import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import * as React from 'react';
import { cn } from '../lib/utils';

/** Tags and statuses: body face, a step smaller, sentence case, untracked. Never a status dot. */
const badgeVariants = cva(
  'inline-flex w-fit shrink-0 items-center gap-1 whitespace-nowrap rounded-pill border px-2 py-0.5 text-xs font-medium [&>svg]:pointer-events-none [&>svg]:size-3',
  {
    variants: {
      variant: {
        outline: 'border-rule-strong text-ink-2',
        signal: 'border-signal bg-signal text-signal-ink',
        muted: 'border-transparent bg-paper-3 text-ink-2',
        danger: 'border-danger text-danger',
      },
    },
    defaultVariants: { variant: 'outline' },
  },
);

function Badge({ className, variant, asChild = false, ...props }: React.ComponentProps<'span'> & VariantProps<typeof badgeVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot.Root : 'span';
  return <Comp data-slot="badge" className={cn(badgeVariants({ variant }), className)} {...props} />;
}

export { Badge, badgeVariants };
