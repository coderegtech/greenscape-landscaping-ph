import { swResponse } from '@greenscape/ui/notifications/sw';

export const dynamic = 'force-static';

/** Service worker: push notifications and the offline screen (one source shared by the apps, scoped to this origin). */
export const GET = () => swResponse('employee');
