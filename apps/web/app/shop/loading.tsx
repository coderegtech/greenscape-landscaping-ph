import { ProductGridSkeleton } from '@greenscape/ui/components/skeletons';

// Under the site header: only the product area shows placeholders.
export default function Loading() {
  return <div className="container-page py-10"><ProductGridSkeleton /></div>;
}
