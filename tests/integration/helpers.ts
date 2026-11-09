import { readEnv } from '../../apps/api/src/config/env.ts';
import { createDeps } from '../../apps/api/src/lib/deps.ts';
import { createLogger } from '../../apps/api/src/lib/logger.ts';

export async function testDeps(overrides: Record<string, string> = {}) {
  const env = readEnv({ ...process.env, LOG_LEVEL: 'silent', CACHE_PREFIX: `gs:test:${process.pid}`, CORS_ORIGINS: 'http://localhost:3000', ...overrides });
  return createDeps(env, createLogger('silent', false));
}
