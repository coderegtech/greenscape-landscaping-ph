import { offlineResponse } from '@greenscape/ui/pwa/app';

export const dynamic = 'force-static';

/** The offline screen the service worker keeps and shows when a page cannot be loaded. Public: it holds no data. */
export const GET = () => offlineResponse('employee');
