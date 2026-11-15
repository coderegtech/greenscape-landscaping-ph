# Push subscriptions

API under `/v1/notifications`. Every route needs a verified Supabase token. The user is always the token's user; no route accepts a user id or role.

| Route | |
|---|---|
| `GET /push/config` | `{ enabled, publicKey }`. |
| `POST /push/subscriptions` | Body `{ app, deviceId, subscription: { endpoint, keys: { p256dh, auth } } }`, Zod-validated (`PushSubscriptionBody`). `admin` needs `admin.access` and `employee` needs `attendance.self`, otherwise 403. Idempotent. |
| `DELETE /push/subscriptions` | Body `{ endpoint }`. Deletes only the caller's own row. |
| `POST /push/test?app=` | Test alert to the caller's own devices for that app. 409 with no device. 10/hour. |
| `GET` / `PUT /preferences` | See [notification-preferences.md](notification-preferences.md). |

No route lists devices: subscription endpoints and keys are never returned to a client.

## Lifecycle

| Situation | What happens |
|---|---|
| Several devices or browsers | One row each (`deviceId` is generated once per browser profile). Every row of that portal gets the push. |
| Same browser re-subscribes with a new endpoint | The device's old row is replaced. |
| Same browser, another account signs in and turns alerts on | The endpoint moves to the new account; the previous account's row for it is deleted. |
| Sign-out or expired session | The login page unsubscribes the browser locally (there is no session, so the API cannot be called). The next push to the old endpoint gets 410 and the row is deleted. The next person must turn alerts on themselves. |
| "Turn off on this device" | `DELETE` on the server, then `unsubscribe()` in the browser. |
| Account suspended or deleted | No new deliveries are queued, and queued ones end `FAILED (account not active)`. Deleting the user cascades its rows. |
| Push service answers 404/410 | Row deleted at once. |
| 5 notifications in a row failed for good | Row deleted. |
| Silent for 90 days | Row deleted by the hourly purge. |
| Reinstalled PWA or cleared site data | The browser has no subscription, so "Turn on alerts" appears again. The stale row is deleted on its first 410. |
