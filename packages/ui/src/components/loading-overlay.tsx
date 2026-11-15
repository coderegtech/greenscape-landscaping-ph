import { cn } from '../lib/utils';
import { Logo } from './logo';

/** Full-screen working state: the Greenscape wordmark with a progress circle below it, over the blurred page behind. */
export function LoadingOverlay({ label = 'Loading', className }: { label?: string; className?: string }) {
  return (
    <div role="status" aria-live="polite" className={cn('fixed inset-0 z-[500] flex flex-col items-center justify-center gap-6 bg-paper/60 backdrop-blur-md', className)}>
      <Logo className="h-12 w-auto max-w-[80vw] text-signal-2" />
      <span aria-hidden className="size-10 rounded-full border-4 border-signal/25 border-t-signal motion-safe:animate-spin" />
      <span className="sr-only">{label}</span>
    </div>
  );
}
