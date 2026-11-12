'use client';
import { useEffect, useState } from 'react';
import { correctionAttachmentSlot } from '@/app/actions';

/** Shrinks a camera photo to at most 720 px (JPEG) on the phone, so the upload is small on mobile data. */
async function shrink(file: File): Promise<Blob> {
  try {
    const img = await createImageBitmap(file);
    const scale = Math.min(1, 720 / Math.max(img.width, img.height));
    const canvas = document.createElement('canvas');
    canvas.width = Math.round(img.width * scale);
    canvas.height = Math.round(img.height * scale);
    canvas.getContext('2d')!.drawImage(img, 0, 0, canvas.width, canvas.height);
    const out = await new Promise<Blob | null>((ok) => canvas.toBlob(ok, 'image/jpeg', 0.8));
    return out ?? file;
  } catch {
    return file; // browser can't decode it (e.g. HEIC): send as is; the API checks the type
  }
}

/**
 * Clock-in selfie (decision D6, switched on by HR). Opens the front camera on phones; the photo goes straight to private
 * storage and its id is sent with the clock form. No face recognition: HR looks at it if a time is ever disputed.
 */
export function SelfieField({ mode, retentionDays, onReady }: { mode: 'optional' | 'required'; retentionDays: number; onReady: (id: string | null) => void }) {
  const [preview, setPreview] = useState<string | null>(null);
  const [state, setState] = useState<'idle' | 'uploading' | 'done' | 'error'>('idle');
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);

  const pick = async (file: File | undefined) => {
    onReady(null);
    if (!file) return;
    setPreview(URL.createObjectURL(file));
    setState('uploading');
    const blob = await shrink(file);
    const type = blob.type || file.type;
    const slot = await correctionAttachmentSlot({ contentType: type, size: blob.size });
    const put = slot.ok ? await fetch(slot.data.uploadUrl, { method: 'PUT', headers: { 'content-type': type, 'x-upsert': 'false' }, body: blob }).catch(() => null) : null;
    if (!slot.ok || !put?.ok) return setState('error');
    setState('done');
    onReady(slot.data.id);
  };

  return (
    <div className="flex flex-col gap-2" data-testid="selfie">
      <label className="flex cursor-pointer items-center gap-3 self-start rounded-lg border border-rule-strong px-4 py-3 text-base font-medium">
        {/* eslint-disable-next-line @next/next/no-img-element -- a local blob preview, nothing for next/image to optimise */}
        {preview ? <img src={preview} alt="Your selfie" className="size-14 rounded-md object-cover" /> : <span aria-hidden className="text-2xl">📷</span>}
        <span>{preview ? 'Retake selfie' : `Take a selfie${mode === 'optional' ? ' (optional)' : ''}`}</span>
        <input type="file" accept="image/*" capture="user" className="sr-only" onChange={(e) => void pick(e.target.files?.[0])} />
      </label>
      <p role="status" className="text-sm text-ink-2">
        {state === 'uploading' ? 'Saving your photo…' : state === 'done' ? 'Photo ready.' : state === 'error' ? 'The photo did not save. Check your connection and take it again.' : ''}
      </p>
      <p className="text-xs text-muted">
        Your photo is taken with each clock in and out so HR can confirm it was you. Only HR can see it, it is deleted after {retentionDays} days,
        and it is not used for face recognition.
      </p>
    </div>
  );
}
