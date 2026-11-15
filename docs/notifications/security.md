# Security

| Concern | Control |
|---|---|
| Identity | Every route verifies the Supabase JWT (`requireAuth`). The user id comes from the token, never the body. |
| Portal access | Registering a device for `admin` needs `admin.access`; for `employee` it needs `attendance.self`. A device then only ever receives that user's notifications for that app. |
| Recipients | Chosen on the server only: by permission for staff (`usersWithPermission`, active accounts) or by user id for one person. The only client-triggered send is the test alert, which has no recipient parameter. Announcements need `notifications.broadcast`, and are audited and rate-limited. |
| Ownership | Every read, update and delete includes `recipientId` / `userId` = caller. Another person's id answers 404. |
| Suspended accounts | No new pushes, and queued pushes are not sent. Token use is already refused by `resolveAuth`. |
| Shared devices | Sign-out drops the local subscription. A new sign-in that turns alerts on takes the endpoint over and deletes the old owner's row. |
| Payloads | Title, short message and a same-origin path. No customer contact data, review text or full employee names (these can show on lock screens). The worker rejects foreign URLs. |
| Secrets | `VAPID_PRIVATE_KEY` lives on the API only, and half a key pair stops startup. No route returns subscription endpoints or keys, and they are never logged. |
| Abuse | `POST /push/test` 10/hour, broadcast 20/hour, the general API rate limit, 20 pushes per user per minute. |
| CORS / CSP | API CORS is limited to `CORS_ORIGINS`; the portal CSPs keep `worker-src 'self'`. |
| Caching | The worker never stores API answers, pages or tokens. |

Tests: `tests/integration/notifications.test.ts` (authorization, ownership, portal check, test alert, suspended accounts), `tests/unit/notifications.test.ts` (validation, env check).
