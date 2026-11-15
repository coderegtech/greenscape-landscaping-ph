'use client';
// Notification state for one app (customer site or admin): the live connection, the unread count, and the actions.
// Mounted once in each layout. Anonymous visitors cost nothing: no network call and no extra JavaScript until a
// Supabase session cookie exists.
import { LIVE_TOPICS, REALTIME_FATAL, REALTIME_PATH, type LiveSignal, type LiveTopic, type NotificationApp, type NotificationPage, type RealtimeServerEvents } from '@greenscape/validation';
import type { Socket as IoSocket } from 'socket.io-client';
import { usePathname } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from 'react';
import { applyEvent, type FeedFilter, type StreamEvent } from './format';
import { allowed, loadPrefs, play, soundFor, unlockOnGesture } from './sound-manager';
import type { NotificationView } from '@greenscape/validation';

type Listener = (e: StreamEvent) => void;
type LiveListener = (s: LiveSignal) => void;
type Socket = IoSocket<RealtimeServerEvents, Record<string, never>>;
export type LiveStatus = 'connecting' | 'connected' | 'reconnecting' | 'offline' | 'disconnected';
export type Call = <T = unknown>(path: string, init?: RequestInit) => Promise<T>;

interface Ctx {
  app: NotificationApp;
  /** false until we know there is a signed-in user; the bell renders nothing for visitors. */
  signedIn: boolean;
  connected: boolean;
  status: LiveStatus;
  unread: number;
  /** Bumps after every reconnect so open lists re-fetch what they missed. */
  epoch: number;
  call: Call;
  subscribe: (fn: Listener) => () => void;
  /** Live "this changed" signals (admin dashboards, the employee's own records). */
  subscribeLive: (fn: LiveListener) => () => void;
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

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function NotificationsProvider({ app, apiUrl, children }: { app: NotificationApp; apiUrl: string; children: ReactNode }) {
  const pathname = usePathname();
  // Is anyone signed in? Read on every render and so re-checked on navigation (login and logout happen without a full page load).
  // Server and first client render say "no", so there is no hydration mismatch.
  void pathname;
  const signedIn = useSyncExternalStore(() => () => undefined, hasSessionCookie, () => false);
  const [liveStatus, setStatus] = useState<LiveStatus>('connecting');
  const [liveUnread, setUnread] = useState(0);
  const status: LiveStatus = signedIn ? liveStatus : 'disconnected';
  const connected = status === 'connected';
  const unread = signedIn ? liveUnread : 0;
  const [epoch, setEpoch] = useState(0);
  const listeners = useRef(new Set<Listener>());
  const liveListeners = useRef(new Set<LiveListener>());
  /** Ids of live signals already handled (a repeat after a reconnect changes nothing). */
  const seenLive = useRef(new Set<string>());
  /** Ids of notifications already shown live in this tab. */
  const seen = useRef(new Set<string>());
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
        // Only a well-formed notification we have not shown yet counts: a repeated event (reconnect, a second
        // delivery) changes nothing and makes no sound. The stream itself only carries the signed-in person's events.
        if (typeof n?.id !== 'string' || !UUID.test(n.id) || seen.current.has(n.id)) return;
        seen.current.add(n.id);
        setUnread((c) => c + 1);
        // `sound` is the person's per-category choice (server); the rest is this browser's sound settings.
        const prefs = loadPrefs(app);
        if (sound && allowed(prefs, n)) void play(soundFor(n), prefs, { id: n.id });
        if (document.visibilityState === 'visible') {
          void import('sonner').then(({ toast }) => toast(n.title, { description: n.message, action: n.href ? { label: 'View', onClick: () => { window.location.assign(n.href!); } } : undefined }));
        }
      } else syncCount();
      emit({ event: name, data } as StreamEvent);
    },
    [app, emit, syncCount],
  );

  // The live connection: one Socket.IO socket per tab (loaded only once someone is signed in). The handshake sends the
  // Supabase access token, fetched fresh on every attempt, so a reconnect after expiry carries a new one. Every
  // (re)connect re-syncs the count and bumps `epoch`, which makes open lists and live pages re-fetch what they missed.
  useEffect(() => {
    if (!signedIn) return;
    // Sounds were turned on earlier on this browser: the first click or key press after a reload unlocks audio again.
    const stopUnlock = loadPrefs(app).enabled ? unlockOnGesture() : undefined;
    let socket: Socket | undefined;
    let stopped = false;
    let first = true;
    let attempt = 0;
    let retry: ReturnType<typeof setTimeout> | undefined;
    const down = () => setStatus(navigator.onLine ? 'reconnecting' : 'offline');
    // Socket.IO retries dropped transports by itself; a refusal or a server-side close (token expiry, access change)
    // needs a manual retry, with backoff and jitter. The next handshake re-checks the account.
    const retryLater = () => {
      clearTimeout(retry);
      retry = setTimeout(() => socket?.connect(), Math.min(30_000, 1000 * 2 ** attempt++) * (0.5 + Math.random() / 2));
    };
    // An installed PWA coming back to the foreground: reconnect now instead of waiting for a throttled timer.
    const wake = () => { if (document.visibilityState === 'visible' && socket && !socket.connected) { clearTimeout(retry); socket.connect(); } };
    void import('socket.io-client').then(({ io }) => {
      if (stopped) return;
      setStatus('connecting');
      socket = io(apiUrl, {
        path: REALTIME_PATH,
        transports: ['websocket', 'polling'], // WebSocket first; long-polling only where a proxy blocks WebSockets
        tryAllTransports: true,
        auth: (cb) => void token().then((t) => cb({ token: t ?? '', app }), () => cb({ token: '', app })),
        reconnectionDelay: 1000,
        reconnectionDelayMax: 30_000,
        randomizationFactor: 0.5,
      });
      socket.on('connect', () => {
        attempt = 0;
        setStatus('connected');
        syncCount();
        if (!first) setEpoch((n) => n + 1);
        else void import('./push').then((m) => m.resyncPush(call, app)).catch(() => undefined);
        first = false;
      });
      socket.on('notification', (e) => { if (e && typeof e.event === 'string') handle(e.event, e.data); });
      socket.on('live', (s) => {
        if (!s || typeof s.id !== 'string' || !LIVE_TOPICS.includes(s.topic) || seenLive.current.has(s.id)) return;
        if (seenLive.current.size > 500) seenLive.current.clear();
        seenLive.current.add(s.id);
        liveListeners.current.forEach((fn) => fn(s));
      });
      socket.on('disconnect', (reason) => {
        down();
        if (reason === 'io server disconnect') retryLater();
      });
      socket.on('connect_error', (err) => {
        down();
        if (socket?.active) return; // a transport problem: Socket.IO is already retrying
        const code = (err as { data?: { code?: string } }).data?.code;
        if (code && (REALTIME_FATAL as readonly string[]).includes(code)) setStatus('disconnected'); // signed out or no access: wait for a new sign-in
        else retryLater();
      });
    });
    document.addEventListener('visibilitychange', wake);
    return () => {
      stopped = true;
      clearTimeout(retry);
      document.removeEventListener('visibilitychange', wake);
      socket?.disconnect();
      stopUnlock?.();
    };
  }, [signedIn, app, apiUrl, token, call, handle, syncCount]);

  const value = useMemo<Ctx>(
    () => ({
      app, signedIn, connected, status, unread, epoch, call,
      subscribe: (fn) => { listeners.current.add(fn); return () => void listeners.current.delete(fn); },
      subscribeLive: (fn) => { liveListeners.current.add(fn); return () => void liveListeners.current.delete(fn); },
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
    [app, signedIn, connected, status, unread, epoch, call, emit, syncCount],
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

/**
 * Runs `fn` when one of `topics` changes (debounced, so a burst of changes costs one re-fetch) and after every
 * reconnect, since anything may have changed while the socket was down.
 */
export function useLive(topics: readonly LiveTopic[], fn: () => void, waitMs = 400) {
  const { subscribeLive, epoch } = useNotifications();
  const latest = useRef(fn);
  useEffect(() => { latest.current = fn; });
  const key = topics.join(',');
  useEffect(() => {
    const wanted = new Set(key.split(','));
    let t: ReturnType<typeof setTimeout> | undefined;
    const off = subscribeLive((s) => {
      if (!wanted.has(s.topic)) return;
      clearTimeout(t);
      t = setTimeout(() => latest.current(), waitMs);
    });
    return () => { off(); clearTimeout(t); };
  }, [subscribeLive, key, waitMs]);
  const seenEpoch = useRef(epoch);
  useEffect(() => {
    if (epoch === seenEpoch.current) return;
    seenEpoch.current = epoch;
    latest.current();
  }, [epoch]);
}
