import { Skeleton } from '@greenscape/ui/components/skeleton';

/**
 * Route loading state while a page renders on the server. Kept at the root on purpose: a filter or "show more" on the
 * same page keeps the current content on screen (no flash back to placeholders).
 */
export default function Loading() {
  return (
    <main id="main" role="status" aria-label="Loading page" className="container-page pt-14 pb-24 md:pt-24">
      <Skeleton className="h-12 w-2/3 max-w-[36rem] rounded-control md:h-16" />
      <Skeleton className="mt-5 h-5 w-1/2 max-w-[28rem] rounded-control" />
      <div className="mt-14 grid grid-cols-2 gap-3 md:grid-cols-3 md:gap-5 lg:grid-cols-4">
        {['aspect-[4/5]', 'aspect-[4/3]', 'aspect-[3/4]', 'aspect-square', 'aspect-[4/3]', 'aspect-[4/5]', 'aspect-square', 'aspect-[3/4]'].map((r, i) => (
          <Skeleton key={i} className={`${r} rounded-card`} />
        ))}
      </div>
    </main>
  );
}
