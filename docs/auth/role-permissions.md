# Roles and permissions

Single source: `packages/database/src/rbac.ts` (`pnpm db:seed` syncs it to Postgres). Deny by default: a route lists the
permissions it needs (`requirePermission`), and a user has only what their roles grant.

| Role | Portal | Grants |
|---|---|---|
| `super_admin` | Admin | Everything, including `roles.manage_super` (create administrators, grant/revoke `admin` and `super_admin`) and `settings.secrets` |
| `admin` | Admin | Everything except `roles.manage_super` and `settings.secrets` |
| `content_manager` | Admin | CMS, media, testimonials, quotations (read), messages, AI assistant settings |
| `ecommerce_manager` | Admin | Products, inventory, orders, refunds, customers, sales reports, quotations, messages |
| `inventory_staff` | Admin | Products (read), inventory, orders (read, fulfil) |
| `hr_manager` | Admin | Employees (incl. creating logins), schedules, attendance, corrections, leave approvals, attendance reports |
| `employee` | Employee portal | `attendance.self`, `leave.self`, `profile.self` |
| `customer` | Website | `profile.self`, `orders.self`, `quotations.self` (every new account) |

`admin.access` decides who can open the admin app at all; `employee` does not have it.

## Rules

- **Protected roles:** `super_admin` and `admin` can only be granted, revoked or suspended by a holder of
  `roles.manage_super`. Nobody changes their own roles or status.
- **Changes are immediate:** a role change invalidates the user's permission cache; the next request uses the new set.
- **Audited:** `user.provision`, `user.roles.set`, `user.status.set`, `user.password.initial_set`, `employee.*`.
- **Session narrowing** (Google sessions, temporary passwords, optional MFA): `docs/auth/supabase-authentication.md`.
- Per-route matrix and object-level rules: `docs/security/authorization-matrix.md`.
