'use client';
import { toast } from '@greenscape/ui/components/sonner';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { importDoc } from '@/app/(console)/cms/actions';

/** Imports a greenscape-cms/1 JSON export as a draft (creates it, or saves over the draft with the same address). */
export function ImportButton({ type }: { type: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    try {
      let data: unknown;
      try { data = JSON.parse(await file.text()); } catch { return void toast.error('That file is not valid JSON'); }
      const res = await importDoc(type, data);
      if (!res.ok) return void toast.error(Array.isArray(res.details) ? `${res.error}: ${(res.details as { path: string; message: string }[]).slice(0, 3).map((d) => `${d.path} ${d.message}`).join('; ')}` : res.error);
      const slug = (res.data as { slug: string }).slug;
      toast.success('Imported as a draft');
      router.push(`/cms/${type}/${slug}`);
    } finally {
      setBusy(false);
    }
  };
  return (
    <label className="inline-flex h-10 cursor-pointer items-center rounded-pill border-[1.5px] border-signal px-4 text-sm font-bold text-signal has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus aria-busy:opacity-55" aria-busy={busy || undefined}>
      {busy ? 'Importing…' : 'Import JSON'}
      <input type="file" accept="application/json,.json" className="sr-only" disabled={busy} onChange={(e) => { void onFile(e.target.files?.[0]); e.target.value = ''; }} />
    </label>
  );
}
