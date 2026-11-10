'use client';
import { Button } from '@greenscape/ui/components/button';
import { toast } from '@greenscape/ui/components/sonner';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { replyConversation, replyInquiry, setConversationStatus, setInquiryStatus } from '@/app/(console)/admin-actions';

/** Reply box for a customer chat (posted to the thread) or a contact-form message (sent by email). */
export function ThreadReply({ id, status, kind = 'chat' }: { id: string; status: string; kind?: 'chat' | 'inquiry' }) {
  const router = useRouter();
  const [body, setBody] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy('send');
    const res = kind === 'chat' ? await replyConversation(id, body) : await replyInquiry(id, body);
    setBusy(null);
    if (!res.ok) return void toast.error(res.error);
    setBody('');
    toast.success(kind === 'chat' ? 'Sent. The customer gets an email too.' : (res.data as { emailed?: boolean }).emailed === false ? 'Saved, but the email could not be sent. Check the mail settings.' : 'Reply emailed');
    router.refresh();
  };
  const close = async () => {
    setBusy('status');
    const next = status === 'closed' ? (kind === 'chat' ? 'open' : 'new') : 'closed';
    const res = kind === 'chat' ? await setConversationStatus(id, next as 'open' | 'closed') : await setInquiryStatus(id, next as 'new' | 'closed');
    setBusy(null);
    if (!res.ok) return void toast.error(res.error);
    router.refresh();
  };
  const fieldId = `reply-${id}`;
  return (
    <form onSubmit={send} className="flex flex-col gap-2">
      <label htmlFor={fieldId} className="text-sm font-medium">{kind === 'chat' ? 'Reply' : 'Reply by email'}</label>
      <textarea id={fieldId} required maxLength={4000} rows={4} value={body} onChange={(e) => setBody(e.target.value)} className="w-full border border-rule-strong bg-paper-3 px-3 py-2 text-sm text-ink" />
      <div className="flex flex-wrap gap-2">
        <Button type="submit" size="sm" loading={busy === 'send'} disabled={!!busy || !body.trim()}>Send</Button>
        <Button type="button" size="sm" variant="ghost" loading={busy === 'status'} disabled={!!busy} onClick={close}>{status === 'closed' ? 'Reopen' : 'Close'}</Button>
      </div>
    </form>
  );
}
