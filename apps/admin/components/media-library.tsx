'use client';
import { Button } from '@greenscape/ui/components/button';
import { toast } from '@greenscape/ui/components/sonner';
import { useState } from 'react';
import { deleteMedia, setAlt } from '@/app/(console)/cms/actions';
import { type Asset, DropZone, Thumb } from './media';

export type { Asset };
const size = (b: number) => (b > 1024 * 1024 ? `${(b / 1024 / 1024).toFixed(1)} MB` : `${Math.round(b / 1024)} KB`);

function Tile({ asset, canWrite, canDelete, onDeleted }: { asset: Asset; canWrite: boolean; canDelete: boolean; onDeleted: () => void }) {
  const [alt, setAltText] = useState(asset.alt);
  const [saved, setSaved] = useState(asset.alt);
  const [busy, setBusy] = useState(false);
  const id = `alt-${asset.id}`;
  const saveAlt = async () => {
    if (alt === saved) return;
    const res = await setAlt(asset.id, alt);
    if (res.ok) { setSaved(alt); toast.success('Alt text saved'); } else toast.error(res.error);
  };
  const remove = async () => {
    if (!window.confirm('Delete this image from the library? This cannot be undone.')) return;
    setBusy(true);
    const res = await deleteMedia(asset.id);
    setBusy(false);
    if (res.ok) return onDeleted();
    const used = (res.details as { usedBy?: string[] } | undefined)?.usedBy;
    toast.error(res.status === 409 && used?.length ? `Still used by ${used.slice(0, 3).join(', ')}${used.length > 3 ? ` and ${used.length - 3} more` : ''}. Replace it there first.` : res.error);
  };
  return (
    <li className="flex min-w-0 flex-col gap-2">
      <a href={asset.url} target="_blank" rel="noreferrer" className="relative block aspect-[4/3] overflow-clip border border-rule bg-paper-3" aria-label={`Open full size: ${saved || 'image'}`}>
        <Thumb src={asset.url} />
      </a>
      <label htmlFor={id} className="sr-only">Alt text</label>
      <input id={id} value={alt} disabled={!canWrite} onChange={(e) => setAltText(e.target.value)} onBlur={saveAlt} onKeyDown={(e) => e.key === 'Enter' && (e.currentTarget.blur())} placeholder="Describe the photo" className="h-9 border border-rule-strong bg-paper-3 px-2 text-sm text-ink" />
      <div className="flex items-center justify-between gap-2 text-xs text-muted">
        <span className="tabular">{asset.width && asset.height ? `${asset.width} × ${asset.height}, ` : ''}{size(asset.sizeBytes)}</span>
        {canDelete && <Button size="sm" variant="ghost" className="h-8 px-2 text-xs" onClick={remove} loading={busy}>Delete</Button>}
      </div>
    </li>
  );
}

export function MediaLibrary({ initial, canWrite, canDelete }: { initial: Asset[]; canWrite: boolean; canDelete: boolean }) {
  const [items, setItems] = useState(initial);
  return (
    <div className="flex flex-col gap-6">
      {canWrite && <DropZone onUploaded={(a) => setItems((x) => [...a, ...x])} />}
      {items.length ? (
        <ul className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,13rem),1fr))] gap-4" aria-label="Images">
          {items.map((a) => <Tile key={a.id} asset={a} canWrite={canWrite} canDelete={canDelete} onDeleted={() => setItems((x) => x.filter((y) => y.id !== a.id))} />)}
        </ul>
      ) : (
        <p className="text-ink-2">No images yet.</p>
      )}
    </div>
  );
}
