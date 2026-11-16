# Socket.IO and Web Push together

One pipeline, one database. Detail: [`docs/realtime/README.md`](../realtime/README.md), [realtime-events.md](realtime-events.md).

```
business change commits ─► events.emit()
  handlers.ts ─► service.notify()
     1. preferences (per category)
     2. INSERT Notification (dedupeKey: replays are dropped)
     3. Socket.IO publish to the recipient's room for that app  ─► open tabs: bell +1, toast, sound
     4. INSERT NotificationDelivery per device of that app       ─► push worker ─► device
```

* **Both channels, always.** A connected socket does not cancel the push, because a tab can be open but hidden or suspended. The service worker skips the system notification only when a window of the portal is visible and focused.
* **Duplicates:** `dedupeKey` (one row per event per person), `UNIQUE(notification, device)` (one push per device), the provider's `seen` set (one toast and one sound per id per tab, even after a reconnect), the sound manager's one-tab lock (one chime across tabs), and the worker skipping pushes already read on another device.
* **Reconnect:** the socket's `connect` re-reads the unread count and bumps `epoch`, and open lists re-fetch. Nothing is replayed from Redis; Postgres is the truth.
* **Sign-out:** the API closes that session's sockets, and the login page drops the local push subscription.
