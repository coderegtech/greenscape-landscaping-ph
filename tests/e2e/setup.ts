import { createPrismaClient } from '@greenscape/database';

/**
 * The clock-in selfie policy is one global setting, and most attendance tests clock in without a photo. Run the suite
 * with selfies off and put back whatever the local site had (e.g. "required") when the run ends. Returned function =
 * Playwright's global teardown for this setup.
 */
export default async function setup() {
  const db = createPrismaClient(process.env.DATABASE_URL!);
  const saved = await db.appSetting.findUnique({ where: { key: 'attendance.selfie' } });
  await db.appSetting.upsert({ where: { key: 'attendance.selfie' }, create: { key: 'attendance.selfie', value: { mode: 'off', retentionDays: 90 } }, update: { value: { mode: 'off', retentionDays: 90 } } });
  await db.$disconnect();
  return async () => {
    const d = createPrismaClient(process.env.DATABASE_URL!);
    if (saved) await d.appSetting.update({ where: { key: saved.key }, data: { value: saved.value as object, updatedById: saved.updatedById } });
    else await d.appSetting.deleteMany({ where: { key: 'attendance.selfie' } });
    await d.$disconnect();
  };
}
