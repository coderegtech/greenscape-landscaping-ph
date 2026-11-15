import { NotFoundState } from '@greenscape/ui/components/error-state';

export const metadata = { title: 'Page not found' };

export default function NotFound() {
  return (
    <main id="main" className="container-page">
      <NotFoundState
        title="Looks like you’ve wandered off the garden path."
        description="The page you’re looking for may have moved, or it might not exist anymore."
        homeHref="/"
        homeLabel="Back to Home"
        secondaryHref="/services"
        secondaryLabel="Explore Our Services"
      />
    </main>
  );
}
