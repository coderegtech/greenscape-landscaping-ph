# Employee portal and attendance

`apps/employee` (`employee.<domain>`, local `localhost:3002`). Mobile-first, one page, no decoration. **No payroll**:
no pay, allowance or government-ID fields anywhere.

## Access

- Login with work email and password only (no Google button, no sign-up). Accounts come from HR
  (`docs/auth/employee-provisioning.md`).
- A pending temporary password always goes to **Set your password** first.
- The page renders only for accounts the API gives `attendance.self`. Customers, Google sessions and people whose
  employment ended see a refusal with a sign-out button. An employee never gets `admin.access`.
- The old website URL `/staff` redirects (308) to the portal.

## Dashboard

Header (employee number, today's Manila date, notifications bell, sign out); clock card (status, assigned shift
segments, large Clock in / Clock out button that works before JavaScript loads, selfie when HR turned it on); last 7
days (worked time, days present, late and short minutes); **month calendar** (every day's status in words and colour,
previous months via `?month=YYYY-MM`, today outlined); last 30 days list with times, worked hours, late and undertime,
approval state and per-day correction requests; leave (balances, request form, own requests with status and
decisions). **Notifications** (`/notifications`, bell in the header, live updates, optional phone push): HR's leave and
correction decisions and announcements to employees.

## Clock-in selfie (decision D6)

HR chooses Off (default), Optional or Required, and how many days photos are kept (7 to 365, default 90), in Admin →
Leave → Leave and attendance settings. The change is audited.

- The portal shows the notice next to the camera button: why the photo is taken, that only HR sees it, when it is
  deleted, and that it is **not used for face recognition** (no biometric matching is done).
- The button opens the front camera on phones; the photo is shrunk to 720 px on the phone and uploaded straight to the
  private `employee-private` bucket through a one-time signed link. The API checks it belongs to this person, is
  unclaimed, is really an image and is at most 10 MB before the punch claims it. With Required, the Clock button stays
  disabled until a photo is ready and the API refuses a punch without one (`SELFIE_REQUIRED`).
- With Off, no photo is kept even if one is sent.
- HR sees a "selfie" link (valid 5 minutes) next to each punch in the employee's history.
- The attendance job deletes photos older than the retention period (file, media row and the punch's reference).
  Unclaimed uploads are removed by `pnpm media:sweep --apply`.

## Rules (API, `apps/api/src/modules/attendance/`)

- **Server time only.** Punches are stamped by the API; the browser sends only IN or OUT.
- **One open session per employee**, serialised per employee: duplicate taps create one punch; clock-out without an
  open clock-in is refused; a clock-out within a minute of clocking in is refused.
- **Asia/Manila** business dates; split and overnight shifts; grace period; late, undertime and overtime (recorded only);
  worked time less breaks. Pure, unit-tested time functions (`time.ts`).
- **Day close job** marks absences, missing time-outs, holidays and leave days.
- **Own data only:** every `/v1/me/*` route resolves the employee from the session; there is no employee id to change.
- **Corrections:** missing clock-in or clock-out, wrong time or dispute, with a reason (and the day), and an optional
  supporting photo or PDF (same private upload and checks as selfies; HR opens it from the corrections queue). HR sees proposed
  vs recorded side by side and approves or declines. Nobody approves their own records. Approved days cannot be edited
  by the employee; HR edits require a reason. Every change is in the audit log.
- **Leave:** types with yearly balances (service incentive leave seeded at 5 days), requests checked against balance
  including waiting requests, overlaps refused, approval row-locks the balance; cancellations return days; decisions are
  visible to the employee.

## Admin side

Employees (records, logins, schedules), daily attendance board with bulk approval, corrections queue, per-employee
history, leave queue with month calendar, balances, leave types and holidays, attendance report (table, CSV, XLSX).

## Not built

Location capture at clock-in; face recognition (biometric matching would need a separate legal basis and DPIA under the
Data Privacy Act).
