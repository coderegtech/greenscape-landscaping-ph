import Link from 'next/link';
import type { ReactNode } from 'react';
import { Reveal } from '../motion/reveal';

export interface FieldIndexItem {
  name: string;
  /** Scientific / secondary name, shown roman in the label style beside the common name. */
  latin?: string;
  line?: ReactNode;
  href?: string;
  aside?: ReactNode;
}

/**
 * The field-guide index (Hedgerow "Index as a field guide"): Prata common name, Latin name, one line,
 * under a chartreuse rule. Carries a section without a photograph: services, plant lists, projects by place.
 */
export function FieldIndex({ items, label }: { items: FieldIndexItem[]; label: string }) {
  return (
    <ul aria-label={label} className="border-t-[1.5px] border-signal">
      {items.map((it, i) => {
        const body = (
          <div className="grid grid-cols-1 gap-1 py-6 md:grid-cols-[minmax(0,5fr)_minmax(0,3fr)_minmax(0,4fr)] md:items-baseline md:gap-6">
            <span className="font-display text-2xl text-ink transition-colors duration-(--dur-short) group-hover:text-signal md:text-3xl">{it.name}</span>
            {it.latin ? <span className="label">{it.latin}</span> : <span aria-hidden />}
            <span className="flex items-baseline justify-between gap-4 text-base text-ink-2">
              {it.line}
              {it.aside}
            </span>
          </div>
        );
        return (
          <Reveal as="li" key={it.name} index={i} className="border-b border-rule">
            {it.href ? (
              <Link href={it.href} className="group block no-underline">
                {body}
              </Link>
            ) : (
              body
            )}
          </Reveal>
        );
      })}
    </ul>
  );
}
