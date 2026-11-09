import { Button } from '@greenscape/ui/components/button';
import Link from 'next/link';

export const metadata = { title: 'Page not found' };

export default function NotFound() {
  return (
    <main id="main" className="container-page flex min-h-[60svh] flex-col justify-center gap-6 py-24">
      <h1 className="text-display-s">This page isn’t here.</h1>
      <p className="max-w-[44ch] text-lg text-ink-2">It may have moved when we rebuilt the site. These are the places most people are looking for:</p>
      <ul className="flex flex-wrap gap-3">
        {[
          ['/services', 'Services'],
          ['/projects', 'Projects'],
          ['/stories', 'Stories'],
          ['/contact', 'Contact'],
        ].map(([href, label]) => (
          <li key={href}>
            <Button asChild variant="secondary" size="sm">
              <Link href={href!} className="no-underline">{label}</Link>
            </Button>
          </li>
        ))}
      </ul>
      <p className="text-base text-ink-2">
        Or <Link href="/quote">request a quote</Link> and tell us what you need.
      </p>
    </main>
  );
}
