import { SignOutButton } from '@greenscape/ui/auth-forms';
import { AdminShell } from '@greenscape/ui/layout/admin-shell';
import { NotificationBell } from '@greenscape/ui/notifications/bell';
import { NotificationsProvider } from '@greenscape/ui/notifications/provider';
import { SoundToggle } from '@greenscape/ui/notifications/sound';
import { LiveStatus } from '@greenscape/ui/notifications/live';
import { ConsoleLive } from '@/components/console-live';
import Link from 'next/link';
import { navFor } from '@/lib/nav';
import { withIcons } from '@/lib/nav-icons';
import { badgesFrom, getOverview } from '@/lib/overview';
import { can, getStaff } from '@/lib/session';

export const dynamic = 'force-dynamic';

const menuLink = 'flex h-10 items-center rounded-lg px-3 text-sm font-medium text-ink no-underline hover:bg-paper-2';

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
  // The same call the dashboard makes (cached per request): its counts become the menu badges.
  const overview = await getOverview();
  return (
    <NotificationsProvider app="admin" apiUrl={process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000'}>
      <AdminShell
        groups={withIcons(navFor(me, badgesFrom(overview)))}
        title="Greenscape Admin"
        user={{ name: me.user.displayName || me.user.email, email: me.user.email, roles: me.roles }}
        actions={
          <>
            <LiveStatus />
            <SoundToggle />
            <NotificationBell centerHref="/notifications" />
          </>
        }
        account={
          <>
            <nav aria-label="Account" className="flex flex-col border-y border-rule py-2">
              <Link href="/notifications" className={menuLink}>Notifications and sounds</Link>
              {can(me, 'settings.read') && <Link href="/settings" className={menuLink}>Settings</Link>}
            </nav>
            <SignOutButton />
          </>
        }
      >
        <ConsoleLive />
        {children}
      </AdminShell>
    </NotificationsProvider>
  );
}
