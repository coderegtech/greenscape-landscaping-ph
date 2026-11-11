// Pure rules of the notification system (no I/O), so they can be unit-tested without a database.
import { NOTIFICATION_CATEGORIES, type NotificationCategory, type NotificationPreferenceItem } from '@greenscape/validation';

export const MAX_PUSH_ATTEMPTS = 6;
export const PUSH_LEASE_MS = 2 * 60_000;
/** A subscription whose last this-many notifications all failed for good (after every retry) is treated as dead and removed. */
export const MAX_SUBSCRIPTION_FAILURES = 5;

/** Delay before retry number `attempt` (1 = the first retry): 30 s, 1 min, 2 min, 4 min, 8 min, capped at 1 h, ±20% jitter. */
export function backoffMs(attempt: number, random = Math.random()) {
  const base = Math.min(30_000 * 2 ** Math.max(0, attempt - 1), 3_600_000);
  return Math.round(base * (0.8 + random * 0.4));
}

export type PushOutcome = { kind: 'sent' } | { kind: 'gone' } | { kind: 'retry'; reason: string } | { kind: 'failed'; reason: string };

/** Maps a Web Push service response to what we do next. 404/410 = subscription expired or revoked; 429/5xx/network = try again. */
export function classifyPushError(err: { statusCode?: number; message?: string }): PushOutcome {
  const status = err.statusCode;
  const reason = `${status ?? 'network'}: ${(err.message ?? 'unknown error').slice(0, 200)}`;
  if (status === 404 || status === 410) return { kind: 'gone' };
  if (status === undefined || status === 429 || status >= 500 || status === 408) return { kind: 'retry', reason };
  return { kind: 'failed', reason }; // 400/401/403/413: retrying the same request cannot succeed
}

export interface EffectivePreference { inApp: boolean; push: boolean; sound: boolean }

/** No saved row = everything on. Locked categories (security) always reach the inbox. Push needs the inbox: no hidden pushes. */
export function effectivePreference(category: NotificationCategory, saved?: Pick<NotificationPreferenceItem, 'inApp' | 'push' | 'sound'> | null): EffectivePreference {
  const inApp = NOTIFICATION_CATEGORIES[category].locked ? true : (saved?.inApp ?? true);
  return { inApp, push: inApp && (saved?.push ?? true), sound: saved?.sound ?? true };
}

/** Cursor = "<createdAt ISO>_<id>": stable under inserts, no OFFSET scans. */
export const encodeCursor = (createdAt: Date, id: string) => `${createdAt.toISOString()}_${id}`;
export function decodeCursor(cursor: string): { createdAt: Date; id: string } | null {
  const i = cursor.indexOf('_');
  const createdAt = new Date(cursor.slice(0, i));
  const id = cursor.slice(i + 1);
  return i > 0 && !Number.isNaN(createdAt.getTime()) && /^[0-9a-f-]{36}$/.test(id) ? { createdAt, id } : null;
}

/** Web Push delivery hints: urgent items wake the device, low-priority ones wait for it. */
export function pushOptions(priority: 'LOW' | 'NORMAL' | 'HIGH' | 'URGENT') {
  return priority === 'URGENT' || priority === 'HIGH'
    ? { TTL: 86_400, urgency: 'high' as const }
    : priority === 'LOW'
      ? { TTL: 3_600, urgency: 'low' as const }
      : { TTL: 21_600, urgency: 'normal' as const };
}
