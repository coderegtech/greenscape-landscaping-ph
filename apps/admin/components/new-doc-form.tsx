'use client';
import { Button } from '@greenscape/ui/components/button';
import { toast } from '@greenscape/ui/components/sonner';
import { useState } from 'react';
import { createDoc } from '@/app/(console)/cms/actions';
import { CONTENT_TYPES, clean, setIn, type TypeKey } from '@/lib/content-types';
import { Fields, FormProvider } from './fields';

type Obj = Record<string, unknown>;
const slugify = (s: string) => s.toLowerCase().normalize('NFKD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80);

/** Pick a template, fill the required fields, create the draft (the API validates it like any save). */
export function NewDocForm({ type }: { type: TypeKey }) {
  const def = CONTENT_TYPES[type];
  const templates = Object.entries(def.templates) as [string, { label: string; body: () => Obj }][];
  const [tpl, setTpl] = useState(templates[0]![0]);
  const [body, setBody] = useState<Obj>(() => templates[0]![1].body());
  const [slug, setSlug] = useState('');
  const [slugTouched, setSlugTouched] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [busy, setBusy] = useState(false);

  const set = (path: (string | number)[], v: unknown) => {
    setBody((b) => setIn(b, path, v));
    if (path.length === 1 && path[0] === 'title' && !slugTouched) setSlug(slugify(String(v ?? '')));
  };
  const pickTemplate = (key: string) => {
    setTpl(key);
    setBody({ ...templates.find(([k]) => k === key)![1].body(), title: body.title });
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) return setErrors({ $slug: 'Use lowercase letters, numbers and dashes' });
    setBusy(true);
    const res = await createDoc(type, slug, clean(body), {});
    setBusy(false);
    if (res.status === 400 && Array.isArray(res.details)) {
      setErrors(Object.fromEntries((res.details as { path: string; message: string }[]).map((d) => [d.path.replace(/^body\./, ''), d.message])));
      toast.error('Some fields need attention');
    } else toast.error(res.status === 409 ? `There is already a ${def.singular} at that address` : res.error);
  };

  return (
    <form onSubmit={submit} className="flex max-w-3xl flex-col gap-8" noValidate>
      <h2 className="text-3xl">New {def.singular}</h2>
      {templates.length > 1 && (
        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-sm font-medium text-ink">Start from</legend>
          {templates.map(([k, t]) => (
            <label key={k} className="flex items-center gap-3 text-sm text-ink">
              <input type="radio" name="template" value={k} checked={tpl === k} onChange={() => pickTemplate(k)} className="size-4 accent-(--gs-signal)" />
              {t.label}
            </label>
          ))}
        </fieldset>
      )}
      <FormProvider value={{ set, errors }}>
        <Fields fields={def.fields} value={body} path={[]} />
      </FormProvider>
      <div className="flex flex-col gap-1.5">
        <label htmlFor="slug" className="text-sm font-medium text-ink">Address <span className="text-muted">(required)</span></label>
        <div className="flex items-center gap-1 text-sm text-ink-2">
          <span className="tabular">{def.publicPath('').replace(/\/$/, '')}/</span>
          <input id="slug" value={slug} onChange={(e) => { setSlug(e.target.value); setSlugTouched(true); }} aria-invalid={errors.$slug ? true : undefined} aria-describedby={errors.$slug ? 'slug-error' : 'slug-hint'} className="h-10 flex-1 border border-rule-strong bg-paper-3 px-3 text-sm text-ink aria-invalid:border-danger" />
        </div>
        {errors.$slug ? <span id="slug-error" role="alert" className="text-xs font-medium text-danger">{errors.$slug}</span> : <span id="slug-hint" className="text-xs text-muted">Filled from the title. It cannot be changed after the first publish without breaking links.</span>}
      </div>
      <Button type="submit" className="self-start" loading={busy}>Create draft</Button>
    </form>
  );
}
