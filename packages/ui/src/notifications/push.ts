// Browser side of Web Push: permission, service worker, subscription. Loaded only when push is switched on or checked.
import type { NotificationApp } from '@greenscape/validation';

export type PushState = 'unsupported' | 'unconfigured' | 'blocked' | 'off' | 'on';

type Call = <T = unknown>(path: string, init?: RequestInit) => Promise<T>;
type Config = { enabled: boolean; publicKey: string | null };

const DEVICE_KEY = 'gs.notifications.device';
const supported = () => typeof window !== 'undefined' && 'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window;

/** Stable per-browser id so a re-subscription replaces this device's row instead of adding another. */
function deviceId() {
  try {
    return localStorage.getItem(DEVICE_KEY) ?? (() => { const id = crypto.randomUUID(); localStorage.setItem(DEVICE_KEY, id); return id; })();
  } catch {
    return crypto.randomUUID(); // storage blocked: this session still works, it just won't dedupe across reloads
  }
}

const keyBytes = (b64: string) => {
  const raw = atob(b64.replace(/-/g, '+').replace(/_/g, '/').padEnd(Math.ceil(b64.length / 4) * 4, '='));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
};

async function registration() {
  return (await navigator.serviceWorker.getRegistration('/')) ?? navigator.serviceWorker.register('/sw.js', { scope: '/' });
}

async function send(call: Call, app: NotificationApp, sub: PushSubscription) {
  await call('/push/subscriptions', { method: 'POST', body: JSON.stringify({ app, deviceId: deviceId(), subscription: sub.toJSON() }) });
}

export async function pushState(call: Call): Promise<PushState> {
  if (!supported()) return 'unsupported';
  const cfg = await call<Config>('/push/config');
  if (!cfg.enabled) return 'unconfigured';
  if (Notification.permission === 'denied') return 'blocked';
  const reg = await navigator.serviceWorker.getRegistration('/');
  return Notification.permission === 'granted' && (await reg?.pushManager.getSubscription()) ? 'on' : 'off';
}

/** Must run from a click: this is what shows the browser's permission prompt. */
export async function enablePush(call: Call, app: NotificationApp): Promise<PushState> {
  if (!supported()) return 'unsupported';
  const cfg = await call<Config>('/push/config');
  if (!cfg.enabled || !cfg.publicKey) return 'unconfigured';
  if ((await Notification.requestPermission()) !== 'granted') return Notification.permission === 'denied' ? 'blocked' : 'off';
  const reg = await registration();
  await navigator.serviceWorker.ready;
  const sub = (await reg.pushManager.getSubscription()) ?? (await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(cfg.publicKey) }));
  await send(call, app, sub);
  return 'on';
}

export async function disablePush(call: Call): Promise<PushState> {
  const sub = await (await navigator.serviceWorker.getRegistration('/'))?.pushManager.getSubscription();
  if (sub) {
    await call('/push/subscriptions', { method: 'DELETE', body: JSON.stringify({ endpoint: sub.endpoint }) }).catch(() => undefined);
    await sub.unsubscribe();
  }
  return 'off';
}

/** Sends a test alert to this account's devices for this app (the server picks the recipient: always the caller). */
export const testPush = (call: Call, app: NotificationApp) => call<{ devices: number }>(`/push/test?app=${app}`, { method: 'POST' });

/**
 * Signed out (login page): this browser must stop receiving the previous account's alerts. Without a session we cannot
 * call the API, so the subscription is dropped locally; the push service then answers 410 and the server deletes the row.
 * The next person must turn alerts on again themselves.
 */
export async function dropLocalPush() {
  if (!supported()) return;
  const sub = await (await navigator.serviceWorker.getRegistration('/'))?.pushManager.getSubscription();
  await sub?.unsubscribe();
}

/** On page load for someone who already allowed push: keeps this device's row fresh and survives key rotation. Never prompts. */
export async function resyncPush(call: Call, app: NotificationApp) {
  if (!supported() || Notification.permission !== 'granted') return;
  const reg = await navigator.serviceWorker.getRegistration('/');
  let sub = await reg?.pushManager.getSubscription();
  if (!reg || !sub) return;
  // Made with a key the server no longer uses (rotation): the push service would refuse every push to it, so swap it.
  const cfg = await call<Config>('/push/config').catch(() => null);
  const used = sub.options.applicationServerKey;
  if (cfg?.publicKey && used && !sameBytes(new Uint8Array(used), keyBytes(cfg.publicKey))) {
    await sub.unsubscribe();
    sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: keyBytes(cfg.publicKey) }).catch(() => null);
    if (!sub) return; // this browser wants a click for it: the settings show "Turn on alerts" again
  }
  await send(call, app, sub).catch(() => undefined);
}

const sameBytes = (a: Uint8Array, b: Uint8Array) => a.length === b.length && a.every((x, i) => x === b[i]);
