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

Tests: `tests/integration/portals.test.ts`; `tests/e2e/attendance.spec.ts` ("HR adds an employee...").
