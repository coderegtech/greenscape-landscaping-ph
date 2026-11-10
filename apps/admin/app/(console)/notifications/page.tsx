import { AnnouncementForm } from '@greenscape/ui/notifications/announce';
import { NotificationCenter } from '@greenscape/ui/notifications/center';
import type { Metadata } from 'next';
import { can, getStaff } from '@/lib/session';

export const metadata: Metadata = { title: 'Notifications' };
export const dynamic = 'force-dynamic';

export default async function NotificationsPage() {
  const me = await getStaff();
  return (
    <div className="flex max-w-4xl flex-col gap-6">
      <h2 className="text-3xl">Notifications</h2>
      <NotificationCenter>{me && can(me, 'notifications.broadcast') ? <AnnouncementForm /> : null}</NotificationCenter>
    </div>
  );
}
