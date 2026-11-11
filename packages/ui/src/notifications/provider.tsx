'use client';
// Notification state for one app (customer site or admin): the live connection, the unread count, and the actions.
// Mounted once in each layout. Anonymous visitors cost nothing: no network call and no extra JavaScript until a
// Supabase session cookie exists.
import type { NotificationApp, NotificationPage } from '@greenscape/validation';
import { usePathname } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { applyEvent, type FeedFilter, type StreamEvent } from './format';
import type { NotificationView } from '@greenscape/validation';

type Listener = (e: StreamEvent) => void;
export type Call = <T = unknown>(path: string, init?: RequestInit) => Promise<T>;

interface Ctx {
  app: NotificationApp;
  /** false until we know there is a signed-in user; the bell renders nothing for visitors. */
  signedIn: boolean;
  connected: boolean;
  unread: number;
  /** Bumps after every reconnect so open lists re-fetch what they missed. */
  epoch: number;
  call: Call;
  subscribe: (fn: Listener) => () => void;
  markRead: (id: string) => Promise<void>;
  markAllRead: () => Promise<void>;
  remove: (id: string) => Promise<void>;
  clear: (readOnly: boolean) => Promise<void>;
}

const NotificationsContext = createContext<Ctx | null>(null);
export function useNotifications() {
  const c = useContext(NotificationsContext);
  if (!c) throw new Error('useNotifications needs <NotificationsProvider>');
  return c;
}

const hasSessionCookie = () => /(?:^|;\s*)sb-[^=]*-auth-token/.test(document.cookie);

/** Short two-tone beep (Web Audio, no asset). Browsers keep audio locked until the person has interacted with the page; then it just plays. */
let audio: AudioContext | undefined;
let lastBeep = 0;
function beep() {
  const now = Date.now();
  if (now - lastBeep < 2000) return; // a burst of notifications is one sound
  lastBeep = now;
  try {
    audio ??= new AudioContext();
    if (audio.state === 'suspended') void audio.resume();
    const t = audio.currentTime;
    for (const [i, f] of [880, 1175].entries()) {
      const o = audio.createOscillator();
      const g = audio.createGain();
      o.frequency.value = f;
      g.gain.setValueAtTime(0.0001, t + i * 0.12);
      g.gain.exponentialRampToValueAtTime(0.12, t + i * 0.12 + 0.02);
      g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.12 + 0.22);
      o.connect(g).connect(audio.destination);
      o.start(t + i * 0.12);
      o.stop(t + i * 0.12 + 0.25);
    }
  } catch { /* no audio available */ }
}
export const playNotificationSound = beep;

export function NotificationsProvider({ app, apiUrl, children }: { app: NotificationApp; apiUrl: string; children: ReactNode }) {
  const pathname = usePathname();
  // Is anyone signed in? Read on every render and so re-checked on navigation (login and logout happen without a full page load).
  // Server and first client render say "no", so there is no hydration mismatch.
  void pathname;
  const signedIn = useSyncExternalStore(() => () => undefined, hasSessionCookie, () => false);
  const [liveConnected, setConnected] = useState(false);
  const [liveUnread, setUnread] = useState(0);
  const connected = signedIn && liveConnected;
  const unread = signedIn ? liveUnread : 0;
  const [epoch, setEpoch] = useState(0);
  const listeners = useRef(new Set<Listener>());
  const supabase = useRef<{ auth: { getSession(): Promise<{ data: { session: { access_token: string } | null } }> } } | null>(null);

  const token = useCallback(async () => {
    supabase.current ??= (await import('@greenscape/auth/browser')).createSupabaseBrowserClient();
    return (await supabase.current.auth.getSession()).data.session?.access_token ?? null;
  }, []);

  const call = useCallback(
    async <T,>(path: string, init: RequestInit = {}): Promise<T> => {
      const t = await token();
      if (!t) throw new Error('Not signed in');
      const res = await fetch(`${apiUrl}/v1/notifications${path}`, { ...init, headers: { authorization: `Bearer ${t}`, ...(init.body ? { 'content-type': 'application/json' } : {}), ...init.headers }, cache: 'no-store' });
      const body = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(body?.error?.message ?? `Request failed (${res.status})`);
      return body as T;
    },
    [apiUrl, token],
  );

  const emit = useCallback((e: StreamEvent) => listeners.current.forEach((fn) => fn(e)), []);
  const syncTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  /** The server is the source of truth for the count (lists are paged, so we cannot derive it). */
  const syncCount = useCallback(() => {
    clearTimeout(syncTimer.current);
    syncTimer.current = setTimeout(() => void call<NotificationPage>(`?app=${app}&limit=1`).then((p) => setUnread(p.unreadCount)).catch(() => undefined), 120);
  }, [app, call]);

  const handle = useCallback(
    (name: string, data: unknown) => {
      if (name === 'ready') return;
      if (name === 'created') {
        const { notification: n, sound } = data as Extract<StreamEvent, { event: 'created' }>['data'];
        setUnread((c) => c + 1);
        if (sound) beep();
        if (document.visibilityState === 'visible') {
          void import('sonner').then(({ toast }) => toast(n.title, { description: n.message, action: n.href ? { label: 'View', onClick: () => { window.location.assign(n.href!); } } : undefined }));
        }
      } else syncCount();
      emit({ event: name, data } as StreamEvent);
    },
    [emit, syncCount],
  );

  // The live connection: fetch + stream (EventSource cannot send the Authorization header). Reconnects with backoff,
  // and on every (re)connect the server's `ready` event tells open lists to re-fetch, which recovers anything missed.
  useEffect(() => {
    if (!signedIn) return;
    const ctrl = new AbortController();
    let first = true;
    void (async () => {
      let attempt = 0;
      while (!ctrl.signal.aborted) {
        // One controller per connection. A silent network drop leaves reads hanging with no error, so the connection is
        // also abandoned when the server's 25 s heartbeat stops for 60 s, or when the browser reports it is back online.
        const conn = new AbortController();
        const drop = () => conn.abort();
        let watchdog: ReturnType<typeof setTimeout> | undefined;
        const kick = () => { clearTimeout(watchdog); watchdog = setTimeout(drop, 60_000); };
        ctrl.signal.addEventListener('abort', drop, { once: true });
        window.addEventListener('online', drop);
        try {
          const t = await token();
          if (!t) return; // signed out
          kick();
          const res = await fetch(`${apiUrl}/v1/notifications/stream?app=${app}`, { headers: { authorization: `Bearer ${t}` }, signal: conn.signal, cache: 'no-store' });
          if (!res.ok || !res.body) throw new Error(String(res.status));
          const reader = res.body.getReader();
          const dec = new TextDecoder();
          let buf = '';
          for (;;) {
            const { value, done } = await reader.read();
            if (done) break;
            kick();
            buf += dec.decode(value, { stream: true });
            for (let i = buf.indexOf('\n\n'); i >= 0; i = buf.indexOf('\n\n')) {
              const block = buf.slice(0, i);
              buf = buf.slice(i + 2);
              const name = /^event: (.+)$/m.exec(block)?.[1];
              const data = /^data: (.+)$/m.exec(block)?.[1];
              if (!name || !data) continue;
              if (name === 'ready') {
                attempt = 0;
                setConnected(true);
                syncCount();
                if (!first) setEpoch((n) => n + 1);
                if (first) void import('./push').then((m) => m.resyncPush(call, app)).catch(() => undefined);
                first = false;
              }
              handle(name, JSON.parse(data));
            }
          }
        } catch {
          if (ctrl.signal.aborted) return;
        } finally {
          clearTimeout(watchdog);
          window.removeEventListener('online', drop);
          ctrl.signal.removeEventListener('abort', drop);
        }
        setConnected(false);
        if (typeof navigator !== 'undefined' && !navigator.onLine) await new Promise<void>((r) => window.addEventListener('online', () => r(), { once: true }));
        await new Promise((r) => setTimeout(r, Math.min(30_000, 1000 * 2 ** attempt++) * (0.5 + Math.random() / 2)));
      }
    })();
    return () => ctrl.abort();
  }, [signedIn, app, apiUrl, token, call, handle, syncCount]);

  const value = useMemo<Ctx>(
    () => ({
      app, signedIn, connected, unread, epoch, call,
      subscribe: (fn) => { listeners.current.add(fn); return () => void listeners.current.delete(fn); },
      // Optimistic: lists update at once; a failure re-fetches (epoch) and tells the person.
      async markRead(id) {
        emit({ event: 'read', data: { ids: [id] } });
        setUnread((n) => Math.max(0, n - 1));
        await call(`/${id}/read`, { method: 'POST' }).catch(() => { setEpoch((n) => n + 1); syncCount(); });
      },
      async markAllRead() {
        emit({ event: 'read_all', data: {} });
        setUnread(0);
        await call(`/read-all?app=${app}`, { method: 'POST' }).catch(() => { setEpoch((n) => n + 1); syncCount(); });
      },
      async remove(id) {
        emit({ event: 'deleted', data: { ids: [id] } });
        await call(`/${id}`, { method: 'DELETE' }).catch(() => setEpoch((n) => n + 1));
        syncCount();
      },
      async clear(readOnly) {
        emit({ event: 'cleared', data: { readOnly } });
        await call(`?app=${app}&readOnly=${readOnly}`, { method: 'DELETE' }).catch(() => setEpoch((n) => n + 1));
        syncCount();
      },
    }),
    [app, signedIn, connected, unread, epoch, call, emit, syncCount],
  );
  return <NotificationsContext.Provider value={value}>{children}</NotificationsContext.Provider>;
}

/**
 * One page-by-page list of the caller's notifications for a filter, kept current by the live stream. The bell and the
 * notification centre each own one. Re-fetches the first page after every reconnect.
 */
export function useFeed(filter: FeedFilter = {}, enabled = true) {
  const { app, call, subscribe, epoch } = useNotifications();
  const key = `${filter.unread ? 1 : 0}|${filter.category ?? ''}`;
  // Data is tagged with the filter it was loaded for, so a filter change shows the skeleton instead of stale rows.
  const [data, setData] = useState<{ key: string; items: NotificationView[]; next: string | null } | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const fresh = data?.key === key ? data : null;
  const qs = useCallback(
    (cursor?: string | null) => `?app=${app}&limit=20${key.startsWith('1') ? '&unread=true' : ''}${key.split('|')[1] ? `&category=${key.split('|')[1]}` : ''}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
    [app, key],
  );

  // Loads the first page, and again after every reconnect (epoch). setState only happens in the async callbacks.
  useEffect(() => {
    if (!enabled) return;
    let stale = false;
    call<NotificationPage>(qs())
      .then((p) => { if (!stale) { setData({ key, items: p.items, next: p.nextCursor }); setFailed(null); } })
      .catch(() => { if (!stale) setFailed(key); });
    return () => { stale = true; };
  }, [enabled, call, qs, key, epoch]);

  useEffect(() => {
    const f: FeedFilter = { unread: key.startsWith('1'), category: key.split('|')[1] || undefined };
    return subscribe((e) => setData((cur) => (cur && cur.key === key ? { ...cur, items: applyEvent(cur.items, e, f) } : cur)));
  }, [subscribe, key]);

  const cursor = fresh?.next ?? null;
  const loadMore = useCallback(async () => {
    if (!cursor || more) return;
    setMore(true);
    try {
      const p = await call<NotificationPage>(qs(cursor));
      setData((cur) => (cur && cur.key === key ? { ...cur, items: [...cur.items, ...p.items.filter((n) => !cur.items.some((c) => c.id === n.id))], next: p.nextCursor } : cur));
    } catch { /* the button stays; try again */ } finally { setMore(false); }
  }, [cursor, more, call, qs, key]);

  const state = fresh ? 'ready' : failed === key ? 'error' : 'loading';
  return { items: fresh?.items ?? [], state: state as 'loading' | 'ready' | 'error', hasMore: fresh?.next != null, loadingMore: more, loadMore };
}
