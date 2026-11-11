'use client';
import { Button } from '@greenscape/ui/components/button';
import { toast } from '@greenscape/ui/components/sonner';
import { ASSISTANT_PROVIDERS, ASSISTANT_SOURCES, type AssistantProvider, type AssistantSettings } from '@greenscape/validation';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent, type ReactNode } from 'react';
import { saveAssistantSettings } from '@/app/(console)/assistant/actions';

const MODEL_HINT: Record<AssistantProvider, string> = {
  anthropic: 'For example claude-opus-5-5 (default), claude-sonnet-5-5 or claude-haiku-5-5.',
  openai: 'The model name your OpenAI-compatible service expects.',
  mock: 'Offline test replies for development. Not available to customers in production.',
};
const input = 'border border-rule-strong bg-paper-3 px-3 py-2 font-normal text-ink';

function Row({ label, hint, children }: { label: string; hint?: string; children: ReactNode }) {
  return (
    <label className="flex flex-col gap-1 text-sm font-medium">
      {label}
      {children}
      {hint && <span className="text-xs font-normal text-muted">{hint}</span>}
    </label>
  );
}

/** Settings for the website's AI assistant. API keys are not here: they live in the API server's environment. */
export function AssistantSettingsForm({ settings, providers, production }: { settings: AssistantSettings; providers: Record<string, boolean>; production: boolean }) {
  const router = useRouter();
  const [v, setV] = useState(settings);
  const [questions, setQuestions] = useState(settings.suggestedQuestions.join('\n'));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string>();
  const set = <K extends keyof AssistantSettings>(k: K, value: AssistantSettings[K]) => setV((s) => ({ ...s, [k]: value }));

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    const res = await saveAssistantSettings({ ...v, suggestedQuestions: questions.split('\n').map((q) => q.trim()).filter(Boolean) });
    setBusy(false);
    if (!res.ok) return setError(Array.isArray(res.details) ? `Check: ${(res.details as { path: string; message: string }[]).map((d) => `${d.path} (${d.message})`).join(', ')}` : res.error);
    toast.success('Assistant settings saved');
    router.refresh();
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-8" data-testid="assistant-settings">
      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-xl">Availability</legend>
        <label className="flex min-h-11 items-center gap-2 text-base">
          <input type="checkbox" checked={v.enabled} onChange={(e) => set('enabled', e.target.checked)} className="size-5" />
          Show the assistant to signed-in customers
        </label>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Row label="Messages per customer per 24 hours" hint="Stops runaway costs and misuse.">
            <input type="number" min={1} max={500} value={v.dailyMessagesPerUser} onChange={(e) => set('dailyMessagesPerUser', Number(e.target.value))} className={input} />
          </Row>
          <Row label="Keep chats for (days)" hint="Older chats are deleted automatically.">
            <input type="number" min={7} max={730} value={v.retentionDays} onChange={(e) => set('retentionDays', Number(e.target.value))} className={input} />
          </Row>
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-xl">What customers see</legend>
        <Row label="Greeting">
          <textarea rows={3} maxLength={300} value={v.greeting} onChange={(e) => set('greeting', e.target.value)} className={input} />
        </Row>
        <Row label="Suggested questions" hint="One per line, up to six. Shown before the first message.">
          <textarea rows={5} value={questions} onChange={(e) => setQuestions(e.target.value)} className={input} />
        </Row>
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-xl">Instructions and knowledge</legend>
        <Row label="Extra instructions" hint="Tone, topics to avoid, what to recommend. The built-in safety rules always apply and cannot be switched off here.">
          <textarea rows={6} maxLength={4000} value={v.instructions} onChange={(e) => set('instructions', e.target.value)} className={input} />
        </Row>
        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium">Built-in sources the assistant may quote</span>
          {Object.entries(ASSISTANT_SOURCES).map(([k, label]) => (
            <label key={k} className="flex min-h-11 items-center gap-2 text-base">
              <input type="checkbox" checked={v.sources[k as keyof typeof ASSISTANT_SOURCES]} onChange={(e) => set('sources', { ...v.sources, [k]: e.target.checked })} className="size-5" />
              {label}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-4">
        <legend className="mb-2 text-xl">Provider and model</legend>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Row label="Provider" hint={providers[v.provider] ? MODEL_HINT[v.provider] : 'No API key for this provider on the server yet (see docs/auth/ai-assistant.md).'}>
            <select value={v.provider} onChange={(e) => set('provider', e.target.value as AssistantProvider)} className={input}>
              {(Object.keys(ASSISTANT_PROVIDERS) as AssistantProvider[]).filter((p) => !(production && p === 'mock')).map((p) => (
                <option key={p} value={p}>{ASSISTANT_PROVIDERS[p]}{providers[p] ? '' : ' (not configured)'}</option>
              ))}
            </select>
          </Row>
          <Row label="Model">
            <input value={v.model} onChange={(e) => set('model', e.target.value)} className={input} spellCheck={false} />
          </Row>
          <Row label="Longest reply (tokens)" hint="256 to 8,000. About 750 words per 1,000 tokens.">
            <input type="number" min={256} max={8000} step={64} value={v.maxOutputTokens} onChange={(e) => set('maxOutputTokens', Number(e.target.value))} className={input} />
          </Row>
        </div>
      </fieldset>

      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
      <Button type="submit" loading={busy} className="self-start">Save settings</Button>
    </form>
  );
}
