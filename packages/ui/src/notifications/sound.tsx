'use client';
import { Play, Volume2, VolumeX } from 'lucide-react';
import { useCallback, useId, useState } from 'react';
import { Button } from '../components/button';
import { Checkbox } from '../components/checkbox';
import { useStored } from '../hooks/use-stored';
import { useNotifications } from './provider';
import { DEFAULT_PREFS, SOUND_LABELS, STYLE_LABELS, parsePrefs, play, prefsKey, unlock, type SoundName, type SoundPrefs, type SoundStyle } from './sound-manager';

/** This portal's sound settings on this browser, and a way to change them. Other tabs follow at once. */
export function useSoundPrefs(): [SoundPrefs, (patch: Partial<SoundPrefs>) => void] {
  const { app } = useNotifications();
  const [raw, setRaw] = useStored(prefsKey(app), '');
  const prefs = raw ? parsePrefs(raw) : DEFAULT_PREFS;
  const update = useCallback((patch: Partial<SoundPrefs>) => setRaw(JSON.stringify({ ...parsePrefs(raw), ...patch })), [raw, setRaw]);
  return [prefs, update];
}

/**
 * The always-there sound switch in the header. Off: "Enable notification sounds" (the click is the gesture browsers
 * need, and a quiet chime confirms it worked). On: one press mutes.
 */
export function SoundToggle() {
  const { signedIn } = useNotifications();
  const [prefs, update] = useSoundPrefs();
  if (!signedIn) return null;
  const toggle = async () => {
    if (prefs.enabled) return update({ enabled: false });
    update({ enabled: true });
    if (await unlock()) void play('chime', { ...prefs, enabled: true }, { preview: true });
  };
  const label = prefs.enabled ? 'Mute notification sounds' : 'Enable notification sounds';
  return (
    <Button variant="ghost" size="icon-sm" aria-label={label} title={label} aria-pressed={prefs.enabled} onClick={() => void toggle()} data-testid="sound-toggle">
      {prefs.enabled ? <Volume2 /> : <VolumeX className="text-muted" />}
    </Button>
  );
}

/** Settings page section: on/off, volume, which sound, important-only, and a preview of every tone. */
export function SoundSettings() {
  const [prefs, update] = useSoundPrefs();
  const [blocked, setBlocked] = useState(false);
  const id = useId();
  const preview = async (name: SoundName, p: SoundPrefs = prefs) => setBlocked(!(await play(name, p, { preview: true })));
  return (
    <section aria-labelledby="sound-h" className="flex flex-col gap-4" data-testid="sound-settings">
      <div className="flex flex-col gap-1">
        <h2 id="sound-h" className="text-xl">Sounds</h2>
        <p className="text-sm text-muted">Short, quiet tones for new notifications. Kept on this browser, so each device can differ. Choose which kinds of notification make a sound in the table below.</p>
      </div>
      <div className="flex min-h-11 items-center gap-3">
        <Checkbox
          id={`${id}-on`}
          checked={prefs.enabled}
          onCheckedChange={(c) => {
            update({ enabled: c === true });
            if (c === true) void preview('chime', { ...prefs, enabled: true });
          }}
        />
        <label htmlFor={`${id}-on`} className="text-sm font-medium text-ink">Enable notification sounds</label>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm font-medium text-ink">
          <span className="flex justify-between">Volume <span className="tabular font-normal text-muted">{Math.round(prefs.volume * 100)}%</span></span>
          <input
            type="range" min={0} max={100} step={5} value={Math.round(prefs.volume * 100)} disabled={!prefs.enabled}
            onChange={(e) => update({ volume: Number(e.target.value) / 100 })}
            onPointerUp={() => void preview('chime')}
            onKeyUp={() => void preview('chime')}
            className="h-11 w-full accent-(--gs-signal) disabled:opacity-50"
          />
        </label>
        <label className="flex flex-col gap-2 text-sm font-medium text-ink">
          Sound
          <select
            value={prefs.style} disabled={!prefs.enabled}
            onChange={(e) => { const style = e.target.value as SoundStyle; update({ style }); void preview('chime', { ...prefs, style }); }}
            className="h-11 border border-rule-strong bg-paper-3 px-3 text-sm text-ink disabled:opacity-50"
          >
            {(Object.keys(STYLE_LABELS) as SoundStyle[]).map((s) => <option key={s} value={s}>{STYLE_LABELS[s]}</option>)}
          </select>
        </label>
      </div>
      <div className="flex min-h-11 items-center gap-3">
        <Checkbox id={`${id}-important`} checked={prefs.importantOnly} disabled={!prefs.enabled} onCheckedChange={(c) => update({ importantOnly: c === true })} />
        <label htmlFor={`${id}-important`} className="text-sm text-ink">Only important and urgent notifications make a sound</label>
      </div>
      <div className="flex flex-col gap-2">
        <p className="text-sm font-medium text-ink">Hear each sound</p>
        <div className="flex flex-wrap gap-2">
          {(Object.keys(SOUND_LABELS) as SoundName[]).map((n) => (
            <Button key={n} variant="secondary" size="sm" onClick={() => void preview(n)} data-testid={`preview-${n}`}>
              <Play /> {SOUND_LABELS[n]}
            </Button>
          ))}
        </div>
        <p role="status" className="min-h-5 text-sm text-muted">
          {blocked ? 'Your browser did not allow sound just now. Check that this tab is not muted, then try again.' : ''}
        </p>
      </div>
    </section>
  );
}
