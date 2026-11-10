import type { ReactNode } from 'react';

/** Re-mounted on every route change: the new page fades up a touch (theme.css `.page-in`, CSS only, off under reduced motion). */
export default function Template({ children }: { children: ReactNode }) {
  return <div className="page-in">{children}</div>;
}
