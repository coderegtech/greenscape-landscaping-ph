import { Skeleton } from './skeleton';

/** Product card placeholder at the card's final size (square photo, name, latin name, price). */
export function ProductCardSkeleton() {
  return (
    <div className="flex flex-col gap-3" aria-hidden>
      <Skeleton className="aspect-square w-full" />
      <Skeleton className="h-6 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
      <Skeleton className="h-5 w-1/4" />
    </div>
  );
}

export function ProductGridSkeleton({ count = 8 }: { count?: number }) {
  return (
    <div role="status" aria-label="Loading products" className="grid grid-cols-2 gap-x-4 gap-y-10 md:grid-cols-3 lg:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <ProductCardSkeleton key={i} />
      ))}
    </div>
  );
}

/** Admin table placeholder: header + rows at real row height so the table doesn't jump when data lands. */
export function TableSkeleton({ rows = 8, columns = 5 }: { rows?: number; columns?: number }) {
  return (
    <div role="status" aria-label="Loading table" className="w-full border-t border-rule">
      {Array.from({ length: rows + 1 }, (_, r) => (
        <div key={r} className="grid h-11 items-center gap-4 border-b border-rule px-3" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
          {Array.from({ length: columns }, (_, c) => (
            <Skeleton key={c} className={r === 0 ? 'h-3 w-1/2' : 'h-4 w-4/5'} />
          ))}
        </div>
      ))}
    </div>
  );
}

/** Text block placeholder for articles/pages. */
export function ProseSkeleton({ lines = 6 }: { lines?: number }) {
  return (
    <div role="status" aria-label="Loading" className="flex max-w-(--container-prose) flex-col gap-3">
      <Skeleton className="mb-4 h-12 w-2/3" />
      {Array.from({ length: lines }, (_, i) => (
        <Skeleton key={i} className="h-4" style={{ width: `${92 - ((i * 13) % 30)}%` }} />
      ))}
    </div>
  );
}
