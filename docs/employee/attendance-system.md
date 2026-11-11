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

Header (employee number, today's Manila date, sign out); clock card (status, assigned shift segments, large Clock in /
Clock out button that works before JavaScript loads); last 7 days (worked time, days present, late and short minutes);
last 30 days list with times, worked hours, late and undertime, approval state and per-day correction requests; leave
(balances, request form, own requests with status and decisions).

## Rules (API, `apps/api/src/modules/attendance/`)

- **Server time only.** Punches are stamped by the API; the browser sends only IN or OUT.
- **One open session per employee**, serialised per employee: duplicate taps create one punch; clock-out without an
  open clock-in is refused; a clock-out within a minute of clocking in is refused.
- **Asia/Manila** business dates; split and overnight shifts; grace period; late, undertime and overtime (recorded only);
  worked time less breaks. Pure, unit-tested time functions (`time.ts`).
- **Day close job** marks absences, missing time-outs, holidays and leave days.
- **Own data only:** every `/v1/me/*` route resolves the employee from the session; there is no employee id to change.
- **Corrections:** missing clock-in or clock-out, wrong time or dispute, with a reason (and the day). HR sees proposed
  vs recorded side by side and approves or declines. Nobody approves their own records. Approved days cannot be edited
  by the employee; HR edits require a reason. Every change is in the audit log.
- **Leave:** types with yearly balances (service incentive leave seeded at 5 days), requests checked against balance
  including waiting requests, overlaps refused, approval row-locks the balance; cancellations return days; decisions are
  visible to the employee.

## Admin side

Employees (records, logins, schedules), daily attendance board with bulk approval, corrections queue, per-employee
history, leave queue with month calendar, balances, leave types and holidays, attendance report (table, CSV, XLSX).

## Not built

Monthly calendar view in the portal (the 30-day list covers the same data), in-portal notifications, correction
attachments, clock-in photos or location (decision D6).
