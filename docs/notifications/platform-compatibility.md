# Platform compatibility

Feature detection only (`'serviceWorker' in navigator && 'PushManager' in window && 'Notification' in window`). When it is missing the settings say so, and the inbox, live updates and sounds keep working.

| Platform | Push with the app closed | Notes |
|---|---|---|
| Chrome, Edge (Windows, macOS, Linux) | Yes, while the browser runs in the background | If the browser is fully quit, notifications arrive when it next starts, within the TTL (24 h important, 6 h normal, 1 h low). |
| Firefox desktop | Yes, while Firefox runs | Same TTL rules. |
| Safari on macOS | Yes | Uses Apple's push service; no extra setup with VAPID. |
| Chrome, Edge, Samsung Internet on Android | Yes, installed or not | Installing the portal gives it its own icon and notification settings. |
| iPhone / iPad, iOS/iPadOS 16.4+ | **Only when the portal is added to the Home Screen** and opened from there | Safari tabs cannot subscribe. "Turn on alerts" must be tapped inside the installed app. |
| iOS below 16.4, in-app browsers (Facebook, Instagram), some private windows | No | Shown as "This browser cannot show alerts when the site is closed". |

## Sound

* App open: the portal's own chimes (Web Audio), once the person has interacted with the page (autoplay rule), following mute, volume and "important only".
* App closed: the operating system's notification sound. A service worker cannot play audio, and none is attempted.

## Verified

Automated (Chromium, Playwright): a push delivered to each portal's service worker is displayed with that portal's icon, with no window open. See [testing.md](testing.md).

**Not verified on real devices in this work:** Android installed PWA, iPhone/iPad Home Screen app, Safari, Firefox, and delivery through a real push service with the browser closed. Run the device checklist in [testing.md](testing.md) once per platform.
