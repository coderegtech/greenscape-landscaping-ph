'use client';
import { Button } from '@greenscape/ui/components/button';
import { useEffect } from 'react';

/** Shown when a page fails to render (e.g. the content service is unreachable and no cached copy exists). */
export default function Error({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <main id="main" className="container-page flex min-h-[60svh] flex-col justify-center gap-6 py-24">
      <h1 className="text-display-s">Something went wrong on our side.</h1>
      <p className="max-w-[44ch] text-lg text-ink-2">Please try again in a moment. If it keeps happening, call us on 0917 844 3330.</p>
      <div>
        <Button onClick={reset}>Try again</Button>
      </div>
      {error.digest && <p className="text-sm text-muted">Reference: {error.digest}</p>}
    </main>
  );
}
