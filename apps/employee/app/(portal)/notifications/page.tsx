import { NotificationCenter } from '@greenscape/ui/notifications/center';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Notifications' };

// Leave and correction decisions from HR, and announcements to employees.
export default function NotificationsPage() {
  return (
    <main id="main" className="container-page py-8 md:py-14">
      <div className="mx-auto flex max-w-[52rem] flex-col gap-8">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-rule pb-6">
          <h1 className="text-display-s">Notifications</h1>
          <Link href="/">Back to today</Link>
        </div>
        <NotificationCenter />
      </div>
    </main>
  );
}
