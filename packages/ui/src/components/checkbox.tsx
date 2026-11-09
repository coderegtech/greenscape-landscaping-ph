'use client';
import { CheckIcon } from 'lucide-react';
import { Checkbox as CheckboxPrimitive } from 'radix-ui';
import * as React from 'react';
import { cn } from '../lib/utils';

/** 20px box; wrap in a <label> (Field does) so the hit target reaches 44px. */
function Checkbox({ className, ...props }: React.ComponentProps<typeof CheckboxPrimitive.Root>) {
  return (
    <CheckboxPrimitive.Root
      data-slot="checkbox"
      className={cn(
        'peer size-5 shrink-0 rounded-none border border-muted bg-paper-2 transition-colors duration-(--dur-micro) ease-out hover:border-ink-2 disabled:cursor-not-allowed disabled:opacity-55 aria-invalid:border-danger data-[state=checked]:border-signal data-[state=checked]:bg-signal data-[state=checked]:text-signal-ink',
        className,
      )}
      {...props}
    >
      <CheckboxPrimitive.Indicator data-slot="checkbox-indicator" className="grid place-content-center text-current">
        <CheckIcon className="size-4" strokeWidth={3} />
      </CheckboxPrimitive.Indicator>
    </CheckboxPrimitive.Root>
  );
}

export { Checkbox };
