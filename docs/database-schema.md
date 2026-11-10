# Database Schema Design

Status: PostgreSQL schema **implemented** (Phase 3). MongoDB schemas implemented as Zod in `packages/content/src/schemas.ts`.

Ownership rule: **PostgreSQL is the source of truth for anything with money, stock, identity, permissions, time or approvals.** MongoDB holds editable copy and layout. Redis holds nothing authoritative.

| Data | Store | Why |
|---|---|---|
| Users, roles, permissions, sessions mapping | PostgreSQL (+ Supabase Auth identity) | Relational, enforced on the API |
| Products, variants, SKUs, **prices**, **stock** | PostgreSQL | Transactions, row locks, constraints |
| Product marketing copy, care guides, SEO | MongoDB (`productContent`, keyed by `productId`) | Free-form, editable, translatable |
| Carts, orders, payments, refunds | PostgreSQL | Financial integrity |
| Quotations, inquiries, messages | PostgreSQL | Workflow state + audit |
| Employees, schedules, attendance, leave | PostgreSQL | Approvals, reporting, privacy |
| Pages, sections, nav, footer, FAQs, testimonials, stories, projects, gallery | MongoDB | Flexible JSON, drafts/revisions |
| Images & documents | Supabase Storage; Postgres `MediaAsset` row holds metadata; Mongo docs store the `storagePath` | No duplicated bytes |
| Cached public content, catalog listings | Redis (TTL + explicit invalidation) | Performance only |

---

## 1. PostgreSQL (Prisma)

Conventions: `id` = `uuid` (`@default(uuid())`), `createdAt`/`updatedAt` on every table, money as `Decimal(12,2)` in **PHP** with a `currency` column on orders/payments, soft-delete only where history matters (`deletedAt`), timestamps stored UTC, attendance also stores the `Asia/Manila` business date.

The authoritative schema is [`packages/database/prisma/schema.prisma`](../packages/database/prisma/schema.prisma) (42 tables, migration `20261109121123_init`). Hand-written CHECK constraints (inventory quantities, positive quantities/prices, leave dates, weekday range) are appended to that migration.

Model groups: identity & access (User, Role, Permission, RolePermission, UserRole, AuditLog) · customers (Customer, Address) · catalog & inventory (Category, Product, ProductVariant, ProductImage, InventoryLevel, StockMovement) · commerce (Cart, CartItem, Order, OrderItem, OrderEvent, Payment, Refund, WebhookEvent) · inquiries (Quotation, QuotationAttachment, QuotationNote, Conversation, Message, ContactInquiry) · media (MediaAsset) · workforce (Department, Employee, WorkSchedule, ScheduleShift, ScheduleAssignment, AttendanceRecord, TimePunch, AttendanceCorrection, LeaveType, LeaveBalance, LeaveRequest, Holiday, Announcement).

### Concurrency rules
- **Checkout**: one transaction; per line, ordered by `variantId` (deadlock-safe), a conditional `UPDATE "InventoryLevel" SET reserved = reserved + qty WHERE onHand - reserved >= qty` (0 rows = out of stock, the whole order rolls back), create `Order`+`OrderItem` with server prices, write `StockMovement(RESERVE)`. On payment success → `onHand -= qty, reserved -= qty`, `SALE`. On expiry/failure → `RELEASE`.
- **Webhooks**: insert `WebhookEvent` by provider event id first; unique-violation = already processed → 200.
- **Clock-in**: `@@unique([employeeId, workDate])` + a transaction-scoped advisory lock per employee (`pg_advisory_xact_lock`) and a last-punch check prevent double clock-in. Approval is the `approvedAt`/`approvedById` stamp; `status` always reflects what happened (the `APPROVED` enum value is unused).
- **Leave approval**: transaction updates `LeaveRequest.status` and `LeaveBalance.used` together; balance check uses `FOR UPDATE`.

Phase 8 migration `20261110090000_shop` adds `DeliveryZone` (fee per municipality; CHECK: active ⇒ fee set, fee ≥ 0), `Order.reservationExpiresAt` and `accessKeyHash` (index on status + expiry), `MediaAsset.sourceUrl` (idempotent imports) and a non-negative amounts CHECK on `Order`.

Phase 10 migration `20261111090000_admin` adds `InquiryReply` (staff email replies to contact-form messages), `AppSetting` (small admin-editable settings such as notification recipients; never secrets) and an index on `ContactInquiry(status, createdAt)`.

### Excluded on purpose
`dailyRate`, `foodAllowance`, `uniformBond`, `sss`, `philhealth`, `pagibig` exist in the current Firestore `employees` collection. They are payroll / government-ID data and are **not modeled** (see `docs/audit/migration-risks.md`).

---

## 2. MongoDB (CMS)

Every document is validated by a **Zod schema in `packages/content/src/schemas.ts`** before the API writes it. MongoDB is only written through the API, so there is no second validator in the database. `productContent` is a strict object: unknown keys such as `price` are rejected.

### Collections

| Collection | Key | Purpose |
|---|---|---|
| `pages` | `{ slug, locale, version }` | Page = ordered list of typed sections |
| `pageRevisions` | `{ pageId, revision }` | Immutable snapshots for history + rollback |
| `blocks` | `{ key, locale }` | Reusable blocks (CTA band, contact strip) referenced by pages |
| `templates` | `{ key }` | Section presets for new pages |
| `navigation` | `{ key: "main"\|"footer"\|"mobile", locale }` | Menus |
| `siteConfig` | singleton per locale | Company info, contact, socials, hours, SEO defaults |
| `services` | `{ slug, locale }` | Garden Design, Garden Essentials, Landscaping, Garden Maintenance |
| `projects` | `{ slug, locale }` | Portfolio items, `category` (residential, commercial, indoor, rehabilitation) |
| `galleryItems` | `{ _id }` | Media refs + caption + tags |
| `articles` | `{ slug, locale }` | Stories (rich text as structured JSON, not HTML) |
| `testimonials` | `{ _id }` | Moderated: `pending → approved \| rejected` |
| `faqs` | `{ _id, locale }` | Q&A grouped by topic |
| `productContent` | `{ productId, locale }` | Marketing description, care guide. **No price/stock.** |

### Shared envelope (all publishable docs)
```ts
{
  _id: ObjectId,
  slug: string,
  locale: "en" | "fil",
  status: "draft" | "scheduled" | "published" | "archived",
  publishAt?: Date,            // scheduled publishing (worker flips status + invalidates cache)
  publishedAt?: Date,
  revision: number,            // increments on every save; snapshot copied to *Revisions
  draft?: <BodyType>,          // working copy; `published` is what the site renders
  published?: <BodyType>,
  seo: { title, description, ogImagePath?, canonical?, noindex? },
  updatedBy: string,           // Postgres User.id
  updatedAt: Date,
  legacy?: { firestoreId?: string, url?: string }
}
```
Draft and published live in one doc so preview reads `draft`, the site reads `published`, and publishing is an atomic `$set: { published: "$draft" }`.

### Section union (pages)
```ts
type Section =
  | { type: "hero"; slides: { headline; subheadline?; image: MediaRef; cta?: Cta }[] }
  | { type: "serviceGrid"; heading; serviceSlugs: string[] }
  | { type: "featuredProjects"; heading; projectSlugs?: string[]; limit: number }
  | { type: "featuredProducts"; heading; productIds?: string[]; limit: number } // prices fetched from API
  | { type: "gallery"; heading; itemIds?: string[]; limit: number }
  | { type: "articles"; heading; limit: number }
  | { type: "testimonials"; heading; limit: number }
  | { type: "richText"; body: RichTextNode[] }
  | { type: "stats"; items: { value: number; suffix?: string; label: string }[] }
  | { type: "cta"; blockKey?: string; headline?; body?; cta?: Cta }
  | { type: "faq"; faqIds: string[] }
  | { type: "contact" }
  | { type: "quoteForm" };
type MediaRef = { bucket: "public-media"; path: string; alt: string; width?: number; height?: number; blurDataUrl?: string };
type Cta = { label: string; href: string; variant?: "primary" | "secondary" };
```

### Indexes
`pages: {slug:1, locale:1} unique`, `{status:1, publishAt:1}` (scheduler), `articles: {status:1, publishedAt:-1}`, `testimonials: {status:1, createdAt:-1}`, `productContent: {productId:1, locale:1} unique`, `pageRevisions: {pageId:1, revision:-1}`.

---

## 3. Redis keys

See `docs/architecture.md#caching`. All keys prefixed `gs:{env}:`.
