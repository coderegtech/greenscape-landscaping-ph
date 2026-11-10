import { Skeleton } from '@greenscape/ui/components/skeleton';
import { ProductGridSkeleton } from '@greenscape/ui/components/skeletons';

/** Shop loading state: shown while a category, search or sort renders (product cards at their final size). */
export default function Loading() {
  return (
    <main id="main" className="container-page flex flex-col gap-8 pt-14 pb-24 md:pt-24">
      <Skeleton className="h-12 w-2/3 max-w-[32rem] rounded-control md:h-16" />
      <Skeleton className="h-20 w-full rounded-card" />
      <ProductGridSkeleton />
    </main>
  );
}
