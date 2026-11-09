import { SignOutButton } from '@greenscape/ui/auth-forms';
import { AdminShell } from '@greenscape/ui/layout/admin-shell';
import { navFor } from '@/lib/nav';
import { getStaff } from '@/lib/session';

export const dynamic = 'force-dynamic';

export default async function ConsoleLayout({ children }: { children: React.ReactNode }) {
  const me = await getStaff();
  if (!me) {
    return (
      <main id="main" className="mx-auto flex min-h-dvh max-w-md flex-col justify-center gap-4 px-4 text-center">
        <h1 className="mx-auto text-3xl">No admin access</h1>
        <p className="text-base text-ink-2" data-testid="no-access">
          Your account isn&apos;t set up for the admin area. Ask an administrator to grant you a staff role.
        </p>
        <div className="flex justify-center">
          <SignOutButton />
        </div>
      </main>
    );
  }
  return (
    <AdminShell
      groups={navFor(me)}
      title="Greenscape Admin"
      account={
        <div className="flex items-center gap-3">
          <span className="hidden text-sm text-ink-2 md:inline" data-testid="staff-identity">
            {me.user.email} ({me.roles.join(', ')})
          </span>
          <SignOutButton />
        </div>
      }
    >
      {children}
    </AdminShell>
  );
}
