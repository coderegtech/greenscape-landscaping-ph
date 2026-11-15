'use client';
import { ErrorState } from '@greenscape/ui/components/error-state';
import { useOnline } from '@greenscape/ui/components/offline';

/** A page failed to render: the portal navigation stays, the page area shows a retry. */
export default function PortalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return <ErrorState kind={useOnline() ? 'error' : 'offline'} digest={error.digest} onRetry={reset} homeHref="/" homeLabel="Return to dashboard" />;
}
