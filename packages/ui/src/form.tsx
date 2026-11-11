'use client';
// Form primitives used by every form (auth, quote, checkout, admin). API kept from Phase 4.
import { useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { Button } from './components/button';
import { Input } from './components/input';
import { cn } from './lib/utils';

type FieldProps = InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: ReactNode };

/** Label + input + hint/error, wired with aria-describedby / aria-invalid. Space for the message is reserved (no jump). */
export function Field({ label, error, hint, className, ...input }: FieldProps) {
  const id = useId();
  const describedBy = [error && `${id}-error`, hint && `${id}-hint`].filter(Boolean).join(' ') || undefined;
  return (
    <div className="flex flex-col gap-1">
      <label htmlFor={id} className="text-sm font-medium text-ink">
        {label}
      </label>
      <Input id={id} aria-invalid={error ? true : undefined} aria-describedby={describedBy} className={className} {...input} />
      <div className="min-h-[1lh] pb-2 text-sm">
        {error ? (
          <p id={`${id}-error`} className="text-danger">{error}</p>
        ) : hint ? (
          <p id={`${id}-hint`} className="text-muted">{hint}</p>
        ) : null}
      </div>
    </div>
  );
}

export function SubmitButton({ pending, children, className }: { pending: boolean; children: ReactNode; className?: string }) {
  return (
    <Button type="submit" loading={pending} className={cn('w-full sm:w-auto', className)}>
      {children}
    </Button>
  );
}

/** Banner for form results. Errors are role=alert (assertive), successes role=status (polite). */
export function Notice({ tone, children }: { tone: 'error' | 'success'; children: ReactNode }) {
  return (
    <div
      role={tone === 'error' ? 'alert' : 'status'}
      className={cn('border-l-2 px-4 py-3 text-base', tone === 'error' ? 'border-danger bg-paper-2 text-ink' : 'border-signal bg-paper-2 text-ink')}
    >
      {children}
    </div>
  );
}

export function AuthCard({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <main id="main" className="container-page py-12 md:py-20">
      <div className="hero-in mx-auto w-full max-w-[30rem] rounded-[var(--radius-card)] border border-rule bg-paper p-6 shadow-soft md:p-10">
        <h1 className="mb-8 text-4xl text-ink">{title}</h1>
        <div className="flex flex-col gap-6">{children}</div>
        {footer && <div className="mt-8 border-t border-rule pt-6 text-base text-ink-2">{footer}</div>}
      </div>
    </main>
  );
}
