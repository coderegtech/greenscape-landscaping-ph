import { readEnv } from '../../apps/api/src/config/env.ts';
import { createDeps } from '../../apps/api/src/lib/deps.ts';
import { createLogger } from '../../apps/api/src/lib/logger.ts';

// Business-logic suites use password-only (aal1) tokens, so staff MFA is off here; mfa.test.ts turns it on.
/**
 * The clock-in selfie policy is one global setting. Suites that clock in run with a known mode and put back whatever the
 * local site had (e.g. "required") afterwards.
 */
export async function keepSelfieSetting(db: Awaited<ReturnType<typeof testDeps>>['db'], mode: 'off' | 'optional' | 'required' = 'off') {
  const saved = await db.appSetting.findUnique({ where: { key: 'attendance.selfie' } });
  await db.appSetting.upsert({ where: { key: 'attendance.selfie' }, create: { key: 'attendance.selfie', value: { mode, retentionDays: 90 } }, update: { value: { mode, retentionDays: 90 } } });
  return async () => {
    if (saved) await db.appSetting.update({ where: { key: saved.key }, data: { value: saved.value as object, updatedById: saved.updatedById } });
    else await db.appSetting.deleteMany({ where: { key: 'attendance.selfie' } });
  };
}

export async function testDeps(overrides: Record<string, string> = {}) {
  const env = readEnv({ ...process.env, LOG_LEVEL: 'silent', CACHE_PREFIX: `gs:test:${process.pid}`, CORS_ORIGINS: 'http://localhost:3000', REQUIRE_STAFF_MFA: 'false', ...overrides });
  return createDeps(env, createLogger('silent', false));
}
