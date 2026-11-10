import { swResponse } from '@greenscape/ui/notifications/sw';

export const dynamic = 'force-static';

/** Service worker for push notifications (one source shared with the admin app). */
export const GET = () => swResponse();
