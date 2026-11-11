'use client';
import { Button } from '@greenscape/ui/components/button';
import { toast } from '@greenscape/ui/components/sonner';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { deleteKnowledge, saveKnowledge } from '@/app/(console)/assistant/actions';

interface Doc { id: string; title: string; body: string; enabled: boolean; updatedAt: string }
const input = 'border border-rule-strong bg-paper-3 px-3 py-2 font-normal text-ink';

export function KnowledgeManager({ docs }: { docs: Doc[] }) {
  const router = useRouter();
  const [editing, setEditing] = useState<Doc | 'new' | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();

  const submit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setBusy(true);
    setError(undefined);
    const res = await saveKnowledge(editing === 'new' ? null : editing!.id, { title: f.get('title'), body: f.get('body'), enabled: f.get('enabled') === 'on' });
    setBusy(false);
    if (!res.ok) return setError(Array.isArray(res.details) ? 'Give it a title (3+ characters) and some text (10+ characters).' : res.error);
    toast.success('Saved');
    setEditing(null);
    router.refresh();
  };
  const remove = async (d: Doc) => {
    if (!window.confirm(`Delete “${d.title}”? The assistant stops using it straight away.`)) return;
    const res = await deleteKnowledge(d.id);
    if (!res.ok) return void toast.error(res.error);
    toast.success('Deleted');
    router.refresh();
  };

  const d = editing && editing !== 'new' ? editing : null;
  return (
    <div className="flex flex-col gap-6">
      {editing ? (
        <form key={d?.id ?? 'new'} onSubmit={submit} className="flex flex-col gap-4 border border-rule p-5" aria-label={d ? `Edit ${d.title}` : 'New knowledge entry'}>
          <label className="flex flex-col gap-1 text-sm font-medium">Title
            <input name="title" defaultValue={d?.title ?? ''} maxLength={120} className={input} />
          </label>
          <label className="flex flex-col gap-1 text-sm font-medium">Text
            <textarea name="body" rows={10} defaultValue={d?.body ?? ''} maxLength={8000} className={input} />
          </label>
          <label className="flex min-h-11 items-center gap-2 text-base">
            <input type="checkbox" name="enabled" defaultChecked={d?.enabled ?? true} className="size-5" /> Use in answers
          </label>
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          <div className="flex gap-3">
            <Button type="submit" loading={busy}>Save</Button>
            <Button type="button" variant="ghost" onClick={() => { setEditing(null); setError(undefined); }}>Cancel</Button>
          </div>
        </form>
      ) : (
        <Button className="self-start" onClick={() => setEditing('new')}>Add an entry</Button>
      )}
      {docs.length ? (
        <ul className="border-t border-rule" data-testid="knowledge-list">
          {docs.map((x) => (
            <li key={x.id} className="flex flex-wrap items-start justify-between gap-4 border-b border-rule py-4">
              <div className="flex min-w-0 flex-1 flex-col gap-1">
                <span className="text-lg text-ink">{x.title}{!x.enabled && <span className="text-sm text-muted">, switched off</span>}</span>
                <span className="line-clamp-2 text-sm text-ink-2">{x.body}</span>
              </div>
              <div className="flex gap-2">
                <Button size="sm" variant="secondary" onClick={() => setEditing(x)}>Edit<span className="sr-only"> {x.title}</span></Button>
                <Button size="sm" variant="ghost" onClick={() => void remove(x)}>Delete<span className="sr-only"> {x.title}</span></Button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-ink-2">No entries yet. The assistant already knows your published services, FAQs, contact details, shop and delivery areas.</p>
      )}
    </div>
  );
}
