import { createIdentityAdmin, type IdentityAdmin } from '@greenscape/auth/admin';
import { createCache, createRedis, type Cache, type Redis } from '@greenscape/cache';
import { connectContentDb } from '@greenscape/content';
import { createTokenVerifier, type TokenVerifier } from '@greenscape/auth/server';
import { createPrismaClient, type Db } from '@greenscape/database';
import { createStorage, type Storage } from '@greenscape/storage';
import { createMailer, type Mailer } from './mailer.ts';
import { createEventBus, type EventBus } from './events.ts';
import { createRealtime, type Realtime } from '../realtime/server.ts';
import { registerRealtimeHandlers } from '../realtime/handlers.ts';
import { registerNotificationHandlers } from '../modules/notifications/handlers.ts';
import { createNotifications, type Notifications } from '../modules/notifications/service.ts';
import { createMockProvider, createStripeProvider, type PaymentProvider } from '../modules/shop/payments.ts';
import type { MongoClient, MongoDb } from '@greenscape/content';
import type { Env } from '../config/env.ts';
import type { Logger } from './logger.ts';

/** Everything with a connection. Built once in server.ts, injected into createApp (tests build their own). */
export interface Deps {
  env: Env;
  log: Logger;
  db: Db;
  mongo: { client: MongoClient; db: MongoDb };
  redis: Redis;
  cache: Cache;
  verifyToken: TokenVerifier;
  storage: Storage;
  mailer: Mailer;
  payments: PaymentProvider;
  /** Supabase Auth admin (service role): email confirmation checks and bans. */
  identities: IdentityAdmin;
  /** Domain events: business code emits, notifications (and anything later) subscribe. */
  events: EventBus;
  notifications: Notifications;
  /** Socket.IO: notification delivery and live "this changed" signals to the portals. */
  realtime: Realtime;
}

export function createPayments(env: Env, redis: Redis): PaymentProvider {
  if (env.PAYMENT_PROVIDER === 'stripe_test') return createStripeProvider({ secretKey: env.STRIPE_SECRET_KEY, webhookSecret: env.STRIPE_WEBHOOK_SECRET, liveApproved: env.PAYMENTS_LIVE_APPROVED });
  if (!env.MOCK_PAYMENT_SECRET) throw new Error('PAYMENT_PROVIDER=mock needs MOCK_PAYMENT_SECRET (16+ characters)');
  return createMockProvider({ secret: env.MOCK_PAYMENT_SECRET, webUrl: env.WEB_URL, redis, prefix: env.CACHE_PREFIX });
}

export async function createDeps(env: Env, log: Logger): Promise<Deps> {
  const db = createPrismaClient(env.DATABASE_URL);
  const mongo = await connectContentDb(env.MONGODB_URL, env.MONGODB_DB);
  const redis = createRedis(env.REDIS_URL);
  redis.on('error', (err) => log.warn({ err: err.message }, 'redis error'));
  // Redis is optional at boot: the app serves from the databases while it reconnects.
  await redis.connect().catch((err) => log.warn({ err: err.message }, 'redis unavailable at boot; continuing without cache'));
  const cache = createCache({ redis, prefix: env.CACHE_PREFIX, logger: log });
  const events = createEventBus(log);
  const realtime = createRealtime({ env, log, redis });
  const notifications = createNotifications({ db, redis, env, log, realtime });
  const deps: Deps = {
    env, log, db, mongo, redis, cache, events, notifications, realtime,
    verifyToken: createTokenVerifier(env.SUPABASE_URL),
    storage: createStorage(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY),
    mailer: createMailer(env.SMTP_URL, env.MAIL_FROM, log),
    payments: createPayments(env, redis),
    identities: createIdentityAdmin(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY),
  };
  registerNotificationHandlers(deps, notifications);
  registerRealtimeHandlers(deps);
  realtime.start(deps);
  return deps;
}

export async function closeDeps(d: Deps) {
  await Promise.allSettled([d.realtime.close(), d.db.$disconnect(), d.mongo.client.close(), d.redis.quit()]);
}
