'use client';
import { ErrorState } from '@greenscape/ui/components/error-state';
import { useOnline } from '@greenscape/ui/components/offline';
import { useEffect } from 'react';

/** Shown when a page fails to render (e.g. the content service is unreachable and no cached copy exists). */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main id="main" className="container-page">
      <ErrorState kind={useOnline() ? 'error' : 'offline'} description="We ran into a problem loading this page. Please try again, or call us on 0917 844 3330." digest={error.digest} onRetry={reset} homeHref="/" />
    </main>
  );
}
