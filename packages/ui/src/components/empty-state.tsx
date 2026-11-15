import type { ReactNode } from 'react';
import { cn } from '../lib/utils';
import { Illustration, type IllustrationVariant } from './botanical-art';
import { Button } from './button';

type EmptyVariant = Exclude<IllustrationVariant, 'error' | 'offline' | 'forbidden'>;
const SIZE = { sm: 'w-24', md: 'w-36', lg: 'w-52' } as const;

interface EmptyStateProps {
  variant?: EmptyVariant;
  title: string;
  /** Plain text under the title; `children` does the same for JSX (kept for the dashboard's older call sites). */
  description?: string;
  children?: ReactNode;
  /** The older icon-in-a-circle look, used when no variant is given. */
  icon?: ReactNode;
  /** One action only when there is something to do: a link for server pages, a handler from client code. */
  actionLabel?: string;
  actionHref?: string;
  onAction?: () => void;
  size?: keyof typeof SIZE;
  className?: string;
}

/** The request worked and there is nothing to show. For failures use ErrorState; for "filters match nothing" use variant "search". */
export function EmptyState({ variant, title, description, children, icon, actionLabel, actionHref, onAction, size = 'md', className }: EmptyStateProps) {
  const body = description ?? children;
  return (
    <div className={cn('flex flex-col items-center gap-3 px-4 py-8 text-center motion-safe:animate-[gs-card-in_0.5s_ease-out_both]', className)}>
      {variant ? <Illustration variant={variant} className={SIZE[size]} /> : icon && <span aria-hidden className="grid size-11 place-items-center rounded-full bg-paper-2 text-muted [&_svg]:size-5">{icon}</span>}
      <p className="text-base font-semibold text-ink">{title}</p>
      {body && <p className="max-w-sm text-sm text-muted">{body}</p>}
      {actionLabel && (actionHref ? (
        <Button asChild size="sm" variant="secondary"><a href={actionHref}>{actionLabel}</a></Button>
      ) : onAction && <Button size="sm" variant="secondary" onClick={onAction}>{actionLabel}</Button>)}
    </div>
  );
}
