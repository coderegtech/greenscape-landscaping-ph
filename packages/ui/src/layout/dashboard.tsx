// Building blocks shared by the admin and employee portals. Server components (only the count-up is client code).
// Colour comes from a tone class (theme.css): every tone is paired with words or an icon, never used alone.
import Link from 'next/link';
import type { ComponentProps, CSSProperties, ReactNode } from 'react';
import { cn } from '../lib/utils';
import { Counter } from '../motion/counter';

export type Tone = 'green' | 'blue' | 'purple' | 'orange' | 'red' | 'gray' | 'lime';

/** White surface with the portal radius, hairline and soft shadow. */
export function Card({ className, ...props }: ComponentProps<'div'>) {
  return <div className={cn('rounded-card border border-rule bg-paper-3 shadow-soft', className)} {...props} />;
}

/** Page title row: heading and one line of context on the left, actions on the right. */
export function PageHeader({ title, description, children, level = 2 }: { title: ReactNode; description?: ReactNode; children?: ReactNode; level?: 1 | 2 }) {
  const H = level === 1 ? 'h1' : 'h2';
  return (
    <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="flex min-w-0 flex-col gap-1">
        <H className="text-3xl">{title}</H>
        {description && <p className="text-sm text-muted">{description}</p>}
      </div>
      {children && <div className="flex flex-wrap items-center gap-2">{children}</div>}
    </div>
  );
}

/** Icon on a tinted tile. */
export function IconTile({ tone, className, children }: { tone: Tone; className?: string; children: ReactNode }) {
  return (
    <span aria-hidden className={cn(`tone-${tone}`, 'grid size-10 shrink-0 place-items-center rounded-xl bg-(--tone-soft) text-(--tone-ink) [&_svg]:size-5', className)}>
      {children}
    </span>
  );
}

export interface StatProps {
  label: string;
  /** Shown as given. For a count-up pass `count` as well: the server HTML still carries the final figure. */
  value?: ReactNode;
  count?: { value: number; prefix?: string; suffix?: string; decimals?: number };
  icon: ReactNode;
  tone: Tone;
  /** Supporting detail under the figure. */
  note?: ReactNode;
  /** Change against a named period, e.g. { text: '+12%', period: 'vs yesterday', direction: 'up' }. Only real comparisons. */
  trend?: { text: string; period: string; direction: 'up' | 'down' | 'flat' };
  href?: string;
  testId?: string;
  /** Position in its row, for the staggered entrance. */
  index?: number;
  className?: string;
}

/** One metric: label, icon, figure, optional trend and detail. The whole card is the link when `href` is set. */
export function StatCard({ label, value, count, icon, tone, note, trend, href, testId, index = 0, className }: StatProps) {
  return (
    <li
      className={cn(`tone-${tone}`, 'stat-card card-in lift-card relative flex min-w-0 flex-col gap-3 rounded-card border border-rule bg-paper-3 p-4 shadow-soft md:p-5', className)}
      style={{ '--i': index } as CSSProperties}
      data-testid={testId}
    >
      <div className="flex items-start justify-between gap-3">
        {href ? (
          <Link href={href} className="text-sm font-medium text-ink-2 no-underline after:absolute after:inset-0 after:rounded-card">{label}</Link>
        ) : (
          <span className="text-sm font-medium text-ink-2">{label}</span>
        )}
        <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl bg-paper-3 text-(--tone-ink) shadow-soft [&_svg]:size-5">{icon}</span>
      </div>
      <span className="tabular text-2xl leading-none font-bold break-words text-ink sm:text-3xl">
        {count ? <Counter {...count} duration={600} /> : value}
      </span>
      {(trend || note) && (
        <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          {trend && (
            <span className={cn(trend.direction === 'up' ? 'tone-green' : trend.direction === 'down' ? 'tone-red' : 'tone-gray', 'rounded-pill bg-(--tone-soft) px-2 py-0.5 font-semibold text-(--tone-ink)')}>
              <span className="sr-only">{trend.direction === 'up' ? 'Up ' : trend.direction === 'down' ? 'Down ' : 'No change '}</span>
              {trend.text} <span className="font-normal">{trend.period}</span>
            </span>
          )}
          {note && <span>{note}</span>}
        </span>
      )}
    </li>
  );
}

/** A titled card: heading, optional link to the full page, content. */
export function Panel({ title, id, action, tone, icon, className, children, index = 0 }: { title: string; id: string; action?: { label: string; href: string }; tone?: Tone; icon?: ReactNode; className?: string; children: ReactNode; index?: number }) {
  return (
    <section aria-labelledby={id} className={cn('card-in flex min-w-0 flex-col rounded-card border border-rule bg-paper-3 shadow-soft', className)} style={{ '--i': index } as CSSProperties}>
      <header className="flex items-center justify-between gap-3 px-4 pt-4 md:px-5 md:pt-5">
        <span className="flex min-w-0 items-center gap-3">
          {icon && tone && <IconTile tone={tone} className="size-9 [&_svg]:size-[1.125rem]">{icon}</IconTile>}
          <h3 id={id} className="truncate text-base">{title}</h3>
        </span>
        {action && <Link href={action.href} className="shrink-0 text-sm font-medium text-signal">{action.label}</Link>}
      </header>
      <div className="flex min-w-0 flex-1 flex-col p-4 md:p-5">{children}</div>
    </section>
  );
}

/** A status in words with its tone and (optionally) an icon. */
export function StatusPill({ tone, icon, children, className, ...props }: { tone: Tone; icon?: ReactNode } & ComponentProps<'span'>) {
  return (
    <span className={cn(`tone-${tone}`, 'inline-flex w-fit shrink-0 items-center gap-1.5 rounded-pill bg-(--tone-soft) px-2.5 py-1 text-xs font-semibold whitespace-nowrap text-(--tone-ink) [&_svg]:size-3.5', className)} {...props}>
      {icon}
      {children}
    </span>
  );
}

/** What a list shows when it has nothing in it (illustrated variants live in components/empty-state). */
export { EmptyState } from '../components/empty-state';
