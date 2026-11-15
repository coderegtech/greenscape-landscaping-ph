# Notification preferences

Two layers, each stored where it belongs.

| Setting | Stored | Why there |
|---|---|---|
| Per category: in the app, alerts (Web Push), sound | PostgreSQL `NotificationPreference`, per user | Follows the person to every device; the server decides what to send and tells the browser whether this notification may make a sound (`sound` flag on the live event) |
| Sounds on/off, volume, sound style, only important | `localStorage` key `gs-sound:<app>`, per browser and portal | A laptop at the office and a phone in the field need different volumes; it never needs to leave the device |

Defaults: everything on at the server; **sounds off** in the browser. Corrupt or missing browser values fall back to the defaults (`parsePrefs`, unit-tested).

## Controls

* **Header speaker button** (both portals, always visible when signed in): "Enable notification sounds" when off, "Mute notification sounds" when on. Other open tabs of the same portal follow immediately.
* **Bell dropdown**: the same switch next to the heading.
* **Notifications → Settings** (admin `/notifications`, employee `/notifications`, linked from Profile and the account menu):
  * Sounds: enable, volume slider (plays a sample when released), sound style, only important and urgent, a play button for each of the five tones.
  * Alerts on this device: browser push permission, requested only when the person clicks.
  * What to be told about: per-category in the app / alerts / sound. Account and security notices can never be hidden from the inbox.
