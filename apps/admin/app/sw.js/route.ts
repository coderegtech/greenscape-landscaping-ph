import { swResponse } from '@greenscape/ui/notifications/sw';

export const dynamic = 'force-static';

/** Service worker for push notifications (one source shared with the web app). */
export const GET = () => swResponse();
