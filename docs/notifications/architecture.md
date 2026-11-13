# Notifications: architecture (2026-11 portal redesign)

The notification system already existed before the redesign and is described in full in [`docs/notifications.md`](../notifications.md): PostgreSQL stores every notification, Redis pub/sub fans live events out across API instances, and browsers receive them over an authenticated Server-Sent Events stream. **The redesign reused all of it: no new infrastructure, no new dependency.**

This folder covers what the redesign added on top:

| Page | What |
|---|---|
| [realtime-events.md](realtime-events.md) | The three new triggers, how a live event is accepted in the browser (validation, deduplication), and what happens on logout |
| [sound-effects.md](sound-effects.md) | The five tones, when a sound plays and when it never does, browser autoplay rules, multi-tab behaviour |
| [user-preferences.md](user-preferences.md) | Where each setting lives (server per category, browser per device) and the controls |

## Pieces

```
API (Express)                                   Browser (admin :3001, employee :3002)
──────────────                                  ─────────────────────────────────────
business action ─► events.emit()                NotificationsProvider (one per portal)
     handlers.ts: audience by permission          │  fetch-based SSE reader, reconnect + backoff
     or by user id, wording, link                 │  'created' → validate id → dedupe → unread +1
service.notify(): preferences → INSERT ──► PG     │           → toast → sound-manager.play()
     hub.publish ──► Redis ──► every instance     │  'read' / 'read_all' / … → lists update
          └─► SSE stream of the recipient only ───┘
```

| File | Role |
|---|---|
| `apps/api/src/modules/notifications/handlers.ts` | The catalogue: who gets what. New: `schedule.changed`, `attendance.incomplete`, `testimonial.submitted` |
| `packages/ui/src/notifications/provider.tsx` | Live connection, unread count, event validation and deduplication, hands sounds to the sound manager |
| `packages/ui/src/notifications/sound-manager.ts` | Tones (Web Audio), play rules, one-tab lock, autoplay unlock. No React |
| `packages/ui/src/notifications/sound.tsx` | Header mute switch (`SoundToggle`) and the settings section (`SoundSettings`) |
| `packages/ui/src/notifications/bell.tsx`, `list.tsx`, `center.tsx` | Bell with unread badge and dropdown, list rows with category icons and priority markers, full notification centre |

The brief suggested `NotificationBell.tsx`, `NotificationSoundProvider.tsx` and similar names. The existing files already did those jobs under the repository's naming (kebab-case, one folder in the shared UI package), so they were extended rather than duplicated:

| Suggested | Where it is |
|---|---|
| NotificationBell / NotificationDropdown | `bell.tsx` |
| NotificationItem | `list.tsx` (`Item`) |
| NotificationToast | Sonner toast raised in `provider.tsx` |
| NotificationSoundProvider | `provider.tsx` + `sound-manager.ts` (no React context needed: settings are read when a sound is due) |
| NotificationSettings | `center.tsx` (Settings tab) + `sound.tsx` |
| notification-client.ts | `provider.tsx` (`call`, the stream reader) |
| notification-types.ts | `@greenscape/validation` (`NotificationView`, categories) and `format.ts` (`StreamEvent`) |

## Security

* Every query and the stream are scoped to the caller (`recipientId = <caller>`); another person's id answers 404. Tested in `tests/integration/notifications.test.ts` and `portal-redesign.test.ts`.
* Staff audiences are resolved by **permission**, never role name. Employee notices go to one user id, in the `employee` app only.
* No personal data in broadcasts: the new review notice carries only the star rating; schedule notices only the schedule's name.
* Push previews (`sw.ts`) show title and message only, which the handlers keep free of confidential detail.
