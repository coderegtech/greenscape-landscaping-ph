# Employee portal redesign

Mobile-first. Before and after screenshots: `docs/screenshots/portal-redesign/`.

The portal was one long page. It is now five pages in a `(portal)` route group whose layout checks, once, that the person is an employee (the API decides) and otherwise shows the reason and a sign-out button.

| Page | Path | Contents |
|---|---|---|
| Dashboard | `/` | Greeting, date, employee number; the **attendance card**; today so far (first in, last out, recorded, late); last 7 days (bars + totals); coming up (next four days of the schedule); three newest notifications |
| Attendance | `/attendance` | Month calendar with day details and a legend; last 30 days as cards with a "Correct" button per day; ask for a correction for any day |
| Schedule | `/schedule` | The next 14 days: shift times, planned hours, rest days, holidays, approved leave |
| Requests | `/requests` | Leave balances, request leave, your requests (withdraw while pending); corrections waiting for HR |
| Profile | `/profile` | Name, employee number, work email, schedule (read only: HR keeps records); notifications and sounds; change password; sign out |
| Notifications | `/notifications` | Inbox and settings (sounds included) |

New API: `GET /v1/me/schedule` returns the signed-in employee's own next 14 days (three queries; nobody else's schedule is reachable).

## Attendance card

Large live clock (Manila time, ticks every second, rendered only after hydration), a status pill, shift, start, end and recorded hours, and one large Clock in / Clock out button (64px tall, full width on phones).

Status colours: green clocked in, blue scheduled today, orange correction waiting, gray clocked out / not clocked in, red absent or missing clock-out (only when the server's record says so). The status always comes from the server: the button submits a form action that waits for the API; only its answer shows the "Recorded at" tick, the toast and the success tone. A refused tap shows the server's message and keeps the old status.

The form still works before JavaScript loads, the selfie step (when HR turns it on) is unchanged, and the server still takes the time.

## Calendar

Seven columns from Monday. Each recorded day is tinted by status and carries an icon and (from 640px) its label; screen readers get the full date and status for every day. Today is ringed. Tapping a day shows its times, worked, late, short and overtime minutes, approval and pending correction, or for a future day what is planned. Legend: present, clocked in, late arrival, absent or incomplete, approved leave, holiday.

## Navigation

Phones: a bottom bar (Dashboard, Attendance, Schedule, Requests, Profile) with 64px targets, safe-area padding and a badge on Requests for requests waiting on HR. From 768px: the same destinations in the top bar, profile behind the avatar.

## Sign-in

Pastel botanical split screen; work email and password only, show/hide password, forgot password. No sign-up, no Google, no authenticator setup: HR still provisions every login.
