// Live delivery: connected clients (SSE streams) subscribe per user; every API instance fans events out to its own
// clients through one Redis pub/sub channel, so a notification created on instance A reaches a client held by instance B.
// Redis is delivery only: every notification is already in Postgres, and a client that missed events (restart,
// network drop, Redis outage) re-fetches on reconnect. Without Redis the hub still serves clients of this process.
import { randomUUID } from 'node:crypto';
import type { Redis } from '@greenscape/cache';
import type { NotificationApp } from '@greenscape/validation';
import type { Logger } from '../../lib/logger.ts';

export interface HubEvent {
  userId: string;
  app: NotificationApp;
  /** created | read | read_all | deleted | cleared */
  event: string;
  data: unknown;
}
type Listener = (e: HubEvent) => void;

export function createHub({ redis, prefix, log }: { redis: Redis; prefix: string; log: Logger }) {
  const channel = `${prefix}:notif`;
  const origin = randomUUID(); // lets an instance ignore its own publishes (it already delivered locally)
  const listeners = new Map<string, Set<Listener>>();
  let sub: Redis | null = null;

  const deliver = (e: HubEvent) => listeners.get(e.userId)?.forEach((fn) => fn(e));

  async function start() {
    // The shared connection has no offline queue (fail fast for the cache); a subscriber must survive reconnects instead.
    sub = redis.duplicate({ enableOfflineQueue: true, maxRetriesPerRequest: null, lazyConnect: true });
    sub.on('error', (err) => log.warn({ err: err.message }, 'notification subscriber error'));
    sub.on('message', (_ch, raw) => {
      try {
        const m = JSON.parse(raw) as { origin: string; e: HubEvent };
        if (m.origin !== origin) deliver(m.e);
      } catch (err) {
        log.warn({ err: (err as Error).message }, 'bad notification bus message');
      }
    });
    await sub.connect().then(() => sub!.subscribe(channel)).catch((err) => log.warn({ err: err.message }, 'notification bus unavailable; live delivery is limited to this instance'));
  }

  return {
    start,
    /** Register a client; returns the unsubscribe function. */
    subscribe(userId: string, fn: Listener) {
      const set = listeners.get(userId) ?? new Set();
      set.add(fn);
      listeners.set(userId, set);
      return () => {
        set.delete(fn);
        if (!set.size) listeners.delete(userId);
      };
    },
    publish(e: HubEvent) {
      deliver(e);
      if (redis.status === 'ready') void redis.publish(channel, JSON.stringify({ origin, e })).catch(() => undefined);
    },
    count: (userId: string) => listeners.get(userId)?.size ?? 0,
    connections: () => [...listeners.values()].reduce((n, s) => n + s.size, 0),
    async close() {
      listeners.clear();
      await sub?.quit().catch(() => undefined);
    },
  };
}
export type Hub = ReturnType<typeof createHub>;
