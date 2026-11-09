'use client';
import { Button } from '@greenscape/ui/components/button';
import { toast } from '@greenscape/ui/components/sonner';
import { cn } from '@greenscape/ui/lib/utils';
import { Plus } from 'lucide-react';
import { useState } from 'react';
import { collectionCreate, collectionDelete, collectionUpdate } from '@/app/(console)/cms/actions';
import { EMPTY_DOC, type Field, clean, setIn } from '@/lib/content-types';
import { Fields, FormProvider } from './fields';

type Obj = Record<string, unknown>;
type Row = { key: string; id?: string; data: Obj; dirty: boolean; errors: Record<string, string> };

const VISIBILITY: Field = { kind: 'select', key: 'status', label: 'Visibility', options: { published: 'Shown on the site', hidden: 'Hidden' }, required: true };
const CONFIG: Record<'galleryItems' | 'faqs', { itemLabel: string; fields: Field[]; titleOf: (d: Obj) => string; newItem: (n: number) => Obj }> = {
  galleryItems: {
    itemLabel: 'photo',
    fields: [
      { kind: 'image', key: 'image', label: 'Photograph', required: true },
      { kind: 'text', key: 'caption', label: 'Caption', max: 200 },
      { kind: 'select', key: 'category', label: 'Category', options: { 'garden-maintenance': 'Garden maintenance', 'garden-projects': 'Garden projects', 'landscape-design': 'Landscape design', 'outdoor-spaces': 'Outdoor spaces', 'plant-collection': 'Plant collection', 'water-features': 'Water features' } },
      { kind: 'number', key: 'sortOrder', label: 'Order (lower first)' },
      VISIBILITY,
    ],
    titleOf: (d) => (d.caption as string) || ((d.image as { alt?: string } | undefined)?.alt ?? ''),
    newItem: (n) => ({ status: 'published', sortOrder: n }),
  },
  faqs: {
    itemLabel: 'question',
    fields: [
      { kind: 'text', key: 'question', label: 'Question', required: true, max: 200 },
      { kind: 'richtext', key: 'answer', label: 'Answer', required: true },
      { kind: 'text', key: 'topic', label: 'Topic (groups questions)', required: true, max: 60 },
      { kind: 'number', key: 'sortOrder', label: 'Order (lower first)' },
      VISIBILITY,
    ],
    titleOf: (d) => (d.question as string) ?? '',
    newItem: (n) => ({ locale: 'en', topic: 'General', question: '', answer: EMPTY_DOC, status: 'published', sortOrder: n }),
  },
};

/** Gallery photos and FAQs: plain collections that go live as soon as each item is saved. */
export function CollectionManager({ name, items, canWrite }: { name: 'galleryItems' | 'faqs'; items: Obj[]; canWrite: boolean }) {
  const { itemLabel, fields, titleOf, newItem } = CONFIG[name];
  const [rows, setRows] = useState<Row[]>(() => items.map(({ id, updatedAt: _u, ...data }) => ({ key: String(id), id: String(id), data, dirty: false, errors: {} })));
  const [busy, setBusy] = useState<string | null>(null);
  const patch = (key: string, p: Partial<Row>) => setRows((rs) => rs.map((r) => (r.key === key ? { ...r, ...p } : r)));

  const save = async (row: Row) => {
    setBusy(row.key);
    const body = clean(row.data);
    const res = row.id ? await collectionUpdate(name, row.id, body) : await collectionCreate(name, body);
    setBusy(null);
    if (res.ok) {
      patch(row.key, { id: (res.data as { id: string }).id, dirty: false, errors: {} });
      return toast.success(`${itemLabel[0]!.toUpperCase()}${itemLabel.slice(1)} saved. It is live on the site.`);
    }
    if (res.status === 400 && Array.isArray(res.details)) patch(row.key, { errors: Object.fromEntries((res.details as { path: string; message: string }[]).map((d) => [d.path, d.message])) });
    toast.error(res.status === 400 ? 'Some fields need attention' : res.error);
  };
  const remove = async (row: Row) => {
    if (!window.confirm(`Delete this ${itemLabel}? This cannot be undone.`)) return;
    if (row.id) {
      setBusy(row.key);
      const res = await collectionDelete(name, row.id);
      setBusy(null);
      if (!res.ok) return void toast.error(res.error);
    }
    setRows((rs) => rs.filter((r) => r.key !== row.key));
  };

  return (
    <div className="flex flex-col gap-4">
      {canWrite && (
        <Button type="button" variant="secondary" size="sm" className="self-start" onClick={() => setRows((rs) => [{ key: crypto.randomUUID(), data: newItem(rows.length), dirty: true, errors: {} }, ...rs])}>
          <Plus /> Add {itemLabel}
        </Button>
      )}
      <ol className="flex flex-col gap-2">
        {rows.map((row) => {
          const bad = Object.keys(row.errors).length > 0;
          return (
            <li key={row.key} className={cn('border bg-paper-2', bad ? 'border-danger' : 'border-rule')}>
              <details open={!row.id || bad || undefined}>
                <summary className="flex cursor-pointer items-center justify-between gap-3 px-3 py-2 text-sm">
                  <span className="min-w-0 truncate font-medium text-ink">{titleOf(row.data) || `New ${itemLabel}`}</span>
                  <span className="shrink-0 text-xs text-muted">{row.dirty ? 'Unsaved' : row.data.status === 'hidden' ? 'Hidden' : 'Live'}</span>
                </summary>
                <div className="flex flex-col gap-5 border-t border-rule p-4">
                  <fieldset disabled={!canWrite} className="max-w-3xl">
                    <FormProvider value={{ set: (path, v) => setRows((rs) => rs.map((r) => (r.key === row.key ? { ...r, data: setIn(r.data, path, v), dirty: true } : r))), errors: row.errors }}>
                      <Fields fields={fields} value={row.data} path={[]} />
                    </FormProvider>
                  </fieldset>
                  {canWrite && (
                    <div className="flex gap-2">
                      <Button size="sm" onClick={() => save(row)} loading={busy === row.key} disabled={!!busy || !row.dirty}>Save</Button>
                      <Button size="sm" variant="danger" onClick={() => remove(row)} disabled={!!busy}>Delete</Button>
                    </div>
                  )}
                </div>
              </details>
            </li>
          );
        })}
      </ol>
      {!rows.length && <p className="text-ink-2">Nothing here yet.</p>}
    </div>
  );
}
