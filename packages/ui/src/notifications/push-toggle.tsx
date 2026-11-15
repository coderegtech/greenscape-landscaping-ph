'use client';
import { BellRing, Send } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button } from '../components/button';
import type { PushState } from './push';
import { useNotifications } from './provider';

const WHY: Record<PushState, string> = {
  unsupported: 'This browser cannot show alerts when the site is closed. On iPhone, add the site to your Home Screen first.',
  unconfigured: 'Alerts when the site is closed are not set up on this server yet.',
  blocked: 'Alerts are blocked for this site. Allow notifications in your browser settings, then reload.',
  off: 'Get alerts on this device even when the site is closed.',
  on: 'Alerts are on for this device.',
};

/**
 * Asks for browser permission only when the person clicks (browsers ignore, and users resent, prompts on page load).
 * `compact` is the bell's version: it only appears while there is something to turn on.
 */
export function PushToggle({ compact = false }: { compact?: boolean }) {
  const { app, call, signedIn } = useNotifications();
  const [state, setState] = useState<PushState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState('');
  useEffect(() => {
    if (signedIn) void import('./push').then((m) => m.pushState(call)).then(setState).catch(() => setState('unsupported'));
  }, [signedIn, call]);
  if (!state || (compact && state !== 'off')) return null;

  const run = async () => {
    setBusy(true);
    setError('');
    try {
      const m = await import('./push');
      setState(state === 'on' ? await m.disablePush(call) : await m.enablePush(call, app));
    } catch (e) {
      setError((e as Error).message || 'Could not change this setting. Try again.');
    } finally {
      setBusy(false);
    }
  };
  const test = async () => {
    setBusy(true);
    setError('');
    setSent('');
    try {
      const { devices } = await (await import('./push')).testPush(call, app);
      setSent(`Sent to ${devices} device${devices === 1 ? '' : 's'}. It can take a few seconds to appear.`);
    } catch (e) {
      setError((e as Error).message || 'Could not send a test alert. Try again.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className={compact ? 'border-t border-rule px-3 py-2' : 'flex flex-col gap-2'}>
      <p className="text-sm text-ink-2" id="push-why">{WHY[state]}</p>
      {(state === 'off' || state === 'on') && (
        <Button variant={state === 'on' ? 'secondary' : 'primary'} size="sm" className="self-start" loading={busy} onClick={run} aria-describedby="push-why">
          <BellRing /> {state === 'on' ? 'Turn off on this device' : 'Turn on alerts'}
        </Button>
      )}
      {state === 'on' && !compact && (
        <Button variant="secondary" size="sm" className="self-start" loading={busy} onClick={test}>
          <Send /> Send a test alert
        </Button>
      )}
      {sent && <p role="status" className="text-sm text-ink-2">{sent}</p>}
      {error && <p role="alert" className="text-sm text-danger">{error}</p>}
    </div>
  );
}
