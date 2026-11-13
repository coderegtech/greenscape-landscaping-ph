// Notification sounds for the portals: five short tones made with the Web Audio API (no audio files, nothing to
// license or download), one shared AudioContext, and the rules about when a sound may play. No React in here.
//
// Rules:
//  * Off until the person turns sounds on (a click, which is also the gesture browsers require before audio plays).
//  * Browsers block audio until a gesture on the page. We never work around that: a blocked sound is simply skipped.
//  * One sound per notification id, in one tab only (Web Locks), and at most one sound every 1.5 s.

export type SoundName = 'chime' | 'success' | 'error' | 'approval' | 'alert';
export type SoundStyle = 'soft' | 'bright' | 'wood';
export interface SoundPrefs {
  enabled: boolean;
  /** 0 to 1. */
  volume: number;
  style: SoundStyle;
  /** Only important and urgent notifications make a sound. */
  importantOnly: boolean;
}

export const SOUND_LABELS: Record<SoundName, string> = {
  chime: 'New notification',
  success: 'Attendance recorded',
  error: 'Something went wrong',
  approval: 'Request approved',
  alert: 'Important alert',
};
export const STYLE_LABELS: Record<SoundStyle, string> = { soft: 'Soft chime', bright: 'Bright bell', wood: 'Wood block' };
export const DEFAULT_PREFS: SoundPrefs = { enabled: false, volume: 0.6, style: 'soft', importantOnly: false };

/** Kept per browser and per portal: volume and "sounds on" belong to the device in front of the person. */
export const prefsKey = (app: string) => `gs-sound:${app}`;

export function parsePrefs(raw: string | null | undefined): SoundPrefs {
  try {
    const p = JSON.parse(raw || '{}') as Partial<SoundPrefs>;
    return {
      enabled: p.enabled === true,
      volume: typeof p.volume === 'number' && p.volume >= 0 && p.volume <= 1 ? p.volume : DEFAULT_PREFS.volume,
      style: p.style && p.style in STYLE_LABELS ? p.style : DEFAULT_PREFS.style,
      importantOnly: p.importantOnly === true,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}
export function loadPrefs(app: string): SoundPrefs {
  try { return parsePrefs(localStorage.getItem(prefsKey(app))); } catch { return DEFAULT_PREFS; }
}

/** Which tone a notification gets: a distinct one for urgent, stock and security items, a brighter one for an approval. */
export function soundFor(n: { type: string; category: string; priority: string }): SoundName {
  if (n.priority === 'URGENT' || n.category === 'stock' || n.category === 'account') return 'alert'; // operational and security
  if (/\.approved$/.test(n.type)) return 'approval';
  return 'chime';
}

/** Should this notification make a sound at all, given the person's settings? (The per-category choice is the server's.) */
export const allowed = (prefs: SoundPrefs, n: { priority: string }) => prefs.enabled && prefs.volume > 0 && (!prefs.importantOnly || n.priority === 'URGENT' || n.priority === 'HIGH');

// Notes as [frequency Hz, start s, length s]. All under half a second.
const TONES: Record<SoundName, [number, number, number][]> = {
  chime: [[880, 0, 0.22], [1174.7, 0.12, 0.26]],
  success: [[659.3, 0, 0.16], [987.8, 0.1, 0.24]],
  error: [[233.1, 0, 0.16], [196, 0.13, 0.22]],
  approval: [[784, 0, 0.14], [987.8, 0.09, 0.14], [1318.5, 0.18, 0.26]],
  alert: [[740, 0, 0.12], [740, 0.16, 0.12], [987.8, 0.32, 0.2]],
};
const STYLES: Record<SoundStyle, { wave: OscillatorType; pitch: number; decay: number }> = {
  soft: { wave: 'sine', pitch: 1, decay: 1 },
  bright: { wave: 'triangle', pitch: 1.5, decay: 0.85 },
  wood: { wave: 'sine', pitch: 0.75, decay: 0.45 },
};

let ctx: AudioContext | undefined;
let lastPlayed = 0;
const played = new Set<string>();

/** True once the browser lets this page make sound. */
export const canPlay = () => ctx?.state === 'running';

/** Call from a click or key press: creates or resumes the audio context. Resolves false if the browser still refuses. */
export async function unlock(): Promise<boolean> {
  try {
    ctx ??= new AudioContext();
    if (ctx.state === 'suspended') await ctx.resume();
    return ctx.state === 'running';
  } catch {
    return false;
  }
}

/**
 * After a reload the saved "sounds on" needs a fresh gesture: the first click or key press on the page unlocks audio.
 * Returns the cleanup. Nothing is played here.
 */
export function unlockOnGesture(): () => void {
  const go = () => { void unlock().then((ok) => { if (ok) stop(); }); };
  const stop = () => { window.removeEventListener('pointerdown', go); window.removeEventListener('keydown', go); };
  window.addEventListener('pointerdown', go);
  window.addEventListener('keydown', go);
  return stop;
}

/** Only one tab plays a given notification: the first to take the lock holds it for a few seconds. */
function claim(id: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.locks) return Promise.resolve(true);
  return new Promise((resolve) => {
    navigator.locks
      .request(`gs-sound:${id}`, { ifAvailable: true }, (lock) => {
        resolve(!!lock);
        return lock ? new Promise((r) => setTimeout(r, 4000)) : undefined;
      })
      .catch(() => resolve(true));
  });
}

function synth(name: SoundName, prefs: SoundPrefs) {
  if (!ctx) return;
  const { wave, pitch, decay } = STYLES[prefs.style];
  const master = ctx.createGain();
  master.gain.value = prefs.volume * 0.3; // full volume is still a quiet tone
  master.connect(ctx.destination);
  const t0 = ctx.currentTime + 0.01;
  let end = t0;
  for (const [freq, at, len] of TONES[name]) {
    const osc = ctx.createOscillator();
    const env = ctx.createGain();
    const start = t0 + at;
    const stop = start + len * decay;
    osc.type = wave;
    osc.frequency.value = freq * pitch;
    env.gain.setValueAtTime(0.0001, start);
    env.gain.exponentialRampToValueAtTime(1, start + 0.015);
    env.gain.exponentialRampToValueAtTime(0.0001, stop);
    osc.connect(env).connect(master);
    osc.start(start);
    osc.stop(stop + 0.02);
    end = Math.max(end, stop);
  }
  setTimeout(() => master.disconnect(), (end - ctx.currentTime) * 1000 + 100);
}

/**
 * Plays a tone if the settings and the browser allow it; resolves true when it did.
 * `id` (a notification id) makes it once-only across this tab and others, and subject to the burst limit.
 * `preview` ignores the on/off switch (the person pressed a "play" button).
 */
export async function play(name: SoundName, prefs: SoundPrefs, opts: { id?: string; preview?: boolean } = {}): Promise<boolean> {
  if (typeof window === 'undefined') return false;
  if (!opts.preview && (!prefs.enabled || prefs.volume <= 0)) return false;
  if (opts.id) {
    if (played.has(opts.id)) return false;
    played.add(opts.id);
    if (played.size > 500) played.clear();
  }
  if (opts.preview) await unlock();
  if (!canPlay()) return false; // blocked until a gesture: stay silent
  const now = Date.now();
  if (opts.id && now - lastPlayed < 1500) return false; // a burst of notifications is one sound; feedback for the person's own action always plays
  if (opts.id && !(await claim(opts.id))) return false;
  lastPlayed = now;
  try {
    synth(name, prefs);
  } catch {
    return false;
  }
  window.dispatchEvent(new CustomEvent('gs-sound', { detail: { name, id: opts.id ?? null } }));
  return true;
}

/** For actions on the page itself (clock in confirmed, a form failed): uses the portal's saved settings. */
export const playFeedback = (app: string, name: SoundName) => play(name, loadPrefs(app));
