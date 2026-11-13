# Notification sounds

Short tones made in the browser with the Web Audio API (`packages/ui/src/notifications/sound-manager.ts`). There are no audio files: nothing to license, download or cache, and the style setting changes the timbre without new assets. All tones are original, under half a second, and at full volume still quiet (master gain 0.3 × the volume setting).

## Tones

| Tone | Used for | Shape |
|---|---|---|
| `chime` | a new notification | soft two-note rise |
| `success` | clock in or out confirmed by the server | gentle rising pair |
| `error` | an action refused (for example clocking out within a minute) | low falling pair |
| `approval` | leave or a correction approved | three-note rise |
| `alert` | urgent priority, low stock, account and security notices | three distinct taps |

Styles: **Soft chime** (sine), **Bright bell** (triangle, higher), **Wood block** (lower, short).

## When a sound plays

All of these must hold:

1. The person turned sounds on in this portal on this browser (**off by default**).
2. Their per-category setting allows sound for this kind of notification (server preference).
3. Volume above zero, and if "only important" is on, the notification is HIGH or URGENT.
4. The browser lets the page play audio (the audio context is running).
5. This notification id has not played before in this tab, and no other open tab claimed it (Web Locks).
6. No other notification sound played in the last 1.5 s (a burst is one sound).

Never: on loading history, on a duplicate or malformed event, for someone else's notification (the stream only carries the caller's), after logout (no stream).

The `success` and `error` tones follow the clock-in form's server answer, never the tap itself: the form action waits for the API, then the tone, the toast and the "Recorded at" tick all appear together.

## Browser autoplay rules

Browsers keep audio locked until the person interacts with the page. We do not work around this:

* **Enable notification sounds** (the speaker button in the header, or the checkbox in Settings) is a click, which is the gesture that unlocks audio. A quiet chime confirms it works.
* After a reload, sounds stay on but audio is locked again: the first click or key press anywhere unlocks it. Until then notifications arrive silently, with badge and toast, and no error.
* If the browser still refuses (tab muted, site sound blocked), the settings page says so after a preview.

Tested with Chromium launched with `--autoplay-policy=document-user-activation-required` (`tests/e2e/portal-sound-blocked.spec.ts`).

## Several tabs

Each tab has its own audio context. To avoid two tabs chiming for the same event, a tab takes a short Web Lock named after the notification id before playing; the other tab's attempt fails and stays silent. Browsers without Web Locks fall back to one sound per tab.

## Resources

One `AudioContext` per page, created on the first gesture and reused. Oscillators and gain nodes are created per tone and disconnected when it ends. The provider removes its gesture listeners when the person signs out or the provider unmounts.
