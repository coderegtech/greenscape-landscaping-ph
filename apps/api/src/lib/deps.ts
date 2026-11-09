import { createCache, createRedis, type Cache, type Redis } from '@greenscape/cache';
import { connectContentDb } from '@greenscape/content';
import { createTokenVerifier, type TokenVerifier } from '@greenscape/auth/server';
import { createPrismaClient, type Db } from '@greenscape/database';
import { createStorage, type Storage } from '@greenscape/storage';
import { createMailer, type Mailer } from './mailer.ts';
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
}

export async function createDeps(env: Env, log: Logger): Promise<Deps> {
  const db = createPrismaClient(env.DATABASE_URL);
  const mongo = await connectContentDb(env.MONGODB_URL, env.MONGODB_DB);
  const redis = createRedis(env.REDIS_URL);
  redis.on('error', (err) => log.warn({ err: err.message }, 'redis error'));
  // Redis is optional at boot: the app serves from the databases while it reconnects.
  await redis.connect().catch((err) => log.warn({ err: err.message }, 'redis unavailable at boot; continuing without cache'));
  const cache = createCache({ redis, prefix: env.CACHE_PREFIX, logger: log });
  return {
    env, log, db, mongo, redis, cache,
    verifyToken: createTokenVerifier(env.SUPABASE_URL),
    storage: createStorage(env.SUPABASE_URL, env.SUPABASE_SECRET_KEY),
    mailer: createMailer(env.SMTP_URL, env.MAIL_FROM, log),
  };
}

export async function closeDeps(d: Deps) {
  await Promise.allSettled([d.db.$disconnect(), d.mongo.client.close(), d.redis.quit()]);
}
