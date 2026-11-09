import { cva, type VariantProps } from 'class-variance-authority';
import { Slot } from 'radix-ui';
import * as React from 'react';
import { cn } from '../lib/utils';

/*
 * One primary (chartreuse pill) per screen; secondary is an outlined pill; ghost and link are typographic.
 * States: hover lightens (colour only), active presses 2% (transform), focus-visible uses the global outline,
 * disabled is opacity 0.55 + not-allowed, loading keeps the label and adds a spinner after 150 ms.
 */
const buttonVariants = cva(
  'relative inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded-pill font-body font-bold transition-[background-color,border-color,color,transform] duration-(--dur-short) ease-out active:scale-[0.98] active:duration-(--dur-micro) disabled:cursor-not-allowed disabled:opacity-55 aria-disabled:cursor-not-allowed aria-disabled:opacity-55 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*="size-"])]:size-4',
  {
    variants: {
      variant: {
        primary: 'border-[1.5px] border-signal bg-signal text-signal-ink hover:border-signal-2 hover:bg-signal-2',
        secondary: 'border-[1.5px] border-signal bg-transparent text-signal hover:bg-signal/10',
        ghost: 'border-[1.5px] border-transparent text-ink hover:bg-paper-3',
        danger: 'border-[1.5px] border-danger bg-transparent text-danger hover:bg-danger/10',
        link: 'h-auto rounded-none px-0 font-medium text-ink underline decoration-signal decoration-1 underline-offset-[0.2em] hover:decoration-2',
      },
      size: {
        md: 'h-12 px-6 text-sm',
        sm: 'h-10 px-4 text-sm',
        icon: 'size-12',
        'icon-sm': 'size-10',
      },
    },
    compoundVariants: [{ variant: 'link', className: 'h-auto px-0' }],
    defaultVariants: { variant: 'primary', size: 'md' },
  },
);

type ButtonProps = React.ComponentProps<'button'> &
  VariantProps<typeof buttonVariants> & {
    asChild?: boolean;
    /** Shows a spinner (after 150 ms, so fast actions don't flicker) and blocks repeat submits. */
    loading?: boolean;
  };

function Button({ className, variant, size, asChild = false, loading = false, children, disabled, type, ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : 'button';
  return (
    <Comp
      data-slot="button"
      data-variant={variant ?? 'primary'}
      className={cn(buttonVariants({ variant, size }), className)}
      disabled={asChild ? undefined : disabled || loading}
      aria-busy={loading || undefined}
      type={asChild ? undefined : (type ?? 'button')}
      {...props}
    >
      {asChild ? (
        children
      ) : (
        <>
          {loading && (
            <span className="inline-flex animate-[gs-appear_1ms_150ms_both]">
              <Spinner />
            </span>
          )}
          {children}
        </>
      )}
    </Comp>
  );
}

function Spinner({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn('keep-motion inline-block size-4 animate-spin rounded-full border-2 border-current border-r-transparent', className)}
    />
  );
}

export { Button, Spinner, buttonVariants };
export type { ButtonProps };
