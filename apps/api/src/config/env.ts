import { csv, loadEnv, nodeEnv, z } from '@greenscape/config';

export const EnvSchema = z.object({
  NODE_ENV: nodeEnv,
  API_PORT: z.coerce.number().int().default(4000),
  API_PUBLIC_URL: z.string().url().default('http://localhost:4000'),
  DATABASE_URL: z.string().startsWith('postgres'),
  MONGODB_URL: z.string().startsWith('mongodb'),
  MONGODB_DB: z.string().default('greenscape'),
  REDIS_URL: z.string().startsWith('redis'),
  SUPABASE_URL: z.string().url(),
  SUPABASE_SECRET_KEY: z.string().min(20),
  WEB_URL: z.string().url().default('http://localhost:3000'),
  ADMIN_URL: z.string().url().default('http://localhost:3001'),
  // Mail: unset SMTP_URL logs messages instead of sending (dev without Mailpit).
  SMTP_URL: z.string().optional().or(z.literal('').transform(() => undefined)),
  MAIL_FROM: z.string().default('Greenscape Palawan <no-reply@greenscapelandscapingph.com>'),
  QUOTE_NOTIFY_TO: csv,
  // Shared with the web app: lets the API trigger revalidation and read drafts for preview (server-to-server only).
  REVALIDATE_SECRET: z.string().min(16).optional().or(z.literal('').transform(() => undefined)),
  PREVIEW_SECRET: z.string().min(16).optional().or(z.literal('').transform(() => undefined)),
  // Payments (Phase 8). Live keys are refused unless PAYMENTS_LIVE_APPROVED=true (never set in this repository).
  PAYMENT_PROVIDER: z.enum(['mock', 'stripe_test']).default('mock'),
  STRIPE_SECRET_KEY: z.string().optional().or(z.literal('').transform(() => undefined)),
  STRIPE_WEBHOOK_SECRET: z.string().optional().or(z.literal('').transform(() => undefined)),
  PAYMENTS_LIVE_APPROVED: z.enum(['true', 'false']).default('false').transform((v) => v === 'true'),
  MOCK_PAYMENT_SECRET: z.string().min(16).optional().or(z.literal('').transform(() => undefined)),
  RESERVATION_MINUTES: z.coerce.number().int().min(5).max(24 * 60).default(30),
  ORDER_NOTIFY_TO: csv,
  FORM_RATE_LIMIT_PER_HOUR: z.coerce.number().int().positive().default(10),
  CACHE_PREFIX: z.string().default('gs:dev'),
  CORS_ORIGINS: csv,
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent']).default('info'),
  RATE_LIMIT_PER_MIN: z.coerce.number().int().positive().default(300),
  SENTRY_DSN: z.string().url().optional().or(z.literal('').transform(() => undefined)),
  APP_VERSION: z.string().default('0.1.0'),
});
export type Env = z.infer<typeof EnvSchema>;

export const readEnv = (source?: Record<string, string | undefined>) => loadEnv(EnvSchema, source);
