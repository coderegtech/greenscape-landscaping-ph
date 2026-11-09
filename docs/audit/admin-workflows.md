# Admin Workflows (current system)

> **Verification level: INFERRED, NOT VERIFIED.** No admin credentials were available and no login was attempted.
> Everything below comes from the admin HTML/JS that the server delivers to any visitor at `/admin/*` (read as text, not executed against data).
> Behaviour, permissions and data volumes must be confirmed with a read-only walkthrough (decision D4).

## Access model

- `/admin/` → `auth-guard.js` → Firebase Auth (Google popup) → reads Firestore `settings/adminAccess.emails[]`; if the user's email is in the list they are an admin. Fallback when the doc is missing or the read fails: a single hard-coded Gmail address.
- No roles. Every admin can do everything, including editing the admin list (`settings` module "Remove admin access for {email}").
- The `employees` module has an extra client-side **"Protected Page" / Unlock** screen (a second secret typed in the browser). Client-side only.

## Modules found (each is `/admin/{module}/` with its own JS)

| Module | Firestore | Observed UI | Actions |
|---|---|---|---|
| Dashboard | `analytics/visitors`, `analytics/chartData`, `quotations`, `conversations`, `notes`, `versionNotes`, `adminUsers`, `settings/siteVersion` | Visit stats (Total / Today / Week / Month), Chart.js "Site Visits", Recent Messages, Recent Quotations, Changelog, notes | View, jump to messages/quotations |
| Quotations | `quotations`, `settings/emailNotifications` | Table: Name, Email, Phone, Service, Preferred Date, Submitted Date, Status, Actions. Filter: all / pending / contacted / completed | Change status, mark read, delete, manage notification recipient emails |
| Messages | `conversations/{id}/messages` | Inbox list (user photo, name, last message, unread count) + thread with date separators | Reply, delete conversation |
| Products | `products` + Storage `products/` | Grid with category filter + search + counts | Create/edit/delete; fields: name, scientificName, nativeName, category, plantType, price, originalPrice, sizes[], colors[], dimension, wateringFrequency, careInstructions, payment (free text), description, isNew/isFeatured/isBestSeller, images (≤ 5 MB, image/* only, also by URL); unsaved-changes guard |
| Projects | `projects` + Storage | Cards; categories Residential Garden, Commercial Landscaping, Indoor Landscaping, Landscape Rehabilitation, Vertical Garden | CRUD, drag-and-drop multi-image upload, isFeatured |
| Gallery | `gallery` + Storage | Photo grid; categories Garden Maintenance, Garden Projects, Landscape Design, Outdoor Spaces, Plant Collection, Water Features | Upload, delete, filter |
| Stories | `stories`, `employees` (author picker) + Storage | List | CRUD, thumbnail, YouTube embed (`extractYoutubeId`) |
| Testimonials | `testimonials` | Pending / approved list with rating | Approve, reject (= delete), delete |
| Services | `services/{name}` + Storage `services/{service}/` | Tabs per service (Garden Design, Garden Essential, Landscaping, Garden Maintenance) | Edit details, upload/delete images |
| Hero | `settings/hero` + Storage `hero-images/` | Live preview of headline "Green today, greener tomorrow" | Edit text, upload/delete slide images |
| Settings | `settings/adminAccess`, `settings/emailNotifications`, `settings/siteSettings`, `settings/cacheVersion` | Admin emails, notification recipients, site settings, cache version history | Add/remove admins, toggle notifications, **bump cache version / "hard reset"** (forces visitors to re-download assets) |
| Employees | `employees`, `timeLogs`, `leaveRequests`, `announcements`, `employeeNotes` + Storage (photos) | Employee list (designations: Admin Staff, Driver, Gardener, Landscaper, Maintenance, Supervisor, Other; status Active/Inactive/On Leave), **Time Records** (morning in/out, afternoon in/out, time-in/out photos, hours calc, date-range filter, batch delete), Leave requests (badge count; PAID / UNPAID / REJECT), Announcements (priority High/Normal/Low, expiry), Employee notes (mark read) | Add/edit/delete employee, add/edit/delete time logs, approve leave as paid/unpaid or reject, post announcements |

Employee form also contains **Work Schedule** (morning + afternoon blocks, flexible schedule flag) and **Salary Details / Default Deductions** (daily rate, food allowance, uniform bond, SSS, PhilHealth, Pag-IBIG). Salary/deduction parts are payroll → out of scope (see `migration-risks.md` R2).

## Not found
- **Employee-side clock-in UI**: `timeLogs` with photos are created somewhere, but no public page was found (20 common paths probed, all 404). Likely a separate app or an unlinked page. *Unverified.*
- Orders, inventory, carts, payments, customer accounts, reports/exports, role management: **do not exist**.

## Public user-facing flows that feed admin
| Flow | Where | Auth | Writes |
|---|---|---|---|
| Get a quote (2-step form) | Home `#quote`, `/pages/get-a-quote/` | none | `quotations` (+ email notification) |
| Share your experience | Home, `/pages/contact/client-feedback.html` | Google sign-in | `testimonials` status `pending` |
| Message Us widget | Every page (bottom nav "Message") | Google sign-in | `conversations/{id}/messages` |
| Like a product | Product cards | Google sign-in | `products/{id}/likes/{uid}` |
| Visitor tracking | Home only | none | `analytics/visitors`, `analytics/chartData` |
