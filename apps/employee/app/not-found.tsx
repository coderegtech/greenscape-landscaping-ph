import { NotFoundState } from '@greenscape/ui/components/error-state';

export const metadata = { title: 'Page not found' };

export default function NotFound() {
  return <NotFoundState compact title="We couldn’t find that page" description="The page may have moved. You can return to your employee dashboard." homeHref="/" homeLabel="Return to dashboard" />;
}
