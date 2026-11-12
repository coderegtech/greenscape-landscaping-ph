import type { ElementType, ReactNode } from 'react';
import { cn } from '../lib/utils';
import { Reveal } from '../motion/reveal';

/** The one container width: 80rem, centred, 16px gutters on phones, 40px from 48rem. */
export function Container({ as: Tag = 'div', className, children }: { as?: ElementType; className?: string; children: ReactNode }) {
  return <Tag className={cn('container-page', className)}>{children}</Tag>;
}

/**
 * A page section. Seams between sections use one of: space (default), a hairline (`rule`),
 * or a paper step (`band="deep"` darker green, `band="cream"` the light band; two bands per page at most).
 */
export function Section({
  id,
  band,
  rule,
  className,
  containerClassName,
  labelledBy,
  decor,
  children,
}: {
  id?: string;
  band?: 'deep' | 'cream';
  rule?: boolean;
  className?: string;
  containerClassName?: string;
  labelledBy?: string;
  /** Decorative accents painted behind the content (apps/web components/decorations). */
  decor?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={labelledBy}
      className={cn(rule ? 'py-10 md:py-16' : 'py-16 md:py-24', band === 'deep' && 'band-deep', band === 'cream' && 'band-cream', decor && 'relative isolate overflow-x-clip', className)}
    >
      {decor}
      <div className={cn('container-page', containerClassName)}>{rule ? <div className="border-t border-rule pt-10 md:pt-16">{children}</div> : children}</div>
    </section>
  );
}

/** Section heading group: a heading that announces its subject, and at most one line under it. Left-aligned. Rises in on scroll; the action fades in after it. */
export function SectionHeading({ id, title, lead, action, as: Tag = 'h2' }: { id?: string; title: ReactNode; lead?: ReactNode; action?: ReactNode; as?: 'h1' | 'h2' | 'h3' }) {
  return (
    <div className="mb-10 flex flex-col gap-4 md:mb-16 md:flex-row md:items-end md:justify-between">
      <Reveal className="flex min-w-0 flex-col gap-3">
        <Tag id={id} className="text-3xl md:text-4xl">
          {title}
        </Tag>
        {lead && <p className="max-w-[60ch] text-lg text-ink-2">{lead}</p>}
      </Reveal>
      {action && <Reveal kind="fade" index={2} className="shrink-0">{action}</Reveal>}
    </div>
  );
}

/** Feature/metadata list as a <dl>: term one weight heavier. */
export function FactList({ items, className }: { items: { term: ReactNode; detail: ReactNode }[]; className?: string }) {
  return (
    <dl className={cn('grid grid-cols-[minmax(0,10rem)_minmax(0,1fr)] gap-x-6 gap-y-3 text-base', className)}>
      {items.map((it, i) => (
        <div key={i} className="contents">
          <dt className="font-medium text-ink">{it.term}</dt>
          <dd className="text-ink-2">{it.detail}</dd>
        </div>
      ))}
    </dl>
  );
}
