import { PageHeader } from '@greenscape/ui/layout/dashboard';
import { NotificationCenter } from '@greenscape/ui/notifications/center';
import type { Metadata } from 'next';

export const metadata: Metadata = { title: 'Notifications' };

// Leave and correction decisions from HR, schedule changes, and announcements to employees.
export default function NotificationsPage() {
  return (
    <div className="flex flex-col gap-6">
      <PageHeader level={1} title="Notifications" description="Answers from HR, schedule changes and announcements." />
      <NotificationCenter />
    </div>
  );
}
