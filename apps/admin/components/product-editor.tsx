'use client';
import { Button } from '@greenscape/ui/components/button';
import { toast } from '@greenscape/ui/components/sonner';
import { cn } from '@greenscape/ui/lib/utils';
import { PLANT_TYPES, PRODUCT_STATUSES, SHOP_CATEGORIES } from '@greenscape/validation';
import { ArrowDown, ArrowUp, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { saveProduct } from '@/app/(console)/shop-actions';
import { MediaPicker, Thumb } from './media';

export interface ProductForm {
  name: string; slug: string; scientificName: string; nativeName: string; category: string; plantType: string; status: string;
  isFeatured: boolean; isNew: boolean; isBestSeller: boolean;
  images: { mediaId: string; url: string; alt: string }[];
  description: string; careInstructions: string; wateringFrequency: string; sizesNote: string;
}
const STATUS_LABEL: Record<string, string> = { DRAFT: 'Draft (not on the site)', ACTIVE: 'On sale', HIDDEN: 'Hidden', ARCHIVED: 'Archived' };
const input = 'h-10 w-full border border-rule-strong bg-paper-3 px-3 text-sm text-ink aria-invalid:border-danger';
const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

export function ProductEditor({ id, initial, canWrite }: { id: string | null; initial: ProductForm; canWrite: boolean }) {
  const router = useRouter();
  const [f, setF] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);
  const [slugTouched, setSlugTouched] = useState(!!id);
  const set = <K extends keyof ProductForm>(k: K, v: ProductForm[K]) => setF((x) => ({ ...x, [k]: v, ...(k === 'name' && !slugTouched ? { slug: slugify(String(v)) } : {}) }));

  const field = (k: keyof ProductForm, label: string, opts: { hint?: string; area?: boolean; required?: boolean } = {}) => (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={`p-${k}`} className="text-sm font-medium">{label}{opts.required && <span className="text-muted"> (required)</span>}</label>
      {opts.area ? (
        <textarea id={`p-${k}`} rows={5} value={f[k] as string} onChange={(e) => set(k, e.target.value as never)} className={cn(input, 'h-auto py-2')} aria-invalid={errors[k] ? true : undefined} aria-describedby={errors[k] ? `p-${k}-e` : opts.hint ? `p-${k}-h` : undefined} />
      ) : (
        <input id={`p-${k}`} value={f[k] as string} onChange={(e) => { if (k === 'slug') setSlugTouched(true); set(k, e.target.value as never); }} className={input} aria-invalid={errors[k] ? true : undefined} aria-describedby={errors[k] ? `p-${k}-e` : opts.hint ? `p-${k}-h` : undefined} />
      )}
      {errors[k] ? <span id={`p-${k}-e`} role="alert" className="text-xs font-medium text-danger">{errors[k]}</span> : opts.hint && <span id={`p-${k}-h`} className="text-xs text-muted">{opts.hint}</span>}
    </div>
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    const res = await saveProduct(id, { ...f, scientificName: f.scientificName || null, nativeName: f.nativeName || null, plantType: f.category === 'plants' && f.plantType ? f.plantType : null, images: f.images.map((i) => ({ mediaId: i.mediaId, alt: i.alt || null })) });
    setBusy(false);
    if (res.ok) {
      setErrors({});
      toast.success('Product saved. The shop updates within a few seconds.');
      router.refresh();
      return;
    }
    if (Array.isArray(res.details)) setErrors(Object.fromEntries((res.details as { path: string; message: string }[]).map((d) => [d.path.split('.')[0]!, d.message])));
    toast.error(res.status === 400 || res.status === 409 ? 'Some fields need attention' : res.error);
  };
  const moveImg = (i: number, to: number) => setF((x) => { const imgs = [...x.images]; const [m] = imgs.splice(i, 1); imgs.splice(to, 0, m!); return { ...x, images: imgs }; });

  return (
    <form onSubmit={submit} className="flex max-w-3xl flex-col gap-8" noValidate>
      <fieldset disabled={!canWrite} className="flex flex-col gap-5">
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {field('name', 'Name', { required: true })}
          {field('slug', 'Address', { required: true, hint: `Shop page: /shop/${f.slug || '…'}` })}
          {field('scientificName', 'Scientific name')}
          {field('nativeName', 'Local name')}
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          <label className="flex flex-col gap-1.5 text-sm font-medium">Category
            <select value={f.category} onChange={(e) => set('category', e.target.value)} className={input}>{Object.entries(SHOP_CATEGORIES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
          </label>
          {f.category === 'plants' && (
            <label className="flex flex-col gap-1.5 text-sm font-medium">Plant type
              <select value={f.plantType} onChange={(e) => set('plantType', e.target.value)} className={input}><option value="">Not set</option>{Object.entries(PLANT_TYPES).map(([k, l]) => <option key={k} value={k}>{l}</option>)}</select>
            </label>
          )}
          <label className="flex flex-col gap-1.5 text-sm font-medium">Status
            <select value={f.status} onChange={(e) => set('status', e.target.value)} className={input}>{PRODUCT_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABEL[s]}</option>)}</select>
          </label>
        </div>
        <div className="flex flex-wrap gap-6">
          {([['isFeatured', 'Featured'], ['isNew', 'New'], ['isBestSeller', 'Best seller']] as const).map(([k, l]) => (
            <label key={k} className="flex items-center gap-2 text-sm"><input type="checkbox" checked={f[k]} onChange={(e) => set(k, e.target.checked)} className="size-5 accent-(--gs-signal)" />{l}</label>
          ))}
        </div>

        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-sm font-medium">Photos <span className="text-muted">(the first is the cover)</span></legend>
          <ol className="flex flex-col gap-2">
            {f.images.map((img, i) => (
              <li key={`${img.mediaId}-${i}`} className="flex items-center gap-3 border-b border-rule pb-2">
                <div className="relative size-16 shrink-0 overflow-clip bg-paper-3"><Thumb src={img.url} /></div>
                <label className="flex min-w-0 flex-1 flex-col gap-1 text-xs text-muted">Alt text
                  <input value={img.alt} onChange={(e) => setF((x) => ({ ...x, images: x.images.map((m, j) => (j === i ? { ...m, alt: e.target.value } : m)) }))} className={input} />
                </label>
                <Button type="button" size="icon-sm" variant="ghost" aria-label={`Move photo ${i + 1} up`} disabled={i === 0} onClick={() => moveImg(i, i - 1)}><ArrowUp /></Button>
                <Button type="button" size="icon-sm" variant="ghost" aria-label={`Move photo ${i + 1} down`} disabled={i === f.images.length - 1} onClick={() => moveImg(i, i + 1)}><ArrowDown /></Button>
                <Button type="button" size="icon-sm" variant="ghost" aria-label={`Remove photo ${i + 1}`} onClick={() => setF((x) => ({ ...x, images: x.images.filter((_, j) => j !== i) }))}><Trash2 /></Button>
              </li>
            ))}
          </ol>
          {f.images.length < 12 && <MediaPicker key={f.images.length} label="Add a photo" value={null} onChange={() => {}} onAsset={(a) => setF((x) => ({ ...x, images: [...x.images, { mediaId: a.id, url: a.url, alt: a.alt }] }))} />}
          {errors.images && <span role="alert" className="text-xs font-medium text-danger">{errors.images}</span>}
        </fieldset>

        {field('description', 'Description', { area: true, hint: 'Leave a blank line between paragraphs.' })}
        {field('careInstructions', 'Care instructions', { area: true })}
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-2">
          {field('wateringFrequency', 'Watering')}
          {field('sizesNote', 'Sizes note', { hint: 'Shown under the price, e.g. "Small 30–50 cm, Medium 60–100 cm"' })}
        </div>
      </fieldset>
      {canWrite && <Button type="submit" loading={busy} className="self-start">{id ? 'Save product' : 'Create product'}</Button>}
    </form>
  );
}
