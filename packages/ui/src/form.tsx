'use client';
// Minimal accessible form primitives. Phase 5 replaces the styling with the design system; the API stays.
import { useId, type InputHTMLAttributes, type ReactNode } from 'react';

type FieldProps = InputHTMLAttributes<HTMLInputElement> & { label: string; error?: string; hint?: ReactNode };

export function Field({ label, error, hint, className, ...input }: FieldProps) {
  const id = useId();
  const describedBy = [error && `${id}-error`, hint && `${id}-hint`].filter(Boolean).join(' ') || undefined;
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={id} className="text-sm font-medium text-ink">{label}</label>
      <input
        id={id}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy}
        className={`h-11 rounded-md border bg-white px-3 text-base outline-none transition-colors focus-visible:ring-2 focus-visible:ring-forest-700/40 ${error ? 'border-red-600' : 'border-neutral-300 focus:border-forest-700'} ${className ?? ''}`}
        {...input}
      />
      {hint && !error && <p id={`${id}-hint`} className="text-xs text-neutral-600">{hint}</p>}
      {error && <p id={`${id}-error`} className="text-sm text-red-700">{error}</p>}
    </div>
  );
}

export function SubmitButton({ pending, children }: { pending: boolean; children: ReactNode }) {
  return (
    <button
      type="submit"
      disabled={pending}
      aria-busy={pending}
      className="inline-flex h-11 items-center justify-center gap-2 rounded-md bg-forest-900 px-5 font-medium text-white transition-[transform,background-color] hover:bg-forest-700 active:scale-[0.98] disabled:cursor-progress disabled:opacity-70"
    >
      {pending && <span aria-hidden className="size-4 animate-spin rounded-full border-2 border-white/40 border-t-white" />}
      {children}
    </button>
  );
}

/** Polite live region so screen readers hear success/error banners. */
export function Notice({ tone, children }: { tone: 'error' | 'success'; children: ReactNode }) {
  return (
    <div role={tone === 'error' ? 'alert' : 'status'} className={`rounded-md px-4 py-3 text-sm ${tone === 'error' ? 'bg-red-50 text-red-800' : 'bg-green-50 text-forest-900'}`}>
      {children}
    </div>
  );
}

export function AuthCard({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-md flex-col justify-center px-4 py-12">
      <h1 className="mb-6 text-3xl font-semibold text-forest-900">{title}</h1>
      <div className="flex flex-col gap-5">{children}</div>
      {footer && <div className="mt-6 text-sm text-neutral-700">{footer}</div>}
    </main>
  );
}
