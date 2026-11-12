# Employee and staff account provisioning

Nobody registers for the employee portal or the admin. Accounts are created by people who hold the right permission,
and the new person chooses their own password at first sign-in.

## Employees (HR)

1. Admin, **Employees, New**: employee number, name, work email, position, department, manager, status.
2. On the employee page, **Create login** (`POST /v1/hr/employees/:id/account`, needs `employees.manage`).
3. The API creates a confirmed Supabase email/password identity with a random temporary password, then the `User` row
   with the `employee` role and `mustChangePassword = true`, linked to the employee record in one transaction. If the
   database step fails, the identity is deleted again.
4. The temporary password is shown **once** in the admin. It is never stored, logged, audited or emailed: hand it over
   in person or by phone.
5. The employee opens `employee.<domain>`, signs in, is sent to **Set your password**, and from then on uses their own.

If the person already has a website account with that email, use **Link existing account** instead (they keep their
password; the `employee` role is added). Setting an employee to Resigned or Terminated removes the `employee` role.

## Staff accounts (admin users)

Admin, **Users and roles, Create staff account** (`POST /v1/users`, needs `users.manage` and `roles.manage`). Pick the
roles; `admin` and `super_admin` need a super admin. Same temporary-password flow at `admin.<domain>`.

## The first super admin

There is no public super admin route. Bootstrap:

- **Local:** `pnpm admin:create` (refuses any non-local Supabase; the password goes to the gitignored `.local/`).
- **Production:** create the identity in the Supabase dashboard (Authentication, Add user, auto-confirm), sign in once on
  the website so the `User` row exists, then on a trusted machine run
  `pnpm --filter @greenscape/database grant-role <email> super_admin` against the production database. Everything
  after that is done in the admin.

## Until the password is changed

The API gives the account customer permissions only and answers staff and employee routes with
`PASSWORD_CHANGE_REQUIRED`. `POST /v1/auth/password` works only while a temporary password is pending and only from a
password sign-in (a Google session on the same mailbox cannot use it). Supabase ends existing sessions when the password
changes, so the form signs in again with the new password.

## Sample staff for local development

`pnpm staff:seed` (after `pnpm db:seed` and `pnpm admin:create`) fills the admin and employee portal with people to
click through. Like `admin:create` it refuses a non-local Supabase or database. It creates, with the same
`provisionAccount` the admin uses (super admin as the provisioner):

- 7 employees (`GS-0101`–`GS-0107`, `@sample.greenscape.local`) across 4 departments and 3 schedules, each with a
  portal login. Maria Santos is also an HR manager (admin console); Paolo Reyes is an administrator.
- About three weeks of attendance with a scripted 38-minute late arrival (Andres), an absence (Ramon), a pending time
  correction (Rosa), an approved one (Carlo); days older than a week are approved.
- This year's leave balances and leave requests in every state (approved, pending, declined, cancelled), plus the HR
  notifications those events send.

Temporary passwords go to `.local/sample-staff-credentials.txt` (gitignored); the first sign-in asks for a new one.
Rerunning is safe: existing records are kept, missing days are added, and every sample account gets a new temporary
password.

Tests: `tests/integration/portals.test.ts`; `tests/e2e/attendance.spec.ts` ("HR adds an employee...").
