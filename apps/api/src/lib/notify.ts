import type { NotifyKind, NotificationSettings } from '@greenscape/validation';
import type { Deps } from './deps.ts';

export const NOTIFY_KEY = 'notifications';
export const SETTINGS_TAG = 'settings';

/** Who receives a kind of staff email: the admin setting if filled in, else the deployment's env defaults. */
export async function notifyTo(deps: Pick<Deps, 'db' | 'cache' | 'env'>, kind: NotifyKind): Promise<string[]> {
  const saved = await deps.cache.getOrSet(`setting:${NOTIFY_KEY}`, 60, async () => (await deps.db.appSetting.findUnique({ where: { key: NOTIFY_KEY } }))?.value ?? null, { tags: [SETTINGS_TAG] });
  const list = (saved as NotificationSettings | null)?.[kind];
  if (list?.length) return list;
  const { QUOTE_NOTIFY_TO: quotes, ORDER_NOTIFY_TO: orders } = deps.env;
  return kind === 'orders' || kind === 'stock' ? (orders.length ? orders : quotes) : quotes;
}
