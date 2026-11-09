import { csv, loadEnv, nodeEnv, z } from '@greenscape/config';

export const EnvSchema = z.object({
  NODE_ENV: nodeEnv,
  API_PORT: z.coerce.number().int().default(4000),
  API_PUBLIC_URL: z.string().url().default('http://localhost:4000'),
  DATABASE_URL: z.string().startsWith('postgres'),
  MONGODB_URL: z.string().startsWith('mongodb'),
  MONGODB_DB: z.string().default('greenscape'),
  REDIS_URL: z.string().startsWith('redis'),
  CACHE_PREFIX: z.string().default('gs:dev'),
  CORS_ORIGINS: csv,
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(300),
  SENTRY_DSN: z.string().url().optional().or(z.literal('').transform(() => undefined)),
  APP_VERSION: z.string().default('0.1.0'),
});
export type Env = z.infer<typeof EnvSchema>;

export const readEnv = (source?: Record<string, string | undefined>) => loadEnv(EnvSchema, source);
