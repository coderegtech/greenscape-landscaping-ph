# Authorization matrix

Source of truth: `packages/database/src/rbac.ts` (seeded into Postgres by `pnpm db:seed`). The Express API checks permissions on every protected route (`requirePermission` in `apps/api/src/middleware/auth.ts`); the admin menu and pages are filtered by the same permissions, but the UI is never the control. Permissions are loaded from Postgres per request (Redis-cached ≤ 60 s, invalidated immediately when changed through the API). Nothing role-related is read from the token or the browser.

**†** = staff permission: with `REQUIRE_STAFF_MFA` (on everywhere except business-logic test suites) it exists only in a multi-factor (aal2) session. A password-only session keeps the unmarked self-service permissions and gets `403 MFA_REQUIRED` on staff routes.

The table below is generated from the RBAC catalogue (`npx tsx` over `ROLES` and `expandGrants`), so it matches what the API enforces.

| Permission | super admin | admin | content manager | ecommerce manager | inventory staff | hr manager | employee | customer |
|---|---|---|---|---|---|---|---|---|
| `admin.access` † | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |  |  |
| `users.read` † | ✓ | ✓ |  |  |  |  |  |  |
| `users.manage` † | ✓ | ✓ |  |  |  |  |  |  |
| `roles.manage` † | ✓ | ✓ |  |  |  |  |  |  |
| `roles.manage_super` † | ✓ |  |  |  |  |  |  |  |
| `settings.read` † | ✓ | ✓ |  |  |  |  |  |  |
| `settings.manage` † | ✓ | ✓ |  |  |  |  |  |  |
| `settings.secrets` † | ✓ |  |  |  |  |  |  |  |
| `audit.read` † | ✓ | ✓ |  |  |  |  |  |  |
| `cms.read` † | ✓ | ✓ | ✓ |  |  |  |  |  |
| `cms.write` † | ✓ | ✓ | ✓ |  |  |  |  |  |
| `cms.publish` † | ✓ | ✓ | ✓ |  |  |  |  |  |
| `media.read` † | ✓ | ✓ | ✓ | ✓ |  |  |  |  |
| `media.write` † | ✓ | ✓ | ✓ | ✓ |  |  |  |  |
| `testimonials.moderate` † | ✓ | ✓ | ✓ |  |  |  |  |  |
| `products.read` † | ✓ | ✓ |  | ✓ | ✓ |  |  |  |
| `products.write` † | ✓ | ✓ |  | ✓ |  |  |  |  |
| `inventory.read` † | ✓ | ✓ |  | ✓ | ✓ |  |  |  |
| `inventory.adjust` † | ✓ | ✓ |  | ✓ | ✓ |  |  |  |
| `orders.read` † | ✓ | ✓ |  | ✓ | ✓ |  |  |  |
| `orders.manage` † | ✓ | ✓ |  | ✓ |  |  |  |  |
| `orders.fulfill` † | ✓ | ✓ |  | ✓ | ✓ |  |  |  |
| `payments.refund` † | ✓ | ✓ |  | ✓ |  |  |  |  |
| `customers.read` † | ✓ | ✓ |  | ✓ |  |  |  |  |
| `reports.sales` † | ✓ | ✓ |  | ✓ |  |  |  |  |
| `quotations.read` † | ✓ | ✓ | ✓ | ✓ |  |  |  |  |
| `quotations.manage` † | ✓ | ✓ |  | ✓ |  |  |  |  |
| `messages.read` † | ✓ | ✓ | ✓ | ✓ |  |  |  |  |
| `messages.reply` † | ✓ | ✓ | ✓ | ✓ |  |  |  |  |
| `employees.read` † | ✓ | ✓ |  |  |  | ✓ |  |  |
| `employees.manage` † | ✓ | ✓ |  |  |  | ✓ |  |  |
| `attendance.read` † | ✓ | ✓ |  |  |  | ✓ |  |  |
| `attendance.manage` † | ✓ | ✓ |  |  |  | ✓ |  |  |
| `attendance.approve` † | ✓ | ✓ |  |  |  | ✓ |  |  |
| `leave.read` † | ✓ | ✓ |  |  |  | ✓ |  |  |
| `leave.approve` † | ✓ | ✓ |  |  |  | ✓ |  |  |
| `reports.attendance` † | ✓ | ✓ |  |  |  | ✓ |  |  |
| `profile.self` | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| `orders.self` | ✓ | ✓ |  |  |  |  |  | ✓ |
| `quotations.self` | ✓ | ✓ |  |  |  |  |  | ✓ |
| `attendance.self` | ✓ | ✓ |  |  |  |  | ✓ |  |
| `leave.self` | ✓ | ✓ |  |  |  |  | ✓ |  |

The brief's "Attendance Manager" is `hr_manager` (HR / Attendance Manager). The brief's example permissions exist as named, except `inventory.manage`, which is `inventory.adjust` here. Orders are split three ways: `orders.manage` (status, cancel), `orders.fulfill` (preparing → delivered) and `payments.refund` (refunds).

## Object-level rules (enforced in the API, tested)
| Resource | Rule | Where | Test |
|---|---|---|---|
| Orders | A customer sees an order only if it is theirs (user id, or guest order with their email) or with the order's link key (stored as a hash; wrong key and missing order both answer 404) | `shop/routes.ts` `/orders/:number`, `/orders/mine` | integration `shop.test.ts` "order visible only to its owner or the link key" |
| Carts | Found by the signed-in user, or a guest token stored as sha256; prices never taken from the client | `shop/cart.ts` | `shop.test.ts` "prices come from the server" |
| Quotations | Customers list only `/quotations/mine`; staff need `quotations.read`; attachments via 5-minute signed URLs | `quotations/routes.ts` | `quotations.test.ts`, e2e quote flow |
| Conversations | A customer reads and writes only their own thread (by user id); staff need `messages.read` / `messages.reply` | `admin/routes.ts` | `admin.test.ts` chat |
| Attendance | Employees read and punch only their own records (`Employee.userId` = caller); HR roles see everyone; **nobody approves or edits their own day, correction or leave** | `attendance/routes.ts`, `admin-routes.ts` | `attendance.test.ts` |
| Users and roles | `roles.manage`; touching `super_admin` needs `roles.manage_super`; nobody changes their own roles or status; role list validated against the catalogue | `users/routes.ts` | `auth.test.ts`, e2e permission matrix |
| Product prices, stock | `products.write` / `inventory.adjust` only; all changes audited | `shop/admin-routes.ts` | `shop.test.ts` "customers get 403 on shop admin" |
| CMS | `cms.write` drafts, `cms.publish` live; drafts never served publicly | `cms-admin/routes.ts` | `cms.test.ts` |

## Scope limitation (accepted, needs owner sign-off): M-7
HR roles are organisation-wide; there is no team-lead role limited to direct reports. If one is wanted, the design is:
- a `team_lead` role with `attendance.read`, `attendance.approve` and `leave.read`/`leave.approve`;
- every HR query filtered to `Employee.managerId = caller's employee id` when the caller holds no organisation-wide HR role;
- tests for each list, detail and decision endpoint.

## Verification
- e2e `permissions.spec.ts`: for each of the 8 roles, the menu equals the permission set, allowed pages open and others redirect.
- Integration tests: every staff router answers 403 to a customer token.
- `mfa.test.ts`: an aal1 staff session gets 403 `MFA_REQUIRED` and keeps self-service; an aal2 session gets staff permissions.
