import Link from 'next/link';
import type { ReactNode } from 'react';
import type { NavLink } from './site-header';

export interface FooterColumn {
  title: string;
  links: NavLink[];
}
export interface ContactFacts {
  address?: string;
  phone?: string;
  email?: string;
  hours?: string;
}

/** Mast footer: the wordmark over the link columns, contact facts as a <dl>, socials as named links, credits slot. */
export function SiteFooter({ columns, contact, socials = [], legal, credits }: { columns: FooterColumn[]; contact: ContactFacts; socials?: NavLink[]; legal?: ReactNode; credits?: ReactNode }) {
  const facts = [
    contact.address && { term: 'Visit', detail: contact.address },
    contact.phone && { term: 'Call', detail: <a href={`tel:${contact.phone.replace(/\s/g, '')}`}>{contact.phone}</a> },
    contact.email && { term: 'Email', detail: <a href={`mailto:${contact.email}`}>{contact.email}</a> },
    contact.hours && { term: 'Hours', detail: contact.hours },
  ].filter(Boolean) as { term: string; detail: ReactNode }[];

  return (
    <footer className="band-deep border-t border-rule">
      <div className="container-page py-16 md:py-24">
        <p className="font-display text-4xl text-ink md:text-display-s">Greenscape</p>
        <div className="mt-16 grid grid-cols-2 gap-x-6 gap-y-10 md:grid-cols-4 lg:grid-cols-[repeat(3,minmax(0,1fr))_minmax(0,1.4fr)]">
          {columns.map((col) => (
            <nav key={col.title} aria-label={col.title}>
              <h2 className="font-body text-sm font-medium text-muted">{col.title}</h2>
              <ul className="mt-3 flex flex-col">
                {col.links.map((l) => (
                  <li key={l.href}>
                    <Link href={l.href} className="inline-flex min-h-10 items-center text-base text-ink-2 no-underline hover:text-ink hover:underline">
                      {l.label}
                    </Link>
                  </li>
                ))}
              </ul>
            </nav>
          ))}
          <div className="col-span-2 md:col-span-4 lg:col-span-1">
            <h2 className="font-body text-sm font-medium text-muted">Contact</h2>
            <dl className="mt-3 grid grid-cols-[4.5rem_minmax(0,1fr)] gap-y-2 text-base">
              {facts.map((f) => (
                <div key={f.term} className="contents">
                  <dt className="text-muted">{f.term}</dt>
                  <dd className="text-ink-2 [&_a]:text-ink-2">{f.detail}</dd>
                </div>
              ))}
            </dl>
            {socials.length > 0 && (
              <ul className="mt-4 flex gap-4">
                {socials.map((s) => (
                  <li key={s.href}>
                    <a href={s.href} rel="noopener" className="inline-flex min-h-10 items-center text-base text-ink">
                      {s.label}
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
        <div className="mt-16 flex flex-col gap-2 border-t border-rule pt-6 text-sm text-muted md:flex-row md:justify-between">
          <div>{legal}</div>
          {credits && <div>{credits}</div>}
        </div>
      </div>
    </footer>
  );
}
