import { NotFoundState } from '@greenscape/ui/components/error-state';

export const metadata = { title: 'Page not found' };

export default function NotFound() {
  return <NotFoundState compact title="Page not found" description="This dashboard page doesn’t exist or may have moved." homeHref="/" homeLabel="Return to dashboard" />;
}
