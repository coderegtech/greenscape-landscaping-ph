'use client';
import { Button } from '@greenscape/ui/components/button';
import { cn } from '@greenscape/ui/lib/utils';
import { ArrowDown, ArrowUp, Plus, Trash2 } from 'lucide-react';
import { createContext, useContext, useState } from 'react';
import { type Field, SECTION_TYPES } from '@/lib/content-types';
import { type MediaRef, MediaPicker } from './media';
import { RichTextEditor } from './rich-text-editor';

type Path = (string | number)[];
type Ctx = { set: (path: Path, value: unknown) => void; errors: Record<string, string> };
const FormCtx = createContext<Ctx>({ set: () => {}, errors: {} });
export const FormProvider = FormCtx.Provider;

const key = (p: Path) => p.join('.');
const idOf = (p: Path) => `f-${p.join('-')}`;
const inputClass = 'h-10 w-full border border-rule-strong bg-paper-3 px-3 text-sm text-ink aria-invalid:border-danger';
type Obj = Record<string, unknown>;

/** First error at or below this path (lists and groups show their children's errors on the children). */
function useError(path: Path) {
  return useContext(FormCtx).errors[key(path)];
}

function Shell({ path, label, hint, required, children, as = 'label' }: { path: Path; label: string; hint?: string; required?: boolean; children: React.ReactNode; as?: 'label' | 'fieldset' }) {
  const error = useError(path);
  const head = (
    <span className="text-sm font-medium text-ink">
      {label}
      {required && <span className="text-muted"> (required)</span>}
    </span>
  );
  const foot = (
    <>
      {hint && <span id={`${idOf(path)}-hint`} className="text-xs text-muted">{hint}</span>}
      {error && <span id={`${idOf(path)}-error`} className="text-xs font-medium text-danger" role="alert">{error}</span>}
    </>
  );
  if (as === 'fieldset')
    return (
      <fieldset className="flex min-w-0 flex-col gap-2">
        <legend className="mb-2">{head}</legend>
        {children}
        {foot}
      </fieldset>
    );
  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <label htmlFor={idOf(path)}>{head}</label>
      {children}
      {foot}
    </div>
  );
}

function described(path: Path, hint?: string, error?: string) {
  const ids = [hint && `${idOf(path)}-hint`, error && `${idOf(path)}-error`].filter(Boolean).join(' ');
  return { id: idOf(path), 'aria-describedby': ids || undefined, 'aria-invalid': error ? true : undefined };
}

function ItemControls({ i, n, label, onMove, onRemove }: { i: number; n: number; label: string; onMove: (to: number) => void; onRemove: () => void }) {
  return (
    <div className="flex shrink-0 gap-0.5">
      <Button type="button" size="icon-sm" variant="ghost" aria-label={`Move ${label} up`} disabled={i === 0} onClick={() => onMove(i - 1)}><ArrowUp /></Button>
      <Button type="button" size="icon-sm" variant="ghost" aria-label={`Move ${label} down`} disabled={i === n - 1} onClick={() => onMove(i + 1)}><ArrowDown /></Button>
      <Button type="button" size="icon-sm" variant="ghost" aria-label={`Remove ${label}`} onClick={onRemove}><Trash2 /></Button>
    </div>
  );
}

const move = <T,>(arr: T[], from: number, to: number) => {
  const next = [...arr];
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x as T);
  return next;
};

export function Fields({ fields, value, path }: { fields: Field[]; value: Obj | undefined; path: Path }) {
  return (
    <div className="flex flex-col gap-5">
      {fields.map((f) => <FieldRenderer key={f.key} field={f} value={value?.[f.key]} path={[...path, f.key]} />)}
    </div>
  );
}

function FieldRenderer({ field: f, value, path }: { field: Field; value: unknown; path: Path }) {
  const { set, errors } = useContext(FormCtx);
  const error = errors[key(path)];
  switch (f.kind) {
    case 'text':
    case 'url':
    case 'month':
      return (
        <Shell path={path} label={f.label} hint={f.hint} required={f.required}>
          <input type={f.kind === 'month' ? 'month' : 'text'} inputMode={f.kind === 'url' ? 'url' : undefined} value={(value as string) ?? ''} maxLength={f.max} onChange={(e) => set(path, e.target.value)} className={inputClass} {...described(path, f.hint, error)} />
        </Shell>
      );
    case 'textarea':
      return (
        <Shell path={path} label={f.label} hint={f.hint} required={f.required}>
          <textarea value={(value as string) ?? ''} maxLength={f.max} rows={3} onChange={(e) => set(path, e.target.value)} className={cn(inputClass, 'h-auto py-2')} {...described(path, f.hint, error)} />
        </Shell>
      );
    case 'number':
      return (
        <Shell path={path} label={f.label} hint={f.hint} required={f.required}>
          <input type="number" value={value === undefined || value === null ? '' : String(value)} onChange={(e) => set(path, e.target.value === '' ? undefined : Number(e.target.value))} className={cn(inputClass, 'w-40 tabular')} {...described(path, f.hint, error)} />
        </Shell>
      );
    case 'toggle':
      return (
        <label className="flex items-center gap-3 text-sm text-ink">
          <input type="checkbox" checked={!!value} onChange={(e) => set(path, e.target.checked)} className="size-5 accent-(--gs-signal)" id={idOf(path)} />
          {f.label}
        </label>
      );
    case 'select':
      return (
        <Shell path={path} label={f.label} required={f.required}>
          <select value={(value as string) ?? ''} onChange={(e) => set(path, e.target.value || undefined)} className={cn(inputClass, 'w-auto min-w-56')} {...described(path, undefined, error)}>
            {!f.required && <option value="">None</option>}
            {Object.entries(f.options).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </Shell>
      );
    case 'richtext':
      return (
        <Shell path={path} label={f.label} hint={f.hint} required={f.required} as="fieldset">
          <RichTextEditor id={idOf(path)} label={f.label} value={value as never} onChange={(v) => set(path, v)} invalid={!!error} />
        </Shell>
      );
    case 'image':
      return (
        <Shell path={path} label={f.label} hint={f.hint} required={f.required} as="fieldset">
          <MediaPicker label={f.label} value={value as MediaRef | null} onChange={(v) => set(path, v ?? undefined)} invalid={errorUnder(errors, path)} />
        </Shell>
      );
    case 'images': {
      const list = (value as MediaRef[] | undefined) ?? [];
      return (
        <Shell path={path} label={f.label} hint={f.hint} required={!!f.min} as="fieldset">
          <ol className="flex flex-col gap-3">
            {list.map((img, i) => (
              <li key={`${img.url}-${i}`} className="flex items-start justify-between gap-3 border-b border-rule pb-3">
                <MediaPicker label={`${f.label} ${i + 1}`} value={img} onChange={(v) => set(path, v ? list.map((x, j) => (j === i ? v : x)) : list.filter((_, j) => j !== i))} invalid={errorUnder(errors, [...path, i])} />
                <ItemControls i={i} n={list.length} label={`photo ${i + 1}`} onMove={(to) => set(path, move(list, i, to))} onRemove={() => set(path, list.filter((_, j) => j !== i))} />
              </li>
            ))}
          </ol>
          <MediaPicker key={list.length} label={`Add to ${f.label}`} value={null} onChange={(v) => v && set(path, [...list, v])} />
        </Shell>
      );
    }
    case 'stringList': {
      const list = (value as string[] | undefined) ?? [];
      return (
        <Shell path={path} label={f.label} hint={f.hint} as="fieldset">
          <ol className="flex flex-col gap-2">
            {list.map((s, i) => (
              <li key={i} className="flex items-center gap-2">
                <label htmlFor={idOf([...path, i])} className="sr-only">{`${f.itemLabel} ${i + 1}`}</label>
                <input id={idOf([...path, i])} value={s} onChange={(e) => set([...path, i], e.target.value)} className={inputClass} aria-invalid={errorUnder(errors, [...path, i]) || undefined} />
                <ItemControls i={i} n={list.length} label={`${f.itemLabel} ${i + 1}`} onMove={(to) => set(path, move(list, i, to))} onRemove={() => set(path, list.filter((_, j) => j !== i))} />
              </li>
            ))}
          </ol>
          <Button type="button" size="sm" variant="ghost" className="self-start" onClick={() => set(path, [...list, ''])}><Plus /> Add {f.itemLabel}</Button>
        </Shell>
      );
    }
    case 'group': {
      const obj = value as Obj | undefined;
      if (f.optional && !obj)
        return <Button type="button" size="sm" variant="ghost" className="self-start" onClick={() => set(path, {})}><Plus /> Add {f.label.toLowerCase()}</Button>;
      return (
        <fieldset className="flex flex-col gap-4 border-l-2 border-rule pl-4">
          <legend className="mb-2 flex items-center gap-3 text-sm font-medium text-ink">
            {f.label}
            {f.optional && <Button type="button" size="sm" variant="ghost" onClick={() => set(path, undefined)}>Remove</Button>}
          </legend>
          <Fields fields={f.fields} value={obj} path={path} />
        </fieldset>
      );
    }
    case 'list':
      return <ListField field={f} value={(value as Obj[] | undefined) ?? []} path={path} />;
    case 'sections':
      return <SectionsField value={(value as Obj[] | undefined) ?? []} path={path} />;
  }
}

/** Any error at or below this path (for image refs whose url/alt fail, and list items). */
const errorUnder = (errors: Record<string, string>, path: Path) => {
  const k = key(path);
  return Object.keys(errors).some((e) => e === k || e.startsWith(`${k}.`));
};

function Item({ title, path, i, n, label, onMove, onRemove, children }: { title: string; path: Path; i: number; n: number; label: string; onMove: (to: number) => void; onRemove: () => void; children: React.ReactNode }) {
  const hasError = errorUnder(useContext(FormCtx).errors, path);
  const [open, setOpen] = useState(false);
  const shown = open || hasError;
  const bodyId = `${idOf(path)}-body`;
  return (
    <li className={cn('border bg-paper-2', hasError ? 'border-danger' : 'border-rule')}>
      <div className="flex items-center justify-between gap-3 px-3 py-1">
        <button type="button" aria-expanded={shown} aria-controls={bodyId} onClick={() => setOpen(!shown)} className="min-w-0 flex-1 truncate py-1 text-left text-sm font-medium text-ink">
          {title}
          {hasError && <span className="ml-2 text-xs text-danger">needs attention</span>}
        </button>
        <ItemControls i={i} n={n} label={label} onMove={onMove} onRemove={onRemove} />
      </div>
      {shown && <div id={bodyId} className="border-t border-rule p-4">{children}</div>}
    </li>
  );
}

function ListField({ field: f, value: list, path }: { field: Extract<Field, { kind: 'list' }>; value: Obj[]; path: Path }) {
  const { set } = useContext(FormCtx);
  return (
    <Shell path={path} label={f.label} as="fieldset">
      <ol className="flex flex-col gap-2">
        {list.map((item, i) => {
          const t = f.titleKey ? (item[f.titleKey] as string | undefined) : undefined;
          return (
            <Item key={i} i={i} n={list.length} path={[...path, i]} label={`${f.itemLabel} ${i + 1}`} title={t?.trim() || `${f.itemLabel[0]!.toUpperCase()}${f.itemLabel.slice(1)} ${i + 1}`} onMove={(to) => set(path, move(list, i, to))} onRemove={() => set(path, list.filter((_, j) => j !== i))}>
              <Fields fields={f.fields} value={item} path={[...path, i]} />
            </Item>
          );
        })}
      </ol>
      <Button type="button" size="sm" variant="ghost" className="self-start" onClick={() => set(path, [...list, f.newItem()])}><Plus /> Add {f.itemLabel}</Button>
    </Shell>
  );
}

function SectionsField({ value: list, path }: { value: Obj[]; path: Path }) {
  const { set } = useContext(FormCtx);
  const [type, setType] = useState('richText');
  return (
    <Shell path={path} label="Sections" as="fieldset" hint="Sections appear on the page in this order.">
      <ol className="flex flex-col gap-2">
        {list.map((s, i) => {
          const def = SECTION_TYPES[s.type as string];
          const heading = (s.heading as string | undefined) || (s.headline as string | undefined);
          return (
            <Item key={i} i={i} n={list.length} path={[...path, i]} label={`section ${i + 1}`} title={`${def?.label ?? String(s.type)}${heading ? `: ${heading}` : ''}`} onMove={(to) => set(path, move(list, i, to))} onRemove={() => set(path, list.filter((_, j) => j !== i))}>
              {def?.fields.length ? <Fields fields={def.fields} value={s} path={[...path, i]} /> : <p className="text-sm text-muted">This section has no settings; the site fills it in.</p>}
            </Item>
          );
        })}
      </ol>
      <div className="flex flex-wrap items-center gap-2">
        <label htmlFor={`${idOf(path)}-new`} className="sr-only">Section type</label>
        <select id={`${idOf(path)}-new`} value={type} onChange={(e) => setType(e.target.value)} className={cn(inputClass, 'w-auto')}>
          {Object.entries(SECTION_TYPES).map(([k, d]) => <option key={k} value={k}>{d.label}</option>)}
        </select>
        <Button type="button" size="sm" variant="secondary" onClick={() => set(path, [...list, SECTION_TYPES[type]!.create()])}><Plus /> Add section</Button>
      </div>
    </Shell>
  );
}
