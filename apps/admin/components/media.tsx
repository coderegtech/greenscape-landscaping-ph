'use client';
import { Button } from '@greenscape/ui/components/button';
import { Dialog, DialogContent, DialogDescription, DialogTitle, DialogTrigger } from '@greenscape/ui/components/dialog';
import { toast } from '@greenscape/ui/components/sonner';
import { cn } from '@greenscape/ui/lib/utils';
import { ImagePlus, Search, Upload } from 'lucide-react';
import { useState } from 'react';
import { completeUpload, createUpload, listMedia } from '@/app/(console)/cms/actions';

export interface Asset { id: string; url: string; alt: string; width: number | null; height: number | null; blurDataUrl: string | null; sizeBytes: number; mimeType: string; createdAt: string }
export interface MediaRef { url: string; alt: string; width?: number; height?: number; blurDataUrl?: string; storagePath?: string }

/** Admin thumbnails: plain lazy <img> (library holds Supabase and legacy Firebase URLs; no optimiser needed in the console). */
export function Thumb({ src, alt = '', className }: { src: string; alt?: string; className?: string }) {
  // eslint-disable-next-line @next/next/no-img-element
  return <img src={src} alt={alt} loading="lazy" decoding="async" className={cn('absolute inset-0 size-full object-cover', className)} />;
}

const ACCEPT = ['image/jpeg', 'image/png', 'image/webp', 'image/avif', 'image/gif'];
const MAX = 15 * 1024 * 1024;

export const toRef = (a: Asset): MediaRef => ({ url: a.url, alt: a.alt || 'Greenscape photograph', ...(a.width ? { width: a.width } : {}), ...(a.height ? { height: a.height } : {}), ...(a.blurDataUrl ? { blurDataUrl: a.blurDataUrl } : {}) });

/** Upload files through signed URLs; returns the completed assets. Errors are toasted per file. */
export async function uploadFiles(files: File[], onProgress?: (done: number, total: number) => void): Promise<Asset[]> {
  const out: Asset[] = [];
  let done = 0;
  for (const file of files) {
    if (!ACCEPT.includes(file.type)) { toast.error(`${file.name}: JPG, PNG, WebP, AVIF or GIF only`); continue; }
    if (file.size > MAX) { toast.error(`${file.name}: larger than 15 MB`); continue; }
    const slot = await createUpload(file.name, file.type, file.size);
    if (!slot.ok) { toast.error(`${file.name}: ${slot.error}`); continue; }
    const put = await fetch(slot.data.uploadUrl, { method: 'PUT', headers: { 'content-type': file.type }, body: file });
    if (!put.ok) { toast.error(`${file.name}: upload failed`); continue; }
    const alt = file.name.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
    const doneRes = await completeUpload(slot.data.id, alt);
    if (!doneRes.ok) { toast.error(`${file.name}: ${doneRes.error}`); continue; }
    out.push(doneRes.data as Asset);
    onProgress?.(++done, files.length);
  }
  return out;
}

/** Drop zone + file button. Keyboard: the button opens the file chooser. */
export function DropZone({ onUploaded, compact }: { onUploaded: (a: Asset[]) => void; compact?: boolean }) {
  const [over, setOver] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const handle = async (files: FileList | File[]) => {
    const list = [...files];
    if (!list.length) return;
    setBusy(`Uploading 0 of ${list.length}`);
    const assets = await uploadFiles(list, (d, t) => setBusy(`Uploading ${d} of ${t}`));
    setBusy(null);
    if (assets.length) toast.success(`${assets.length} image${assets.length > 1 ? 's' : ''} added to the library`);
    onUploaded(assets);
  };
  return (
    <div
      onDragOver={(e) => { e.preventDefault(); setOver(true); }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => { e.preventDefault(); setOver(false); void handle(e.dataTransfer.files); }}
      className={cn('flex flex-col items-center justify-center gap-3 border-2 border-dashed text-center transition-colors duration-(--dur-short)', compact ? 'p-4' : 'p-10', over ? 'border-signal bg-paper-2' : 'border-rule-strong')}
      data-testid="dropzone"
    >
      <Upload aria-hidden className="size-6 text-muted" />
      <p className="text-sm text-ink-2">{busy ?? 'Drag photographs here, or'}</p>
      {!busy && (
        <label className="inline-flex h-10 cursor-pointer items-center rounded-pill border-[1.5px] border-signal px-4 text-sm font-bold text-signal has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-focus">
          Choose files
          <input type="file" multiple accept={ACCEPT.join(',')} className="sr-only" onChange={(e) => { void handle(e.target.files ?? []); e.target.value = ''; }} />
        </label>
      )}
      <p className="text-xs text-muted">JPG, PNG, WebP, AVIF or GIF, up to 15 MB each</p>
    </div>
  );
}

function useLibrary() {
  const [items, setItems] = useState<Asset[]>([]);
  const [q, setQ] = useState('');
  const load = async (query = q) => {
    const res = await listMedia(query);
    if (res.ok) setItems(res.data.items);
  };
  return { items, setItems, q, setQ, load };
}

/** Choose (or upload) an image for a field. */
export function MediaPicker({ value, onChange, label, invalid }: { value?: MediaRef | null; onChange: (v: MediaRef | null) => void; label: string; invalid?: boolean }) {
  const [open, setOpen] = useState(false);
  const lib = useLibrary();
  return (
    <div className="flex items-start gap-3">
      <div className={cn('relative grid size-24 shrink-0 place-items-center overflow-clip border bg-paper-3', invalid ? 'border-danger' : 'border-rule-strong')}>
        {value?.url ? <Thumb src={value.url} alt={value.alt} /> : <ImagePlus aria-hidden className="size-6 text-muted" />}
      </div>
      <div className="flex min-w-0 flex-col gap-2">
        {value?.url && (
          <label className="flex flex-col gap-1 text-xs text-muted">
            Alt text (describes the photo for screen readers)
            <input value={value.alt} onChange={(e) => onChange({ ...value, alt: e.target.value })} className="h-9 w-72 max-w-full border border-rule-strong bg-paper-3 px-2 text-sm text-ink" />
          </label>
        )}
        <div className="flex gap-2">
          <Dialog open={open} onOpenChange={(o) => { setOpen(o); if (o) void lib.load(); }}>
            <DialogTrigger asChild>
              <Button size="sm" variant="secondary" aria-label={`${value?.url ? 'Change' : 'Choose'} image: ${label}`}>{value?.url ? 'Change' : 'Choose image'}</Button>
            </DialogTrigger>
            <DialogContent className="max-w-[min(64rem,96vw)] border-rule bg-paper p-4 sm:max-w-[min(64rem,96vw)]">
              <DialogTitle className="text-xl">Choose an image</DialogTitle>
              <DialogDescription className="text-sm text-ink-2">Pick from the library or upload new photographs.</DialogDescription>
              <DropZone compact onUploaded={(a) => lib.setItems((x) => [...a, ...x])} />
              <form role="search" className="flex items-center gap-2" onSubmit={(e) => { e.preventDefault(); e.stopPropagation(); void lib.load(); }}>
                <Search aria-hidden className="size-4 text-muted" />
                <label htmlFor="media-q" className="sr-only">Search images</label>
                <input id="media-q" type="search" value={lib.q} onChange={(e) => lib.setQ(e.target.value)} placeholder="Search by alt text or file, then Enter" className="h-9 flex-1 border border-rule-strong bg-paper-3 px-2 text-sm" />
              </form>
              <ul className="grid max-h-[50svh] grid-cols-3 gap-2 overflow-y-auto sm:grid-cols-5 md:grid-cols-6" aria-label="Library">
                {lib.items.map((a) => (
                  <li key={a.id}>
                    <button type="button" onClick={() => { onChange(toRef(a)); setOpen(false); }} className="group relative block aspect-square w-full overflow-clip border border-rule hover:border-signal" aria-label={`Use ${a.alt || 'image'}`}>
                      <Thumb src={a.url} />
                    </button>
                  </li>
                ))}
                {!lib.items.length && <li className="col-span-full py-6 text-center text-sm text-muted">No images yet. Upload some above.</li>}
              </ul>
            </DialogContent>
          </Dialog>
          {value?.url && <Button size="sm" variant="ghost" onClick={() => onChange(null)}>Remove</Button>}
        </div>
      </div>
    </div>
  );
}
