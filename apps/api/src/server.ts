import * as Sentry from '@sentry/node';
import { readEnv } from './config/env.ts';
import { createApp } from './app.ts';
import { closeDeps, createDeps } from './lib/deps.ts';
import { createLogger } from './lib/logger.ts';
import { startScheduler } from './lib/publisher.ts';
import { startShopJobs } from './modules/shop/orders.ts';
import { startAttendanceJobs } from './modules/attendance/service.ts';
import { startAssistantJobs } from './modules/assistant/routes.ts';

const env = readEnv();
const log = createLogger(env.LOG_LEVEL, env.NODE_ENV === 'development');
if (env.SENTRY_DSN) Sentry.init({ dsn: env.SENTRY_DSN, environment: env.NODE_ENV, release: env.APP_VERSION, tracesSampleRate: 0.1 });

const deps = await createDeps(env, log);
const scheduler = startScheduler(deps);
const shopJobs = startShopJobs(deps);
const attendanceJobs = startAttendanceJobs(deps);
const assistantJobs = startAssistantJobs(deps);
const server = createApp(deps).listen(env.API_PORT, () => log.info({ port: env.API_PORT }, 'api listening'));

let closing = false;
async function shutdown(signal: string) {
  if (closing) return;
  closing = true;
  log.info({ signal }, 'shutting down');
  scheduler.stop();
  shopJobs.stop();
  attendanceJobs.stop();
  assistantJobs.stop();
  server.close();
  await closeDeps(deps);
  process.exit(0);
}
process.on('SIGTERM', () => void shutdown('SIGTERM'));
process.on('SIGINT', () => void shutdown('SIGINT'));
process.on('unhandledRejection', (err) => { log.error({ err }, 'unhandled rejection'); Sentry.captureException(err); });
