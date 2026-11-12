// Employee uploads (correction attachments, clock-in selfies) and the selfie setting. Files go straight from the phone
// to the private employee bucket through a one-time signed link; the API verifies them before anything refers to them.
import { randomUUID } from 'node:crypto';
import { BUCKETS } from '@greenscape/storage';
import { SelfieSettings } from '@greenscape/validation';
import type { Deps } from '../../lib/deps.ts';
import { AppError } from '../../lib/errors.ts';

export const PRIVATE = BUCKETS.employeePrivate.id;
export const PENDING_UPLOADS = 'attendance/pending/';
const EXT: Record<string, string> = { 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp', 'application/pdf': 'pdf' };
export const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp'];
export const ATTACHMENT_TYPES = [...PHOTO_TYPES, 'application/pdf'];

/** Reserves a slot; refCount 0 until a correction or punch claims it (unclaimed ones are removed by `pnpm media:sweep`). */
export async function reserveUpload({ db, storage }: Pick<Deps, 'db' | 'storage'>, userId: string, contentType: string, size: number) {
  const id = randomUUID();
  const path = `${PENDING_UPLOADS}${id}.${EXT[contentType]}`;
  const slot = await storage.signedUpload(PRIVATE, path);
  await db.mediaAsset.create({ data: { id, bucket: PRIVATE, path, mimeType: contentType, sizeBytes: size, refCount: 0, uploadedById: userId } });
  return { id, uploadUrl: slot.url };
}

/** Reserved by this person, unclaimed, uploaded, within size, of an allowed type and really that type. */
export async function verifyUpload({ db, storage }: Pick<Deps, 'db' | 'storage'>, id: string, userId: string, types: string[], what: string) {
  const a = await db.mediaAsset.findUnique({ where: { id } });
  if (!a || a.bucket !== PRIVATE || !a.path.startsWith(PENDING_UPLOADS) || a.refCount !== 0 || a.uploadedById !== userId || !types.includes(a.mimeType)) throw AppError.badRequest(`The ${what} is invalid or already used. Please add it again.`);
  const info = await storage.inspect(PRIVATE, a.path);
  if (!info) throw AppError.badRequest(`The ${what} did not finish uploading. Please try again.`);
  if (info.size > BUCKETS.employeePrivate.fileSizeLimit || info.mime !== a.mimeType) throw AppError.badRequest(`The ${what} must be a ${types.includes('application/pdf') ? 'photo or PDF' : 'photo'} of 10 MB or less.`);
  return a;
}

/** Deletes clock-in selfies older than the retention period (file, media row, and the punch's reference). */
export async function purgeOldSelfies(deps: Pick<Deps, 'db' | 'storage' | 'log'>, now = new Date()) {
  const { retentionDays } = await selfieSettings(deps);
  const old = await deps.db.timePunch.findMany({ where: { photoMediaId: { not: null }, at: { lt: new Date(now.getTime() - retentionDays * 86_400_000) } }, select: { id: true, photoMediaId: true }, take: 500 });
  if (!old.length) return 0;
  const ids = old.map((p) => p.photoMediaId!);
  const assets = await deps.db.mediaAsset.findMany({ where: { id: { in: ids } }, select: { path: true } });
  if (assets.length) await deps.storage.remove(PRIVATE, assets.map((a) => a.path)); // files first: a failure leaves rows to retry next time
  await deps.db.$transaction([
    deps.db.timePunch.updateMany({ where: { id: { in: old.map((p) => p.id) } }, data: { photoMediaId: null } }),
    deps.db.mediaAsset.deleteMany({ where: { id: { in: ids } } }),
  ]);
  return old.length;
}

export const SELFIE_KEY = 'attendance.selfie';
/** Decision D6: off unless HR turns it on. */
export async function selfieSettings({ db }: Pick<Deps, 'db'>) {
  const row = await db.appSetting.findUnique({ where: { key: SELFIE_KEY } });
  return SelfieSettings.parse(row?.value ?? {});
}
