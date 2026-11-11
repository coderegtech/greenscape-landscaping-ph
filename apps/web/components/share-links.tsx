'use client';
import { toast } from '@greenscape/ui/components/sonner';
import { Link2 } from 'lucide-react';

// lucide 1.x ships no brand marks; these are minimal 24×24 glyphs, decorative (each link is named by its text).
const glyph = {
  Facebook: 'M14 8h3V4h-3c-2.8 0-5 2.2-5 5v2H7v4h2v9h4v-9h3l1-4h-4V9c0-.6.4-1 1-1z',
  X: 'M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z',
  LinkedIn: 'M2 9h4v12H2zM4 2.5a2 2 0 1 1 0 4 2 2 0 0 1 0-4zM9 9h3.8v1.7h.1c.5-1 1.8-2 3.7-2 4 0 4.7 2.6 4.7 6V21h-4v-5.6c0-1.3 0-3-1.9-3s-2.2 1.5-2.2 3V21H9z',
};

const row = 'inline-flex min-h-10 items-center gap-2.5 text-sm text-ink-2 no-underline transition-colors duration-(--dur-short) hover:text-signal';

/** Share a page: Facebook, X and LinkedIn open their own share screens in a new tab; "Copy link" uses the clipboard. */
export function ShareLinks({ url, title }: { url: string; title: string }) {
  const u = encodeURIComponent(url);
  const links = [
    { name: 'Facebook' as const, href: `https://www.facebook.com/sharer/sharer.php?u=${u}` },
    { name: 'X' as const, href: `https://twitter.com/intent/tweet?url=${u}&text=${encodeURIComponent(title)}` },
    { name: 'LinkedIn' as const, href: `https://www.linkedin.com/sharing/share-offsite/?url=${u}` },
  ];
  const copy = () =>
    navigator.clipboard.writeText(url).then(
      () => toast.success('Link copied'),
      () => toast.error('Could not copy. Copy the address from your browser bar instead.'),
    );
  return (
    <ul className="flex flex-wrap gap-x-5 lg:flex-col lg:gap-x-0">
      {links.map((l) => (
        <li key={l.name}>
          <a href={l.href} target="_blank" rel="noopener noreferrer" className={row}>
            <svg aria-hidden viewBox="0 0 24 24" className="size-4 fill-current"><path d={glyph[l.name]} /></svg>
            {l.name}
            <span className="sr-only"> (opens in a new tab)</span>
          </a>
        </li>
      ))}
      <li>
        <button type="button" onClick={copy} className={row}>
          <Link2 aria-hidden className="size-4" />
          Copy link
        </button>
      </li>
    </ul>
  );
}
