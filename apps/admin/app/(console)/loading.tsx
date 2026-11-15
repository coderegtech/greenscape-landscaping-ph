import { PageSkeleton } from '@greenscape/ui/components/skeletons';

// Rendered inside the console shell: the sidebar and header stay put and only the page area shows placeholders.
export default function Loading() {
  return <PageSkeleton />;
}
