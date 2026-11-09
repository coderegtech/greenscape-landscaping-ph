'use client';
import { Button } from '@greenscape/ui/components/button';
import { toast } from '@greenscape/ui/components/sonner';
import { useState } from 'react';
import { saveNav, saveSiteConfig } from '@/app/(console)/cms/actions';
import { type Field, clean, setIn } from '@/lib/content-types';
import { Fields, FormProvider } from './fields';

type Obj = Record<string, unknown>;

const CONFIG_FIELDS: Field[] = [
  { kind: 'text', key: 'companyName', label: 'Company name', required: true },
  { kind: 'text', key: 'tagline', label: 'Tagline' },
  { kind: 'textarea', key: 'address', label: 'Address', required: true },
  { kind: 'text', key: 'phone', label: 'Phone', required: true },
  { kind: 'text', key: 'email', label: 'Email', required: true },
  { kind: 'text', key: 'hours', label: 'Opening hours' },
  { kind: 'group', key: 'socials', label: 'Social pages', fields: [{ kind: 'url', key: 'facebook', label: 'Facebook address' }, { kind: 'url', key: 'instagram', label: 'Instagram address' }, { kind: 'url', key: 'pinterest', label: 'Pinterest address' }] },
  { kind: 'group', key: 'seoDefaults', label: 'Search defaults', fields: [{ kind: 'text', key: 'title', label: 'Default search title', max: 70 }, { kind: 'textarea', key: 'description', label: 'Default search description', max: 170 }, { kind: 'image', key: 'ogImage', label: 'Default sharing image' }] },
];
const link = (): Field[] => [{ kind: 'text', key: 'label', label: 'Label', required: true, max: 40 }, { kind: 'text', key: 'href', label: 'Link (e.g. /services)', required: true }];
const NAV_FIELD: Field = { kind: 'list', key: 'items', label: 'Links', itemLabel: 'link', titleKey: 'label', newItem: () => ({ label: '', href: '/' }), fields: [...link(), { kind: 'list', key: 'children', label: 'Dropdown links', itemLabel: 'dropdown link', titleKey: 'label', newItem: () => ({ label: '', href: '/' }), fields: link() }] };

function useSection(initial: Obj, onSave: (v: Obj) => Promise<{ ok: true } | { ok: false; status: number; error: string; details?: unknown }>) {
  const [value, setValue] = useState(initial);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    setBusy(true);
    const res = await onSave(clean(value) as Obj);
    setBusy(false);
    if (res.ok) { setErrors({}); setDirty(false); return void toast.success('Saved. The site updates within a few seconds.'); }
    if (res.status === 400 && Array.isArray(res.details)) setErrors(Object.fromEntries((res.details as { path: string; message: string }[]).map((d) => [d.path, d.message])));
    toast.error(res.status === 400 ? 'Some fields need attention' : res.error);
  };
  return { value, errors, dirty, busy, save, set: (path: (string | number)[], v: unknown) => { setValue((x) => setIn(x, path, v)); setDirty(true); } };
}

export function SiteSettings({ config, nav, canPublish }: { config: Obj | null; nav: Record<string, unknown[]>; canPublish: boolean }) {
  const cfg = useSection({ socials: {}, seoDefaults: {}, ...(config ?? {}) }, (v) => saveSiteConfig({ ...v, locale: 'en', socials: v.socials ?? {}, seoDefaults: v.seoDefaults ?? {}, updatedAt: undefined }));
  const main = useSection({ items: nav.main ?? [] }, (v) => saveNav('main', v.items ?? []));
  const footer = useSection({ items: nav.footer ?? [] }, (v) => saveNav('footer', v.items ?? []));
  const block = (title: string, s: ReturnType<typeof useSection>, fields: Field[]) => (
    <section className="flex max-w-3xl flex-col gap-5 border-t border-rule pt-6">
      <h3 className="text-2xl">{title}</h3>
      <fieldset disabled={!canPublish}>
        <FormProvider value={{ set: s.set, errors: s.errors }}>
          <Fields fields={fields} value={s.value} path={[]} />
        </FormProvider>
      </fieldset>
      {canPublish && <Button className="self-start" size="sm" onClick={s.save} loading={s.busy} disabled={!s.dirty || s.busy}>Save {title.toLowerCase()}</Button>}
    </section>
  );
  return (
    <div className="flex flex-col gap-10">
      {!canPublish && <p className="text-sm text-ink-2">You can view these settings; changing them needs publishing rights.</p>}
      {block('Company details', cfg, CONFIG_FIELDS)}
      {block('Main menu', main, [NAV_FIELD])}
      {block('Footer links', footer, [NAV_FIELD])}
    </div>
  );
}
