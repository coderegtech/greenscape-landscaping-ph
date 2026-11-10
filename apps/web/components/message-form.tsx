'use client';
import { Button } from '@greenscape/ui/components/button';
import { useActionState, useEffect, useRef } from 'react';
import { sendMessage } from '@/app/messages/actions';

export function MessageForm() {
  const [state, action, pending] = useActionState(sendMessage, null);
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (state?.ok) form.current?.reset();
  }, [state]);
  return (
    <form ref={form} action={action} className="flex flex-col gap-2">
      <label htmlFor="body" className="text-sm font-medium">Your message</label>
      <textarea id="body" name="body" required maxLength={4000} rows={4} className="w-full border border-muted bg-paper-2 px-3 py-2 text-base text-ink" aria-describedby={state && !state.ok ? 'send-error' : undefined} />
      {state && !state.ok && <p id="send-error" role="alert" className="text-sm text-danger">{state.error}</p>}
      {state?.ok && <p role="status" className="text-sm text-ink-2">Sent. We will reply here and by email.</p>}
      <Button type="submit" loading={pending} className="self-start">Send</Button>
    </form>
  );
}
