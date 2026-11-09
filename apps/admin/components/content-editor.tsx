'use client';
import { Badge } from '@greenscape/ui/components/badge';
import { Button } from '@greenscape/ui/components/button';
import { toast } from '@greenscape/ui/components/sonner';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@greenscape/ui/components/tabs';
import { useEffect, useState } from 'react';
import { exportDoc, previewLink, publish, revisions, rollback, saveDraft, setState } from '@/app/(console)/cms/actions';
import { CONTENT_TYPES, clean, setIn, type Field, type TypeKey } from '@/lib/content-types';
import { Fields, FormProvider } from './fields';

type Obj = Record<string, unknown>;
export interface CmsDoc { slug: string; locale: string; status: string; revision: number; draft?: Obj; published?: Obj; seo?: Obj; publishAt?: string | null; publishedAt?: string | null; updatedAt?: string }
type Rev = { revision: number; note?: string; createdAt: string; by: { displayName?: string | null; email?: string } | null };

export const STATUS_LABEL: Record<string, string> = { draft: 'Draft', scheduled: 'Scheduled', published: 'Published', archived: 'Archived' };
const fmt = (iso: string) => new Date(iso).toLocaleString('en-PH', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Asia/Manila' });

const SEO_FIELDS: Field[] = [
  { kind: 'text', key: 'title', label: 'Search title', hint: 'Shown in search results and browser tabs. Leave empty to use the title.', max: 70 },
  { kind: 'textarea', key: 'description', label: 'Search description', hint: 'One or two sentences, up to 170 characters.', max: 170 },
  { kind: 'image', key: 'ogImage', label: 'Sharing image', hint: 'Shown when the page is shared on social media.' },
  { kind: 'toggle', key: 'noindex', label: 'Hide from search engines' },
];

export function ContentEditor({ type, doc, canWrite, canPublish }: { type: TypeKey; doc: CmsDoc; canWrite: boolean; canPublish: boolean }) {
  const def = CONTENT_TYPES[type];
  const [body, setBody] = useState<Obj>(doc.draft ?? doc.published ?? {});
  const [seo, setSeo] = useState<Obj>(doc.seo ?? {});
  const [meta, setMeta] = useState({ revision: doc.revision, status: doc.status, publishAt: doc.publishAt ?? null, publishedAt: doc.publishedAt ?? null });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [at, setAt] = useState('');
  const [json, setJson] = useState('');
  const [revs, setRevs] = useState<Rev[] | null>(null);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const setBodyAt = (path: (string | number)[], v: unknown) => { setBody((b) => setIn(b, path, v)); setDirty(true); };
  const setSeoAt = (path: (string | number)[], v: unknown) => { setSeo((s) => setIn(s, path, v)); setDirty(true); };

  const fail = (res: { status: number; error: string; details?: unknown }) => {
    if (res.status === 400 && Array.isArray(res.details)) {
      setErrors(Object.fromEntries((res.details as { path: string; message: string }[]).map((d) => [d.path, d.message])));
      toast.error(`${res.details.length} field${res.details.length > 1 ? 's need' : ' needs'} attention`);
    } else toast.error(res.error);
  };

  /** Saves the draft if it changed; returns false when the save failed. */
  const save = async () => {
    if (!dirty) return true;
    const res = await saveDraft(type, doc.slug, clean(body), clean(seo), meta.revision);
    if (!res.ok) { fail(res); return false; }
    const d = res.data as CmsDoc;
    setMeta((m) => ({ ...m, revision: d.revision, status: d.status }));
    setErrors({});
    setDirty(false);
    setRevs(null);
    return true;
  };

  const run = async (label: string, fn: () => Promise<void>) => {
    setBusy(label);
    try { await fn(); } finally { setBusy(null); }
  };

  const onSave = () => run('save', async () => { if (await save()) toast.success('Draft saved'); });
  const onPublish = (when?: string) =>
    run('publish', async () => {
      if (!(await save())) return;
      const res = await publish(type, doc.slug, when);
      if (!res.ok) return fail(res);
      const d = res.data as CmsDoc;
      setMeta({ revision: d.revision, status: d.status, publishAt: d.publishAt ?? null, publishedAt: d.publishedAt ?? null });
      setRevs(null);
      toast.success(d.status === 'scheduled' && d.publishAt ? `Scheduled for ${fmt(d.publishAt)}` : 'Published. The site updates within a few seconds.');
    });
  const onState = (action: 'unpublish' | 'archive') =>
    run(action, async () => {
      if (action === 'archive' && !window.confirm('Archive this? It disappears from the site and the list of drafts.')) return;
      const res = await setState(type, doc.slug, action);
      if (!res.ok) return fail(res);
      const d = res.data as CmsDoc;
      setMeta((m) => ({ ...m, revision: d.revision, status: d.status, publishAt: null }));
      toast.success(action === 'archive' ? 'Archived' : 'Taken off the site; kept as a draft');
    });
  const onPreview = () =>
    run('preview', async () => {
      if (!(await save())) return;
      const res = await previewLink(type, doc.slug);
      if (!res.ok) return void toast.error(res.error);
      window.open(res.data, '_blank', 'noopener');
    });
  const onExport = () =>
    run('export', async () => {
      const res = await exportDoc(type, doc.slug);
      if (!res.ok) return fail(res);
      const a = document.createElement('a');
      a.href = URL.createObjectURL(new Blob([JSON.stringify(res.data, null, 2)], { type: 'application/json' }));
      a.download = `${type}-${doc.slug}-${doc.locale}.json`;
      a.click();
      URL.revokeObjectURL(a.href);
    });
  const loadRevs = async () => {
    const res = await revisions(type, doc.slug);
    if (res.ok) setRevs(res.data as Rev[]);
    else toast.error(res.error);
  };
  const onRollback = (revision: number) =>
    run('rollback', async () => {
      if (dirty && !window.confirm('Discard your unsaved changes and restore this version?')) return;
      const res = await rollback(type, doc.slug, revision);
      if (!res.ok) return fail(res);
      const d = res.data as CmsDoc;
      setBody(d.draft ?? {});
      setMeta((m) => ({ ...m, revision: d.revision, status: d.status }));
      setDirty(false);
      setErrors({});
      await loadRevs();
      toast.success(`Version ${revision} restored as the draft. Publish to put it live.`);
    });

  const title = (body.title as string) || doc.slug;
  const errorCount = Object.keys(errors).length;
  const live = meta.status === 'published';

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-start justify-between gap-4 border-b border-rule pb-4">
        <div className="flex min-w-0 flex-col gap-1">
          <h2 className="truncate text-3xl">{title}</h2>
          <p className="flex flex-wrap items-center gap-2 text-sm text-muted">
            <Badge variant={live ? 'signal' : 'outline'}>{STATUS_LABEL[meta.status] ?? meta.status}</Badge>
            <span className="tabular">{def.publicPath(doc.slug)}</span>
            {meta.status === 'scheduled' && meta.publishAt && <span>goes live {fmt(meta.publishAt)}</span>}
            {live && meta.publishedAt && <span>published {fmt(meta.publishedAt)}</span>}
            {dirty && <span className="text-ink-2">Unsaved changes</span>}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="ghost" size="sm" onClick={onPreview} loading={busy === 'preview'} disabled={!!busy}>Preview</Button>
          {canWrite && <Button variant="secondary" size="sm" onClick={onSave} loading={busy === 'save'} disabled={!!busy || !dirty}>Save draft</Button>}
          {canPublish && <Button size="sm" onClick={() => onPublish()} loading={busy === 'publish'} disabled={!!busy}>{dirty || !live ? 'Publish' : 'Republish'}</Button>}
        </div>
      </header>

      {errorCount > 0 && (
        <div role="alert" className="border-l-2 border-danger bg-paper-2 px-4 py-3 text-sm text-ink">
          {errorCount} field{errorCount > 1 ? 's need' : ' needs'} attention before this can be saved. They are marked below.
        </div>
      )}

      <Tabs defaultValue="content" onValueChange={(v) => { if (v === 'history' && !revs) void loadRevs(); if (v === 'json') setJson(JSON.stringify(body, null, 2)); }}>
        <TabsList variant="line">
          <TabsTrigger value="content">Content</TabsTrigger>
          <TabsTrigger value="seo">Search and sharing</TabsTrigger>
          {canPublish && <TabsTrigger value="publishing">Publishing</TabsTrigger>}
          <TabsTrigger value="history">History</TabsTrigger>
          {canWrite && <TabsTrigger value="json">JSON</TabsTrigger>}
        </TabsList>

        <TabsContent value="content" className="pt-6">
          <fieldset disabled={!canWrite} className="max-w-3xl">
            <FormProvider value={{ set: setBodyAt, errors }}>
              <Fields fields={def.fields} value={body} path={[]} />
            </FormProvider>
          </fieldset>
        </TabsContent>

        <TabsContent value="seo" className="pt-6">
          <fieldset disabled={!canWrite} className="max-w-3xl">
            <FormProvider value={{ set: setSeoAt, errors: {} }}>
              <Fields fields={SEO_FIELDS} value={seo} path={[]} />
            </FormProvider>
          </fieldset>
        </TabsContent>

        {canPublish && (
          <TabsContent value="publishing" className="flex max-w-3xl flex-col gap-8 pt-6">
            <section className="flex flex-col gap-3">
              <h3 className="text-xl">Schedule</h3>
              <p className="text-sm text-ink-2">Saves the draft and publishes it automatically at this time (Philippine time). The live version stays as it is until then.</p>
              <div className="flex flex-wrap items-end gap-2">
                <label className="flex flex-col gap-1.5 text-sm font-medium text-ink">
                  Go live at
                  <input type="datetime-local" value={at} onChange={(e) => setAt(e.target.value)} className="h-10 border border-rule-strong bg-paper-3 px-3 text-sm" />
                </label>
                <Button size="sm" variant="secondary" disabled={!at || !!busy} loading={busy === 'publish'} onClick={() => onPublish(new Date(`${at}:00+08:00`).toISOString())}>Schedule</Button>
              </div>
            </section>
            <section className="flex flex-col gap-3">
              <h3 className="text-xl">Take down</h3>
              <div className="flex flex-wrap gap-2">
                <Button size="sm" variant="secondary" disabled={!live || !!busy} loading={busy === 'unpublish'} onClick={() => onState('unpublish')}>Unpublish</Button>
                <Button size="sm" variant="danger" disabled={meta.status === 'archived' || !!busy} loading={busy === 'archive'} onClick={() => onState('archive')}>Archive</Button>
              </div>
              <p className="text-sm text-ink-2">Unpublish keeps it as a draft. Archive hides it from the site and the drafts list; old links to it stop working.</p>
            </section>
            <section className="flex flex-col gap-3">
              <h3 className="text-xl">Export</h3>
              <p className="text-sm text-ink-2">Download the draft as a JSON file to keep a copy or move it to another site. Import it from the list page.</p>
              <Button size="sm" variant="ghost" className="self-start" onClick={onExport} loading={busy === 'export'} disabled={!!busy}>Download JSON</Button>
            </section>
          </TabsContent>
        )}

        <TabsContent value="history" className="max-w-3xl pt-6">
          {!revs ? (
            <p className="text-sm text-muted">Loading versions…</p>
          ) : revs.length ? (
            <ol className="flex flex-col divide-y divide-rule border-y border-rule">
              {revs.map((r) => (
                <li key={`${r.revision}-${r.createdAt}`} className="flex flex-wrap items-center justify-between gap-3 py-3">
                  <div className="flex flex-col">
                    <span className="text-sm font-medium text-ink">Version {r.revision}{r.note ? `, ${r.note}` : ''}</span>
                    <span className="text-xs text-muted">{fmt(r.createdAt)}{r.by ? ` by ${r.by.displayName ?? r.by.email}` : ''}</span>
                  </div>
                  {canWrite && r.revision !== meta.revision && <Button size="sm" variant="ghost" onClick={() => onRollback(r.revision)} disabled={!!busy}>Restore</Button>}
                </li>
              ))}
            </ol>
          ) : (
            <p className="text-sm text-muted">No earlier versions yet. Each save and publish keeps one.</p>
          )}
        </TabsContent>

        {canWrite && (
          <TabsContent value="json" className="flex flex-col gap-3 pt-6">
            <p className="max-w-3xl text-sm text-ink-2">The draft as data, for fields the form does not cover. Apply puts it into the form; it is checked when you save.</p>
            <label htmlFor="json-body" className="sr-only">Draft JSON</label>
            <textarea id="json-body" value={json} onChange={(e) => setJson(e.target.value)} rows={24} spellCheck={false} className="w-full border border-rule-strong bg-paper-3 p-3 font-mono text-xs text-ink" />
            <Button size="sm" variant="secondary" className="self-start" onClick={() => {
              try { setBody(JSON.parse(json) as Obj); setDirty(true); toast.success('Applied to the form'); } catch { toast.error('That is not valid JSON'); }
            }}>Apply</Button>
          </TabsContent>
        )}
      </Tabs>
    </div>
  );
}
