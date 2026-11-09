import * as React from 'react';
import { cn } from '../lib/utils';

/** Square field on the deeper paper; constant 1px border, focus via the global inset outline, 16px+ text (no iOS zoom). */
export const fieldClass =
  'w-full min-w-0 rounded-none border border-muted bg-paper-2 px-3 text-base text-ink placeholder:text-muted transition-colors duration-(--dur-short) ease-out hover:border-ink-2 disabled:cursor-not-allowed disabled:opacity-55 aria-invalid:border-danger';

function Input({ className, type = 'text', ...props }: React.ComponentProps<'input'>) {
  return <input type={type} data-slot="input" className={cn(fieldClass, 'h-12', className)} {...props} />;
}

export { Input };
