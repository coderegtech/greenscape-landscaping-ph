'use client';
import { NotificationList } from '@greenscape/ui/notifications/list';
import { useFeed, useNotifications } from '@greenscape/ui/notifications/provider';

/** The three newest notifications on the dashboard, kept current by the live stream. Loading history makes no sound. */
export function RecentNotifications() {
  const { signedIn } = useNotifications();
  const feed = useFeed({}, signedIn);
  return (
    <div className="-mx-4 -mb-4 overflow-clip rounded-b-(--radius-card) md:-mx-5 md:-mb-5" data-testid="recent-notifications">
      <NotificationList items={feed.items.slice(0, 3)} state={signedIn ? feed.state : 'loading'} />
    </div>
  );
}
