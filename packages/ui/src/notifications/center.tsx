'use client';
import { CATEGORY_KEYS, NOTIFICATION_CATEGORIES, type NotificationCategory, type NotificationPreferenceItem } from '@greenscape/validation';
import { Volume2 } from 'lucide-react';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '../components/button';
import { Checkbox } from '../components/checkbox';
import { Skeleton } from '../components/skeleton';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '../components/tabs';
import { Notice } from '../form';
import { NotificationList } from './list';
import { PushToggle } from './push-toggle';
import { playNotificationSound, useFeed, useNotifications } from './provider';

// The shared Tabs ships unthemed; these classes put it on the site's tokens (readable inactive labels, signal underline, scrolls on phones).
const tabsList = 'h-auto w-full justify-start gap-1 overflow-x-auto border-b border-rule p-0';
const tab = 'h-11 flex-none px-4 text-sm text-ink-2 hover:text-ink data-[state=active]:bg-transparent data-[state=active]:font-bold data-[state=active]:text-ink after:bg-signal after:!bottom-0 after:!h-[3px] data-[state=active]:after:opacity-100';
const selectClass = 'h-10 border border-muted bg-paper-2 px-3 text-sm text-ink';

function Inbox() {
  const { unread, connected, markAllRead, clear } = useNotifications();
  const [only, setOnly] = useState(false);
  const [category, setCategory] = useState('');
  const [confirm, setConfirm] = useState(false);
  const feed = useFeed({ unread: only, category: category || undefined });
  // Infinite scroll: ask for the next page when the sentinel scrolls into view; the button below is the keyboard fallback.
  const sentinel = useRef<HTMLDivElement>(null);
  const { hasMore, loadMore } = feed;
  useEffect(() => {
    const el = sentinel.current;
    if (!el || !hasMore) return;
    const io = new IntersectionObserver((e) => { if (e[0]?.isIntersecting) void loadMore(); }, { rootMargin: '200px' });
    io.observe(el);
    return () => io.disconnect();
  }, [hasMore, loadMore, feed.items.length]);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div role="group" aria-label="Show" className="flex">
          {[['All', false], ['Unread', true]].map(([label, v]) => (
            <Button key={String(label)} variant={only === v ? 'primary' : 'secondary'} size="sm" aria-pressed={only === v} onClick={() => setOnly(v as boolean)} className="rounded-none first:rounded-l-pill last:rounded-r-pill">
              {label}{v && unread ? ` (${unread})` : ''}
            </Button>
          ))}
        </div>
        <label className="flex items-center gap-2 text-sm">
          <span className="sr-only sm:not-sr-only">Type</span>
          <select value={category} onChange={(e) => setCategory(e.target.value)} className={selectClass}>
            <option value="">All types</option>
            {CATEGORY_KEYS.map((k) => <option key={k} value={k}>{NOTIFICATION_CATEGORIES[k].label}</option>)}
          </select>
        </label>
        <span className="ml-auto text-sm text-muted" role="status">{connected ? 'Live' : 'Reconnecting…'}</span>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button variant="secondary" size="sm" disabled={unread === 0} onClick={() => void markAllRead()}>Mark all as read</Button>
        <Button variant="secondary" size="sm" onClick={() => void clear(true)}>Clear read</Button>
        {confirm ? (
          <span role="group" aria-label="Confirm clear all" className="flex items-center gap-2 text-sm">
            Delete every notification?
            <Button variant="danger" size="sm" onClick={() => { setConfirm(false); void clear(false); }}>Yes, delete all</Button>
            <Button variant="ghost" size="sm" onClick={() => setConfirm(false)}>Keep them</Button>
          </span>
        ) : (
          <Button variant="danger" size="sm" onClick={() => setConfirm(true)}>Clear all</Button>
        )}
      </div>
      <div className="border border-rule" data-testid="notification-center-list">
        <NotificationList items={feed.items} state={feed.state} empty={only ? 'No unread notifications' : undefined} />
      </div>
      {feed.hasMore && (
        <div ref={sentinel} className="flex justify-center">
          <Button variant="secondary" size="sm" loading={feed.loadingMore} onClick={() => void feed.loadMore()}>Load older notifications</Button>
        </div>
      )}
    </div>
  );
}

function Row({ category, value, onChange, disabled }: { category: NotificationCategory; value: NotificationPreferenceItem; onChange: (v: NotificationPreferenceItem) => void; disabled: boolean }) {
  const { label, locked } = NOTIFICATION_CATEGORIES[category];
  const box = (key: 'inApp' | 'push' | 'sound', what: string, off?: boolean) => (
    <div role="cell">
      <label className="flex min-h-11 items-center justify-center gap-2 text-sm sm:min-w-20">
        <Checkbox checked={value[key]} disabled={disabled || off} onCheckedChange={(c) => onChange({ ...value, [key]: c === true })} aria-label={`${what}: ${label}`} />
        <span className="sm:sr-only">{what}</span>
      </label>
    </div>
  );
  return (
    <div role="row" className="grid grid-cols-3 items-center gap-x-2 border-b border-rule py-1 sm:grid-cols-[1fr_repeat(3,5rem)]">
      <div role="rowheader" className="col-span-3 pt-2 text-sm font-medium text-ink sm:col-span-1 sm:pt-0">
        {label}
        {locked && <span className="block text-xs font-normal text-muted">Always shown in your inbox</span>}
      </div>
      {box('inApp', 'In the app', locked)}
      {box('push', 'Alerts', !value.inApp)}
      {box('sound', 'Sound')}
    </div>
  );
}

function Preferences() {
  const { call } = useNotifications();
  const [prefs, setPrefs] = useState<NotificationPreferenceItem[] | null>(null);
  const [msg, setMsg] = useState<{ tone: 'error' | 'success'; text: string } | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  useEffect(() => { void call<{ preferences: NotificationPreferenceItem[] }>('/preferences').then((r) => setPrefs(r.preferences)).catch(() => setMsg({ tone: 'error', text: 'Could not load your settings.' })); }, [call]);

  const latest = useRef(prefs);
  useEffect(() => { latest.current = prefs; }, [prefs]);
  const change = useCallback((next: NotificationPreferenceItem) => {
    setPrefs((cur) => cur && cur.map((p) => (p.category === next.category ? { ...next, push: next.inApp && next.push } : p)));
    clearTimeout(timer.current);
    // Saved a moment after the last tick, as one request: no Save button to forget.
    timer.current = setTimeout(() => {
      const cur = latest.current;
      if (cur) void call<{ preferences: NotificationPreferenceItem[] }>('/preferences', { method: 'PUT', body: JSON.stringify({ preferences: cur }) }).then((r) => { setPrefs(r.preferences); setMsg({ tone: 'success', text: 'Saved.' }); }).catch(() => setMsg({ tone: 'error', text: 'Could not save. Your change is not stored yet; try again.' }));
    }, 500);
  }, [call]);

  return (
    <div className="flex max-w-3xl flex-col gap-8">
      <section aria-labelledby="alerts-h" className="flex flex-col gap-3">
        <h2 id="alerts-h" className="text-xl">Alerts on this device</h2>
        <PushToggle />
      </section>
      <section aria-labelledby="what-h" className="flex flex-col gap-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 id="what-h" className="text-xl">What to be told about</h2>
          <Button variant="ghost" size="sm" onClick={playNotificationSound}><Volume2 /> Play the sound</Button>
        </div>
        <div role="status" className="min-h-6">{msg && <Notice tone={msg.tone}>{msg.text}</Notice>}</div>
        {prefs ? (
          <div role="table" aria-label="Notification settings" className="flex flex-col">
            <div role="row" className="hidden grid-cols-[1fr_repeat(3,5rem)] gap-x-2 border-b border-rule-strong pb-1 text-xs font-medium text-muted sm:grid">
              <span role="columnheader">Type</span>
              {['In the app', 'Alerts', 'Sound'].map((h) => <span key={h} role="columnheader" className="text-center">{h}</span>)}
            </div>
            {prefs.map((p) => <Row key={p.category} category={p.category} value={p} onChange={change} disabled={false} />)}
          </div>
        ) : (
          <div className="flex flex-col gap-3">{CATEGORY_KEYS.map((k) => <Skeleton key={k} className="h-8 w-full" />)}</div>
        )}
      </section>
    </div>
  );
}

/** The full notification page: inbox (filters, bulk actions, history) and settings. */
export function NotificationCenter({ children }: { children?: React.ReactNode }) {
  const { signedIn } = useNotifications();
  // Both pages that show this sit behind sign-in; until the session is read on the client, show the loading state.
  if (!signedIn) return <NotificationList items={[]} state="loading" />;
  return (
    <Tabs defaultValue="inbox" className="gap-6">
      <TabsList variant="line" className={tabsList}>
        <TabsTrigger value="inbox" className={tab}>Inbox</TabsTrigger>
        <TabsTrigger value="settings" className={tab}>Settings</TabsTrigger>
        {children && <TabsTrigger value="announce" className={tab}>Send an announcement</TabsTrigger>}
      </TabsList>
      <TabsContent value="inbox"><Inbox /></TabsContent>
      <TabsContent value="settings"><Preferences /></TabsContent>
      {children && <TabsContent value="announce">{children}</TabsContent>}
    </Tabs>
  );
}
