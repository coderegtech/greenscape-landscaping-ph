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

/** A card with a photo, two lines and a price/action row (products, projects, stories). */
export function CardSkeleton({ ratio = '4 / 3' }: { ratio?: string }) {
  return (
    <div aria-hidden className="flex flex-col gap-3 rounded-xl border border-rule bg-paper-3 p-3">
      <Skeleton className="w-full" style={{ aspectRatio: ratio }} />
      <Skeleton className="h-5 w-3/4" />
      <Skeleton className="h-4 w-1/2" />
    </div>
  );
}

/** KPI tiles: label, big number, hint. */
export function StatsSkeleton({ count = 4 }: { count?: number }) {
  return (
    <div role="status" aria-label="Loading figures" className="grid grid-cols-2 gap-3 sm:gap-4 xl:grid-cols-4">
      {Array.from({ length: count }, (_, i) => (
        <div key={i} aria-hidden className="flex flex-col gap-3 rounded-xl border border-rule bg-paper-3 p-4">
          <Skeleton className="h-3 w-1/3" />
          <Skeleton className="h-8 w-1/2" />
          <Skeleton className="h-3 w-2/3" />
        </div>
      ))}
    </div>
  );
}

/** Chart panel: title row and a baseline of bars of different heights. */
export function ChartSkeleton({ className = 'h-64' }: { className?: string }) {
  const bars = [45, 70, 55, 85, 60, 95, 50, 75, 65, 90, 40, 80];
  return (
    <div role="status" aria-label="Loading chart" className={`flex flex-col gap-4 rounded-xl border border-rule bg-paper-3 p-4 ${className}`}>
      <Skeleton className="h-4 w-1/4" />
      <div aria-hidden className="flex flex-1 items-end gap-2">
        {bars.map((h, i) => <Skeleton key={i} className="flex-1 rounded-b-none" style={{ height: `${h}%` }} />)}
      </div>
    </div>
  );
}

/** Masonry placeholders at a fixed set of real photo proportions, so the grid does not rearrange when photos paint. */
export function GallerySkeleton({ count = 8 }: { count?: number }) {
  const ratios = ['4 / 5', '1 / 1', '3 / 4', '4 / 3', '2 / 3', '5 / 4'];
  return (
    <div role="status" aria-label="Loading gallery" className="columns-2 gap-4 md:columns-3 lg:columns-4">
      {Array.from({ length: count }, (_, i) => <Skeleton key={i} className="mb-4 w-full break-inside-avoid" style={{ aspectRatio: ratios[i % ratios.length] }} />)}
    </div>
  );
}

/** Avatar, name and a few detail rows. */
export function ProfileSkeleton() {
  return (
    <div role="status" aria-label="Loading profile" className="flex flex-col gap-6">
      <div aria-hidden className="flex items-center gap-4">
        <Skeleton className="size-16 rounded-full" />
        <div className="flex flex-1 flex-col gap-2"><Skeleton className="h-5 w-1/3" /><Skeleton className="h-4 w-1/2" /></div>
      </div>
      {Array.from({ length: 4 }, (_, i) => <Skeleton key={i} aria-hidden className="h-10 w-full" />)}
    </div>
  );
}

/** The generic page placeholder for `loading.tsx`: title, a stats row and a table. Rendered inside the shell, never over it. */
export function PageSkeleton() {
  return (
    <div role="status" aria-label="Loading page" className="flex flex-col gap-6">
      <Skeleton aria-hidden className="h-9 w-56" />
      <StatsSkeleton />
      <TableSkeleton />
    </div>
  );
}
