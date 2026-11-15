import { cn } from '../lib/utils';
import { Illustration } from './botanical-art';
import { Button } from './button';

type Kind = 'error' | 'offline' | 'forbidden';
const COPY: Record<Kind, { title: string; description: string }> = {
  error: { title: 'Something didn’t grow as expected.', description: 'We ran into a problem loading this. Please try again.' },
  offline: { title: 'You’re currently offline.', description: 'Please check your internet connection and try again.' },
  forbidden: { title: 'You don’t have access to this.', description: 'If you think that’s a mistake, ask an administrator to check your role.' },
};

interface ErrorStateProps {
  kind?: Kind;
  title?: string;
  description?: string;
  /** Shows "Try again" (error and offline). */
  onRetry?: () => void;
  homeHref?: string;
  homeLabel?: string;
  /** Support reference only; never a stack trace or API detail. */
  digest?: string;
  compact?: boolean;
  className?: string;
}

/** A failed request, a lost connection or a refused permission. Only the retry and "back" actions; no technical detail. */
export function ErrorState({ kind = 'error', title, description, onRetry, homeHref, homeLabel = 'Back to home', digest, compact, className }: ErrorStateProps) {
  const t = COPY[kind];
  return (
    <div role={kind === 'error' ? 'alert' : 'status'} className={cn('flex flex-col items-center gap-3 text-center motion-safe:animate-[gs-card-in_0.5s_ease-out_both]', compact ? 'px-4 py-8' : 'px-4 py-16', className)}>
      <Illustration variant={kind} className={compact ? 'w-28' : 'w-48'} />
      <h2 className={cn('font-semibold text-ink', compact ? 'text-base' : 'text-2xl')}>{title ?? t.title}</h2>
      <p className="max-w-md text-sm text-muted">{description ?? t.description}</p>
      <div className="mt-1 flex flex-wrap justify-center gap-2">
        {onRetry && kind !== 'forbidden' && <Button size="sm" onClick={onRetry}>{kind === 'offline' ? 'Retry connection' : 'Try again'}</Button>}
        {homeHref && <Button asChild size="sm" variant="secondary"><a href={homeHref}>{homeLabel}</a></Button>}
      </div>
      {digest && <p className="text-xs text-muted">Reference: {digest}</p>}
    </div>
  );
}

/** A big 404 whose zero is a plant. `compact` is the operational version for the admin and employee portals. */
export function NotFoundState({ title, description, homeHref, homeLabel, secondaryHref, secondaryLabel, compact, className }: {
  title: string; description: string; homeHref: string; homeLabel: string; secondaryHref?: string; secondaryLabel?: string; compact?: boolean; className?: string;
}) {
  return (
    <div className={cn('flex flex-col items-center gap-4 px-4 text-center', compact ? 'py-12' : 'py-20', className)}>
      <div aria-hidden className={cn('flex items-end justify-center gap-1 font-bold leading-none text-signal', compact ? 'text-7xl' : 'text-[clamp(5.5rem,20vw,10rem)]')}>
        <span>4</span>
        <svg viewBox="0 0 80 100" className="gs-float h-[0.9em] w-auto overflow-visible" focusable="false">
          <ellipse cx="40" cy="62" rx="30" ry="34" fill="#DCEFE0" stroke="#315C3B" strokeWidth="9" />
          <path d="M40 28V8" stroke="#315C3B" strokeWidth="4" strokeLinecap="round" />
          <path d="M40 16C46 6 56 4 64 8C58 18 48 20 40 16Z" fill="#C9E64A" stroke="#315C3B" strokeWidth="3" strokeLinejoin="round" />
          <path d="M40 22C34 12 24 10 16 14C22 24 32 26 40 22Z" fill="#8CA68A" stroke="#315C3B" strokeWidth="3" strokeLinejoin="round" />
        </svg>
        <span>4</span>
      </div>
      <h1 className={cn('max-w-xl font-semibold text-ink', compact ? 'text-xl' : 'text-3xl')}>{title}</h1>
      <p className="max-w-md text-sm text-muted sm:text-base">{description}</p>
      <div className="flex flex-wrap justify-center gap-2">
        <Button asChild size="sm"><a href={homeHref}>{homeLabel}</a></Button>
        {secondaryHref && <Button asChild size="sm" variant="secondary"><a href={secondaryHref}>{secondaryLabel}</a></Button>}
      </div>
    </div>
  );
}
