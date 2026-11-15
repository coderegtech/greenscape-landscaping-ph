import { SignOutButton } from '@greenscape/ui/auth-forms';
import { OfflineBanner } from '@greenscape/ui/components/offline';
import { Notice } from '@greenscape/ui/form';
import { PortalShell } from '@greenscape/ui/layout/employee-shell';
import { getLeave, portal } from '@/lib/portal';

export const dynamic = 'force-dynamic';

// Every portal page sits behind this check: someone who is not an employee gets the reason and a way out, and no page
// below is rendered for them.
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const p = await portal();
  if (!p.ok) {
    return (
      <main id="main" className="mx-auto flex min-h-dvh max-w-md flex-col items-start justify-center gap-4 px-4">
        <h1 className="text-3xl">Employee portal</h1>
        <Notice tone="error">{p.message}</Notice>
        <SignOutButton />
      </main>
    );
  }
  const leave = await getLeave().catch(() => null);
  return (
    <PortalShell name={p.today.employee.name} pending={leave?.requests.filter((r) => r.status === 'PENDING').length ?? 0}>
      <OfflineBanner message="You’re offline. An internet connection is needed to record attendance." />
      {children}
    </PortalShell>
  );
}
