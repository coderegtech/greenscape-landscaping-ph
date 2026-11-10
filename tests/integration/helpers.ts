import { readEnv } from '../../apps/api/src/config/env.ts';
import { createDeps } from '../../apps/api/src/lib/deps.ts';
import { createLogger } from '../../apps/api/src/lib/logger.ts';

// Business-logic suites use password-only (aal1) tokens, so staff MFA is off here; mfa.test.ts turns it on.
export async function testDeps(overrides: Record<string, string> = {}) {
  const env = readEnv({ ...process.env, LOG_LEVEL: 'silent', CACHE_PREFIX: `gs:test:${process.pid}`, CORS_ORIGINS: 'http://localhost:3000', REQUIRE_STAFF_MFA: 'false', ...overrides });
  return createDeps(env, createLogger('silent', false));
}
