'use client';
import { History, Minus, Plus, Send, Square, Trash2, UserRound } from 'lucide-react';
import Link from 'next/link';
import { Fragment, useCallback, useEffect, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { useAuth } from '../auth/auth-context';

const API = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:4000';

interface Msg { id: string; role: 'user' | 'assistant'; content: string; pending?: boolean }
interface Config { enabled: boolean; greeting: string; suggestedQuestions: string[] }
interface Summary { id: string; title: string; status: string; updatedAt: string }

/** Plain text with site paths (/services/…, /shop/…) turned into links. Markdown emphasis markers are dropped. */
function Reply({ text }: { text: string }) {
  const parts = text.replace(/\*\*|__/g, '').split(/(\/(?:services|shop|projects|quote|contact|messages|faq|about)(?:\/[\w-]+)*)/);
  return <>{parts.map((p, i) => (i % 2 ? <Link key={i} href={p}>{p}</Link> : <Fragment key={i}>{p}</Fragment>))}</>;
}

/**
 * The chat itself: streamed replies, saved history, suggested questions and a handover to a person. A bottom sheet on
 * phones, a panel on larger screens. It stays mounted while minimised so a reply in progress keeps arriving.
 */
export default function ChatPanel({ open, onClose, onReplyWhileHidden }: { open: boolean; onClose: () => void; onReplyWhileHidden: () => void }) {
  const { accessToken } = useAuth();
  const [config, setConfig] = useState<Config | null>(null);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [status, setStatus] = useState<'idle' | 'streaming'>('idle');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [history, setHistory] = useState<Summary[] | null>(null);
  const [draft, setDraft] = useState('');
  const [announce, setAnnounce] = useState('');
  const input = useRef<HTMLTextAreaElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const abort = useRef<AbortController | null>(null);
  const panel = useRef<HTMLElement>(null);
  const openRef = useRef(open);
  openRef.current = open;

  const api = useCallback(async (path: string, init: RequestInit = {}) => {
    const token = await accessToken();
    return fetch(`${API}/v1${path}`, { ...init, cache: 'no-store', headers: { ...(init.body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}), ...init.headers } });
  }, [accessToken]);

  useEffect(() => {
    void fetch(`${API}/v1/assistant/config`).then((r) => r.json()).then(setConfig).catch(() => setConfig({ enabled: false, greeting: '', suggestedQuestions: [] }));
  }, []);
  useEffect(() => { if (open) input.current?.focus(); }, [open]);
  // Escape minimises the chat from anywhere inside it.
  useEffect(() => {
    const el = panel.current;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') { e.stopPropagation(); onClose(); } };
    el?.addEventListener('keydown', onKey);
    return () => el?.removeEventListener('keydown', onKey);
  }, [onClose]);
  useEffect(() => { list.current?.scrollTo({ top: list.current.scrollHeight }); }, [messages]);

  const send = async (text: string) => {
    const message = text.trim();
    if (!message || status === 'streaming') return;
    setDraft('');
    setError(null);
    setNotice(null);
    const reply: Msg = { id: `r${Date.now()}`, role: 'assistant', content: '', pending: true };
    setMessages((m) => [...m, { id: `u${Date.now()}`, role: 'user', content: message }, reply]);
    setStatus('streaming');
    const ctrl = new AbortController();
    abort.current = ctrl;
    const patch = (fn: (m: Msg) => Msg) => setMessages((all) => all.map((m) => (m.id === reply.id ? fn(m) : m)));
    try {
      const res = await api('/assistant/messages', { method: 'POST', body: JSON.stringify({ message, conversationId: conversationId ?? undefined }), signal: ctrl.signal });
      if (!res.ok || !res.body) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error?.message ?? 'The assistant could not answer just now. Please try again.');
      }
      const reader = res.body.pipeThrough(new TextDecoderStream()).getReader();
      let buffer = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += value;
        let cut: number;
        while ((cut = buffer.indexOf('\n\n')) >= 0) {
          const block = buffer.slice(0, cut);
          buffer = buffer.slice(cut + 2);
          const event = /^event: (.+)$/m.exec(block)?.[1];
          const data = JSON.parse(/^data: (.+)$/m.exec(block)?.[1] ?? 'null');
          if (event === 'meta') setConversationId(data.conversationId);
          else if (event === 'delta') patch((m) => ({ ...m, content: m.content + data.text, pending: false }));
          else if (event === 'done') patch((m) => ({ ...m, id: data.messageId, content: data.replaced ?? m.content, pending: false }));
          else if (event === 'error') patch((m) => ({ ...m, id: data.messageId, content: data.message, pending: false }));
        }
      }
      setAnnounce('The assistant replied.');
      if (!openRef.current) onReplyWhileHidden();
    } catch (err) {
      if (ctrl.signal.aborted) patch((m) => ({ ...m, content: m.content || '(stopped)', pending: false }));
      else {
        setMessages((all) => all.filter((m) => m.id !== reply.id));
        setError(err instanceof Error ? err.message : 'Something went wrong.');
      }
    } finally {
      setStatus('idle');
      abort.current = null;
    }
  };

  const submit = (e: FormEvent) => { e.preventDefault(); void send(draft); };
  const onKey = (e: ReactKeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); void send(draft); }
  };

  const newChat = () => { abort.current?.abort(); setMessages([]); setConversationId(null); setHistory(null); setError(null); setNotice(null); input.current?.focus(); };
  const showHistory = async () => {
    if (history) return setHistory(null);
    const res = await api('/assistant/conversations');
    setHistory(res.ok ? await res.json() : []);
  };
  const openConversation = async (id: string) => {
    const res = await api(`/assistant/conversations/${id}`);
    if (!res.ok) return setError('That conversation could not be opened.');
    const c = await res.json();
    setConversationId(c.id);
    setMessages(c.messages.map((m: Msg) => ({ id: m.id, role: m.role, content: m.content })));
    setHistory(null);
    setNotice(c.status === 'escalated' ? 'This chat was passed to our team. Their replies are in Messages.' : null);
  };
  const removeConversation = async (id: string) => {
    const res = await api(`/assistant/conversations/${id}`, { method: 'DELETE' });
    if (res.ok) setHistory((h) => h?.filter((c) => c.id !== id) ?? null);
    if (id === conversationId) newChat();
  };
  const escalate = async () => {
    if (!conversationId) return setNotice('Write to our team directly in Messages.');
    const res = await api(`/assistant/conversations/${conversationId}/escalate`, { method: 'POST' });
    if (res.ok) setNotice('We sent this chat to our team. A person will reply in Messages, usually within one working day.');
    else setError((await res.json().catch(() => null))?.error?.message ?? 'Could not reach the team just now. Please call 0917 844 3330.');
  };

  const empty = messages.length === 0;
  return (
    <section
      id="gs-chat"
      role="dialog"
      aria-modal="false"
      aria-labelledby="gs-chat-title"
      ref={panel}
      hidden={!open}
      data-testid="chat-panel"
      className="chat-panel fixed inset-x-0 bottom-0 z-50 flex h-[85dvh] flex-col overflow-clip rounded-t-[var(--radius-card)] border border-rule bg-paper shadow-lift md:inset-x-auto md:right-6 md:bottom-24 md:h-[min(40rem,calc(100dvh-8rem))] md:w-[25rem] md:rounded-[var(--radius-card)]"
    >
      <header className="flex items-center gap-2 border-b border-rule px-4 py-3">
        <div className="flex min-w-0 flex-1 flex-col">
          <h2 id="gs-chat-title" className="font-display text-xl font-normal text-ink">Greenscape assistant</h2>
          <p className="text-sm text-ink-2">An AI that answers from our own information</p>
        </div>
        <button type="button" className="chat-icon-btn" onClick={() => void showHistory()} aria-pressed={!!history}><History aria-hidden className="size-5" /><span className="sr-only">Your chats</span></button>
        <button type="button" className="chat-icon-btn" onClick={newChat}><Plus aria-hidden className="size-5" /><span className="sr-only">New chat</span></button>
        <button type="button" className="chat-icon-btn" onClick={onClose}><Minus aria-hidden className="size-5" /><span className="sr-only">Minimise</span></button>
      </header>

      {history ? (
        <div className="flex-1 overflow-y-auto p-4">
          <h3 className="mb-3 text-base font-semibold text-ink">Your chats</h3>
          {history.length === 0 && <p className="text-ink-2">No saved chats yet.</p>}
          <ul className="flex flex-col gap-2">
            {history.map((c) => (
              <li key={c.id} className="flex items-center gap-2 rounded-[var(--radius-control)] border border-rule p-2">
                <button type="button" className="min-w-0 flex-1 truncate text-left text-ink hover:underline" onClick={() => void openConversation(c.id)}>
                  {c.title}
                  <span className="block text-sm text-ink-2">{new Date(c.updatedAt).toLocaleDateString('en-PH', { day: 'numeric', month: 'short' })}{c.status === 'escalated' ? ', passed to our team' : ''}</span>
                </button>
                <button type="button" className="chat-icon-btn" onClick={() => void removeConversation(c.id)}><Trash2 aria-hidden className="size-4" /><span className="sr-only">Delete “{c.title}”</span></button>
              </li>
            ))}
          </ul>
        </div>
      ) : (
        <div ref={list} className="flex flex-1 flex-col gap-3 overflow-y-auto p-4" data-testid="chat-messages">
          <p className="rounded-[var(--radius-control)] bg-paper-2 p-3 text-sm text-ink-2">
            You are chatting with an AI. It can make mistakes, so check prices and availability before you buy. Your chats are saved to your account.
          </p>
          {config && !config.enabled && <p className="text-ink">The assistant is resting right now. Use “Talk to a person” below, or call 0917 844 3330.</p>}
          {config?.enabled && <div className="chat-bubble chat-bot">{config.greeting}</div>}
          {empty && config?.enabled && (
            <ul className="flex flex-wrap gap-2" aria-label="Suggested questions">
              {config.suggestedQuestions.map((q) => (
                <li key={q}><button type="button" className="rounded-[var(--radius-pill)] border border-rule-strong px-3 py-1.5 text-sm text-ink hover:bg-paper-2" onClick={() => void send(q)}>{q}</button></li>
              ))}
            </ul>
          )}
          {messages.map((m) => (
            <div key={m.id} className={`chat-bubble ${m.role === 'user' ? 'chat-me' : 'chat-bot'}`}>
              <span className="sr-only">{m.role === 'user' ? 'You: ' : 'Assistant: '}</span>
              {m.pending ? <span className="chat-typing" aria-label="The assistant is writing"><i /><i /><i /></span> : m.role === 'user' ? m.content : <Reply text={m.content} />}
            </div>
          ))}
          {notice && <p className="rounded-[var(--radius-control)] border border-rule p-3 text-sm text-ink">{notice} <Link href="/messages">Open Messages</Link></p>}
          {error && <p role="alert" className="text-sm text-danger-ink">{error}</p>}
        </div>
      )}
      <p aria-live="polite" className="sr-only">{announce}</p>

      <form onSubmit={submit} className="flex flex-col gap-2 border-t border-rule p-3">
        <div className="flex items-end gap-2">
          <label htmlFor="gs-chat-input" className="sr-only">Your message</label>
          <textarea
            id="gs-chat-input"
            ref={input}
            rows={1}
            maxLength={2000}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={onKey}
            disabled={config?.enabled === false}
            placeholder="Ask about services, plants or delivery"
            className="max-h-32 min-h-11 flex-1 resize-none rounded-[var(--radius-control)] border border-input bg-paper px-3 py-2.5 text-base text-ink"
          />
          {status === 'streaming' ? (
            <button type="button" className="chat-send" onClick={() => abort.current?.abort()}><Square aria-hidden className="size-4" /><span className="sr-only">Stop the reply</span></button>
          ) : (
            <button type="submit" className="chat-send" disabled={!draft.trim() || config?.enabled === false}><Send aria-hidden className="size-4" /><span className="sr-only">Send</span></button>
          )}
        </div>
        <button type="button" onClick={() => void escalate()} className="inline-flex items-center gap-1.5 self-start text-sm text-ink underline-offset-4 hover:underline">
          <UserRound aria-hidden className="size-4" />Talk to a person
        </button>
      </form>
    </section>
  );
}
