'use client';
import { useRouter } from 'next/navigation';
import { Component, Suspense, startTransition, type ReactNode } from 'react';
import { ErrorState } from './error-state';

function Failed({ reset, label }: { reset: () => void; label: string }) {
  const router = useRouter();
  // Server components re-run on refresh; reset then re-renders this section only.
  return <ErrorState compact title={`${label} couldn’t load`} onRetry={() => startTransition(() => { router.refresh(); reset(); })} />;
}

class Boundary extends Component<{ label: string; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  render() { return this.state.failed ? <Failed label={this.props.label} reset={() => this.setState({ failed: false })} /> : this.props.children; }
}

/** One part of a page: its skeleton while it loads, a local error with Retry if it fails, and the rest of the page untouched. */
export function SectionBoundary({ children, skeleton, label = 'This section' }: { children: ReactNode; skeleton: ReactNode; label?: string }) {
  return <Boundary label={label}><Suspense fallback={skeleton}>{children}</Suspense></Boundary>;
}
