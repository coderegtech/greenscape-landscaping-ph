import { NotificationCenter } from '@greenscape/ui/notifications/center';
import type { Metadata } from 'next';
import Link from 'next/link';

export const metadata: Metadata = { title: 'Notifications', robots: { index: false } };

export default function NotificationsPage() {
  return (
    <main id="main" className="container-page py-16 md:py-24">
      <div className="mx-auto flex max-w-[48rem] flex-col gap-8">
        <div className="flex flex-wrap items-end justify-between gap-4 border-b border-rule pb-6">
          <h1 className="text-display-s">Notifications</h1>
          <Link href="/account">Back to my account</Link>
        </div>
        <NotificationCenter />
      </div>
    </main>
  );
}
