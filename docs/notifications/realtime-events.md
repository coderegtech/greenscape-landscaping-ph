# Real-time events

Transport is Socket.IO since the realtime work ([`docs/realtime/README.md`](../realtime/README.md)); the inbox event names (`created`, `read`, `read_all`, `deleted`, `cleared`) are unchanged and arrive as the `notification` socket event. Live dashboard signals (`live`) are listed there too.

## New triggers

| Domain event | Emitted from | Who | App | Link |
|---|---|---|---|---|
| `schedule.changed` (one employee) | `POST /v1/hr/employees/:id/schedule` | that employee | employee | `/schedule` |
| `schedule.changed` (whole schedule) | `PUT /v1/hr/schedules/:id` | active employees whose assignment is current | employee | `/schedule` |
| `attendance.incomplete` | day-close job (`closeDays`), when a record turns `INCOMPLETE` | that employee, HIGH priority | employee | `/attendance` |
| `testimonial.submitted` | `POST /v1/testimonials` | holders of `testimonials.moderate` | admin | `/cms/testimonials` |

Leave and correction decisions now link to the new portal pages (`/requests`, `/attendance`) instead of the home page.

Already covered before the redesign and still in place: new quote requests, paid orders (with payment confirmation), low stock, customer messages and contact-form inquiries, leave requests, correction requests, role changes, announcements.

Every event is emitted **after** the database write commits, and each notification has a `dedupeKey`, so a repeated event never stores a second row. The day-close job runs every 15 minutes; a record only notifies on the transition into `INCOMPLETE`.

## Accepting a live event in the browser

`provider.tsx`, on a `created` event:

1. The socket's inbox room is the signed-in person's own (the API filters by recipient); the browser does not trust anything else.
2. The notification id must be a UUID. Anything malformed is dropped.
3. The id must not have been seen in this tab. A repeated delivery (reconnect, a second instance) changes nothing: no count, no toast, no sound.
4. Unread count +1, toast if the tab is visible, then a sound if allowed ([sound-effects.md](sound-effects.md)).

The initial history (first page of the inbox, and every reload after a reconnect) is fetched with a normal GET, not streamed as `created`, so it can never make a sound.

## Logout

Signing out posts to `/auth/signout`, which ends the Supabase session on the server and redirects to the login page. That page has no session cookie, so the provider never opens a socket there. The API also closes that session's sockets on `/v1/auth/logout`, and tokens issued before the sign-out are refused (`SESSION_ENDED`), so an old socket cannot be reopened. The admin e2e test checks no realtime connection is made after sign-out.

## Tests

* `tests/integration/portal-redesign.test.ts`: each new trigger reaches exactly its audience; a review notice carries no name or text; the missed clock-out notice is sent once across two job runs.
* `tests/e2e/portal-redesign.spec.ts`: a schedule change arrives live in the employee's bell and links to the schedule page; another employee's inbox stays empty and cannot read it by id.
