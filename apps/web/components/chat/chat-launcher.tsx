'use client';
import { MessageCircle } from 'lucide-react';
import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../auth/auth-context';

// The panel (and its code) loads on the first open, never with the page.
const ChatPanel = dynamic(() => import('./chat-panel'), { ssr: false });

const HIDDEN_ON = /^\/(auth|checkout)(\/|$)/; // sign-in pages and checkout stay uncluttered

/** The floating "Ask our assistant" button, bottom right on every public page. Guests are asked to sign in first. */
export function ChatLauncher() {
  const { user, ready, requireAuth } = useAuth();
  const pathname = usePathname();
  const [loaded, setLoaded] = useState(false);
  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(false);
  const button = useRef<HTMLButtonElement>(null);

  const show = useCallback(() => { setLoaded(true); setOpen(true); setUnread(false); }, []);
  const close = useCallback(() => { setOpen(false); button.current?.focus(); }, []);

  // Back from "Sign in to continue" with ?intent=chat: reopen the chat and tidy the address bar.
  useEffect(() => {
    if (!ready || !user) return;
    const url = new URL(window.location.href);
    if (url.searchParams.get('intent') !== 'chat') return;
    url.searchParams.delete('intent');
    window.history.replaceState(null, '', `${url.pathname}${url.search}${url.hash}`);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- resumes from the address bar once the session is known; runs once per sign-in
    show();
  }, [ready, user, show]);

  if (HIDDEN_ON.test(pathname)) return null;
  return (
    <>
      <button
        ref={button}
        type="button"
        data-testid="chat-launcher"
        aria-expanded={open}
        aria-controls={loaded ? 'gs-chat' : undefined}
        onClick={() => (open ? close() : requireAuth(show, { intent: 'chat', reason: 'Please sign in with Google or your account to chat with our AI assistant. Your chats are saved so you can pick them up later.' }))}
        className="chat-launcher fixed right-4 bottom-4 z-40 inline-flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lift md:right-6 md:bottom-6"
      >
        <MessageCircle aria-hidden className="size-6" />
        <span className="sr-only">{open ? 'Close the AI assistant' : 'Chat with our AI assistant'}{unread ? ' (new reply)' : ''}</span>
        {unread && <span aria-hidden className="absolute top-1 right-1 size-3 rounded-full bg-signal ring-2 ring-paper" />}
      </button>
      {loaded && user && <ChatPanel open={open} onClose={close} onReplyWhileHidden={() => setUnread(true)} />}
    </>
  );
}
