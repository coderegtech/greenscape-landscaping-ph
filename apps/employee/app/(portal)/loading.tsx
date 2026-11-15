import { PageSkeleton } from '@greenscape/ui/components/skeletons';

// Inside the portal shell: the navigation stays and only the page area shows placeholders.
export default function Loading() {
  return <PageSkeleton />;
}
