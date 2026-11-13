import { Leaf } from 'lucide-react';
import type { ReactNode } from 'react';
import { cn } from '../lib/utils';

/** A potted plant drawn for the sign-in screens (original artwork, token colours, decorative only). */
function Plant({ className }: { className?: string }) {
  const leaf = 'M0 0 C-34 -10 -58 -40 -62 -78 C-24 -74 -2 -44 0 0 Z';
  const leaves: [x: number, y: number, rotate: number, scale: number, fill: string][] = [
    [160, 214, -8, 1.15, 'var(--tone-green)'],
    [160, 214, 82, 1.1, 'var(--gs-sage)'],
    [160, 170, -20, 1, 'var(--gs-sage)'],
    [160, 170, 96, 0.95, 'var(--tone-green)'],
    [160, 128, 6, 0.85, 'var(--tone-green)'],
    [160, 128, 70, 0.8, 'var(--tone-lime)'],
    [160, 96, 40, 0.7, 'var(--gs-sage)'],
  ];
  return (
    <svg viewBox="0 0 320 320" className={className} aria-hidden focusable="false">
      <circle cx="74" cy="92" r="26" fill="var(--tone-blue-soft)" />
      <circle cx="258" cy="70" r="18" fill="var(--tone-orange-soft)" />
      <circle cx="252" cy="196" r="30" fill="var(--tone-purple-soft)" />
      <ellipse cx="160" cy="292" rx="96" ry="10" fill="var(--gs-rule-strong)" opacity="0.6" />
      <path d="M160 236 C160 190 160 140 160 84" fill="none" stroke="var(--tone-green-ink)" strokeWidth="4" strokeLinecap="round" />
      {leaves.map(([x, y, r, s, fill], i) => <path key={i} d={leaf} fill={fill} transform={`translate(${x} ${y}) rotate(${r}) scale(${s})`} />)}
      <path d="M112 232 H208 L198 286 Q196 292 190 292 H130 Q124 292 122 286 Z" fill="var(--tone-orange)" />
      <rect x="106" y="224" width="108" height="16" rx="8" fill="var(--tone-orange-ink)" />
    </svg>
  );
}

/**
 * Sign-in screen for the staff portals: brand and a botanical panel beside the form on wide screens, a compact brand
 * header above it on phones. `tone="deep"` is the admin's dark green panel; `tone="fresh"` the employee portal's pastel.
 */
export function PortalAuth({ tone, product, title, lead, pitch, footer, children }: { tone: 'deep' | 'fresh'; product: string; title: string; lead?: string; pitch: string; footer?: ReactNode; children: ReactNode }) {
  return (
    <main id="main" className="grid min-h-dvh lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
      <div className={cn('relative hidden flex-col justify-between gap-8 overflow-clip p-12 lg:flex', tone === 'deep' ? 'band-sidebar' : 'tone-green bg-(--tone-soft)')}>
        <p className="flex items-center gap-3 text-lg font-bold text-ink">
          <span aria-hidden className="grid size-10 place-items-center rounded-xl bg-signal text-signal-ink"><Leaf className="size-5" /></span>
          Greenscape
        </p>
        <Plant className="mx-auto w-full max-w-sm" />
        <p className="max-w-md text-2xl leading-snug font-bold text-ink">{pitch}</p>
      </div>
      <div className="flex flex-col justify-center px-4 py-10 md:px-10">
        <div className="hero-in mx-auto flex w-full max-w-[26rem] flex-col gap-6">
          <div className="flex items-center justify-between gap-4 lg:hidden">
            <p className="flex items-center gap-2.5 text-base font-bold text-ink">
              <span aria-hidden className="grid size-9 place-items-center rounded-xl bg-signal text-signal-ink"><Leaf className="size-5" /></span>
              Greenscape
            </p>
            <Plant className="size-20" />
          </div>
          <div className="flex flex-col gap-1.5">
            <p className="text-sm font-semibold text-signal">{product}</p>
            <h1 className="text-3xl">{title}</h1>
            {lead && <p className="text-sm text-muted">{lead}</p>}
          </div>
          <div className="flex flex-col gap-6 rounded-card border border-rule bg-paper-3 p-5 shadow-soft md:p-7">{children}</div>
          {footer && <p className="text-sm text-muted">{footer}</p>}
        </div>
      </div>
    </main>
  );
}
