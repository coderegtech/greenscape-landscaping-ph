# Database Schema Design

Status: **design** (Phase 2). Becomes `packages/database/prisma/schema.prisma` and `packages/content/src/schemas/*` in Phase 3.

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

```prisma
generator client { provider = "prisma-client-js" }
datasource db { provider = "postgresql"; url = env("DATABASE_URL") }

// ───────────── Identity & access ─────────────
model User {
  id            String    @id @default(uuid())
  authUserId    String    @unique            // Supabase auth.users.id
  email         String    @unique
  displayName   String?
  avatarPath    String?                      // Supabase Storage path
  status        UserStatus @default(ACTIVE)
  roles         UserRole[]
  customer      Customer?
  employee      Employee?
  auditLogs     AuditLog[] @relation("actor")
  createdAt     DateTime  @default(now())
  updatedAt     DateTime  @updatedAt
  lastLoginAt   DateTime?
}
enum UserStatus { ACTIVE SUSPENDED DELETED }

model Role {
  id          String  @id @default(uuid())
  key         String  @unique   // super_admin, admin, content_manager, ecommerce_manager, inventory_staff, hr_manager, employee, customer
  name        String
  isSystem    Boolean @default(false)
  permissions RolePermission[]
  users       UserRole[]
}
model Permission {
  id    String @id @default(uuid())
  key   String @unique          // e.g. "orders.refund", "cms.publish", "attendance.approve"
  description String?
  roles RolePermission[]
}
model RolePermission {
  roleId       String
  permissionId String
  role       Role       @relation(fields: [roleId], references: [id], onDelete: Cascade)
  permission Permission @relation(fields: [permissionId], references: [id], onDelete: Cascade)
  @@id([roleId, permissionId])
}
model UserRole {
  userId String
  roleId String
  grantedBy String?
  grantedAt DateTime @default(now())
  user User @relation(fields: [userId], references: [id], onDelete: Cascade)
  role Role @relation(fields: [roleId], references: [id], onDelete: Restrict)
  @@id([userId, roleId])
}

model AuditLog {
  id         String   @id @default(uuid())
  actorId    String?
  actor      User?    @relation("actor", fields: [actorId], references: [id])
  action     String              // "order.refund", "attendance.correction.approve"
  entityType String
  entityId   String
  before     Json?
  after      Json?
  ip         String?
  userAgent  String?
  createdAt  DateTime @default(now())
  @@index([entityType, entityId])
  @@index([actorId, createdAt])
}

// ───────────── Customers ─────────────
model Customer {
  id        String   @id @default(uuid())
  userId    String?  @unique          // null = guest checkout
  user      User?    @relation(fields: [userId], references: [id])
  email     String
  name      String
  phone     String?
  addresses Address[]
  carts     Cart[]
  orders    Order[]
  quotations Quotation[]
  marketingConsent Boolean @default(false)
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt
  @@index([email])
}
model Address {
  id         String  @id @default(uuid())
  customerId String
  customer   Customer @relation(fields: [customerId], references: [id], onDelete: Cascade)
  label      String?
  recipient  String
  phone      String
  line1      String
  line2      String?
  barangay   String?
  city       String
  province   String
  postalCode String?
  isDefault  Boolean @default(false)
}

// ───────────── Catalog & inventory ─────────────
model Category {
  id        String   @id @default(uuid())
  slug      String   @unique
  name      String
  parentId  String?
  parent    Category?  @relation("tree", fields: [parentId], references: [id])
  children  Category[] @relation("tree")
  sortOrder Int      @default(0)
  products  Product[]
}
model Product {
  id          String   @id @default(uuid())
  slug        String   @unique
  name        String
  scientificName String?
  nativeName  String?
  plantType   String?
  categoryId  String
  category    Category @relation(fields: [categoryId], references: [id])
  status      ProductStatus @default(DRAFT)
  isFeatured  Boolean  @default(false)
  isNew       Boolean  @default(false)
  isBestSeller Boolean @default(false)
  variants    ProductVariant[]
  images      ProductImage[]
  legacyId    String?  @unique          // Firestore doc id, for migration + redirects
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  @@index([status, isFeatured])
  @@index([categoryId, status])
}
enum ProductStatus { DRAFT ACTIVE HIDDEN ARCHIVED }

model ProductVariant {
  id            String  @id @default(uuid())
  productId     String
  product       Product @relation(fields: [productId], references: [id], onDelete: Cascade)
  sku           String  @unique
  name          String                    // "3 gal pot / 1.2 m"
  attributes    Json                      // { size: "...", color: "..." }
  price         Decimal @db.Decimal(12, 2)
  compareAtPrice Decimal? @db.Decimal(12, 2)
  isActive      Boolean @default(true)
  trackInventory Boolean @default(true)
  inventory     InventoryLevel?
  movements     StockMovement[]
  orderItems    OrderItem[]
  cartItems     CartItem[]
  @@index([productId])
}
model ProductImage {
  id        String  @id @default(uuid())
  productId String
  product   Product @relation(fields: [productId], references: [id], onDelete: Cascade)
  mediaId   String
  media     MediaAsset @relation(fields: [mediaId], references: [id])
  alt       String?
  sortOrder Int @default(0)
}
model InventoryLevel {
  variantId   String  @id
  variant     ProductVariant @relation(fields: [variantId], references: [id], onDelete: Cascade)
  onHand      Int     @default(0)
  reserved    Int     @default(0)       // held by pending checkouts
  lowStockAt  Int     @default(5)
  version     Int     @default(0)       // optimistic lock
  updatedAt   DateTime @updatedAt
  // CHECK (on_hand >= 0 AND reserved >= 0 AND reserved <= on_hand)  -- raw SQL migration
}
model StockMovement {
  id         String  @id @default(uuid())
  variantId  String
  variant    ProductVariant @relation(fields: [variantId], references: [id])
  type       StockMovementType
  quantity   Int                         // signed
  reason     String?
  orderId    String?
  actorId    String?
  createdAt  DateTime @default(now())
  @@index([variantId, createdAt])
}
enum StockMovementType { RECEIVE ADJUST SALE RESERVE RELEASE RETURN DAMAGE }

// ───────────── Cart, orders, payments ─────────────
model Cart {
  id         String  @id @default(uuid())
  customerId String?
  customer   Customer? @relation(fields: [customerId], references: [id])
  anonToken  String?  @unique             // httpOnly cookie for guests
  items      CartItem[]
  status     CartStatus @default(OPEN)
  expiresAt  DateTime
  updatedAt  DateTime @updatedAt
}
enum CartStatus { OPEN CONVERTED ABANDONED }
model CartItem {
  id        String @id @default(uuid())
  cartId    String
  cart      Cart   @relation(fields: [cartId], references: [id], onDelete: Cascade)
  variantId String
  variant   ProductVariant @relation(fields: [variantId], references: [id])
  quantity  Int
  @@unique([cartId, variantId])
}

model Order {
  id            String  @id @default(uuid())
  number        String  @unique            // GS-2026-000123
  customerId    String
  customer      Customer @relation(fields: [customerId], references: [id])
  status        OrderStatus @default(PENDING_PAYMENT)
  fulfillment   FulfillmentStatus @default(UNFULFILLED)
  currency      String  @default("PHP")
  subtotal      Decimal @db.Decimal(12, 2)
  deliveryFee   Decimal @db.Decimal(12, 2)
  discount      Decimal @db.Decimal(12, 2) @default(0)
  total         Decimal @db.Decimal(12, 2)
  shippingAddress Json                      // snapshot, not FK
  notes         String?
  items         OrderItem[]
  payments      Payment[]
  events        OrderEvent[]
  idempotencyKey String? @unique           // client-supplied on checkout
  placedAt      DateTime @default(now())
  updatedAt     DateTime @updatedAt
  @@index([customerId, placedAt])
  @@index([status, placedAt])
}
enum OrderStatus { PENDING_PAYMENT PAID CANCELLED REFUNDED PARTIALLY_REFUNDED COMPLETED }
enum FulfillmentStatus { UNFULFILLED PREPARING OUT_FOR_DELIVERY DELIVERED RETURNED }
model OrderItem {
  id         String @id @default(uuid())
  orderId    String
  order      Order  @relation(fields: [orderId], references: [id], onDelete: Cascade)
  variantId  String
  variant    ProductVariant @relation(fields: [variantId], references: [id])
  sku        String                       // snapshots
  name       String
  unitPrice  Decimal @db.Decimal(12, 2)
  quantity   Int
  lineTotal  Decimal @db.Decimal(12, 2)
}
model OrderEvent {
  id        String @id @default(uuid())
  orderId   String
  order     Order  @relation(fields: [orderId], references: [id], onDelete: Cascade)
  type      String                        // status_changed, note, shipped, cancel_requested
  data      Json?
  actorId   String?
  createdAt DateTime @default(now())
}
model Payment {
  id            String @id @default(uuid())
  orderId       String
  order         Order  @relation(fields: [orderId], references: [id])
  provider      String                    // "stripe_test", "mock"
  providerRef   String                    // checkout session / payment intent id
  status        PaymentStatus @default(PENDING)
  amount        Decimal @db.Decimal(12, 2)
  currency      String
  isTest        Boolean @default(true)
  refunds       Refund[]
  rawLast       Json?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
  @@unique([provider, providerRef])
}
enum PaymentStatus { PENDING REQUIRES_ACTION SUCCEEDED FAILED CANCELLED REFUNDED PARTIALLY_REFUNDED }
model Refund {
  id          String @id @default(uuid())
  paymentId   String
  payment     Payment @relation(fields: [paymentId], references: [id])
  providerRef String? @unique
  amount      Decimal @db.Decimal(12, 2)
  reason      String?
  status      String
  actorId     String
  createdAt   DateTime @default(now())
}
model WebhookEvent {                      // idempotency for provider webhooks
  id          String @id                 // provider event id
  provider    String
  type        String
  processedAt DateTime?
  error       String?
  payload     Json
  receivedAt  DateTime @default(now())
}

// ───────────── Quotations & messages ─────────────
model Quotation {
  id            String @id @default(uuid())
  number        String @unique            // Q-2026-000045
  customerId    String?
  customer      Customer? @relation(fields: [customerId], references: [id])
  name          String
  email         String
  phone         String
  services      String[]                  // garden-design, landscaping, ...
  projectLocation String?
  preferredDate DateTime?
  bestTimeToTalk String?
  budgetRange   String?
  details       String
  status        QuotationStatus @default(NEW)
  assignedToId  String?
  attachments   QuotationAttachment[]
  notes         QuotationNote[]
  legacyId      String? @unique
  submittedAt   DateTime @default(now())
  updatedAt     DateTime @updatedAt
  @@index([status, submittedAt])
}
enum QuotationStatus { NEW CONTACTED SITE_VISIT QUOTED WON LOST ARCHIVED }
model QuotationAttachment { id String @id @default(uuid()); quotationId String; quotation Quotation @relation(fields: [quotationId], references: [id], onDelete: Cascade); mediaId String; media MediaAsset @relation(fields: [mediaId], references: [id]) }
model QuotationNote { id String @id @default(uuid()); quotationId String; quotation Quotation @relation(fields: [quotationId], references: [id], onDelete: Cascade); authorId String; body String; createdAt DateTime @default(now()) }

model Conversation {                      // replaces Firestore `conversations` (site chat)
  id            String @id @default(uuid())
  customerUserId String
  status        String @default("open")
  lastMessageAt DateTime?
  unreadForStaff Int @default(0)
  messages      Message[]
  legacyId      String? @unique
  @@index([lastMessageAt])
}
model Message { id String @id @default(uuid()); conversationId String; conversation Conversation @relation(fields: [conversationId], references: [id], onDelete: Cascade); senderUserId String; body String; createdAt DateTime @default(now()); readAt DateTime? }

model ContactInquiry { id String @id @default(uuid()); name String; email String; phone String?; subject String?; body String; status String @default("new"); createdAt DateTime @default(now()) }

// ───────────── Media metadata ─────────────
model MediaAsset {
  id          String @id @default(uuid())
  bucket      String                       // public-media | private-docs | employee-private
  path        String
  mimeType    String
  sizeBytes   Int
  width       Int?
  height      Int?
  alt         String?
  checksum    String?
  uploadedById String?
  refCount    Int @default(0)              // maintained by CMS/product writes; 0 + age > 7d = orphan
  createdAt   DateTime @default(now())
  productImages ProductImage[]
  quotationAttachments QuotationAttachment[]
  @@unique([bucket, path])
}

// ───────────── Workforce (attendance only — NO payroll fields) ─────────────
model Department { id String @id @default(uuid()); name String @unique; employees Employee[] }
model Employee {
  id            String @id @default(uuid())
  userId        String? @unique
  user          User?   @relation(fields: [userId], references: [id])
  employeeNo    String  @unique
  firstName     String
  lastName      String
  email         String?
  mobile        String?
  position      String?
  departmentId  String?
  department    Department? @relation(fields: [departmentId], references: [id])
  employmentStatus EmploymentStatus @default(ACTIVE)
  hiredOn       DateTime? @db.Date
  photoMediaId  String?
  managerId     String?
  manager       Employee? @relation("reports", fields: [managerId], references: [id])
  reports       Employee[] @relation("reports")
  scheduleAssignments ScheduleAssignment[]
  attendance    AttendanceRecord[]
  leaveRequests LeaveRequest[]
  leaveBalances LeaveBalance[]
  legacyId      String? @unique
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt
}
enum EmploymentStatus { ACTIVE ON_LEAVE PROBATION RESIGNED TERMINATED }

model WorkSchedule {                       // template, e.g. "Field crew 7–4 split"
  id        String @id @default(uuid())
  name      String
  timezone  String @default("Asia/Manila")
  isFlexible Boolean @default(false)
  graceMinutes Int @default(10)
  shifts    ScheduleShift[]
  assignments ScheduleAssignment[]
}
model ScheduleShift {                      // one row per segment; supports split shifts and overnight
  id         String @id @default(uuid())
  scheduleId String
  schedule   WorkSchedule @relation(fields: [scheduleId], references: [id], onDelete: Cascade)
  weekday    Int                         // 0=Sun..6
  startTime  String                      // "07:00"
  endTime    String                      // "11:00"; endTime < startTime => crosses midnight
  breakMinutes Int @default(0)
}
model ScheduleAssignment { id String @id @default(uuid()); employeeId String; employee Employee @relation(fields: [employeeId], references: [id]); scheduleId String; schedule WorkSchedule @relation(fields: [scheduleId], references: [id]); effectiveFrom DateTime @db.Date; effectiveTo DateTime? @db.Date; @@index([employeeId, effectiveFrom]) }

model AttendanceRecord {
  id          String @id @default(uuid())
  employeeId  String
  employee    Employee @relation(fields: [employeeId], references: [id])
  workDate    DateTime @db.Date           // Asia/Manila business date the shift belongs to
  punches     TimePunch[]
  status      AttendanceStatus @default(OPEN)
  lateMinutes      Int @default(0)
  undertimeMinutes Int @default(0)
  overtimeMinutes  Int @default(0)        // recorded, not compensated
  workedMinutes    Int @default(0)
  approvedById String?
  approvedAt  DateTime?
  corrections AttendanceCorrection[]
  @@unique([employeeId, workDate])
  @@index([workDate, status])
}
enum AttendanceStatus { OPEN PRESENT LATE ABSENT ON_LEAVE HOLIDAY INCOMPLETE APPROVED }
model TimePunch {
  id          String @id @default(uuid())
  recordId    String
  record      AttendanceRecord @relation(fields: [recordId], references: [id], onDelete: Cascade)
  type        PunchType                   // IN | OUT
  at          DateTime
  source      String                      // web, kiosk, admin_correction, import
  photoMediaId String?                    // only if photo verification enabled + consented
  lat         Float?                      // only if geolocation enabled + consented
  lng         Float?
  ip          String?
}
enum PunchType { IN OUT }
model AttendanceCorrection { id String @id @default(uuid()); recordId String; record AttendanceRecord @relation(fields: [recordId], references: [id]); requestedById String; reason String; proposed Json; status ApprovalStatus @default(PENDING); decidedById String?; decidedAt DateTime?; createdAt DateTime @default(now()) }

model LeaveType { id String @id @default(uuid()); key String @unique; name String; defaultDaysPerYear Decimal @db.Decimal(5,2); requiresAttachment Boolean @default(false); requests LeaveRequest[]; balances LeaveBalance[] }
model LeaveBalance { id String @id @default(uuid()); employeeId String; employee Employee @relation(fields: [employeeId], references: [id]); leaveTypeId String; leaveType LeaveType @relation(fields: [leaveTypeId], references: [id]); year Int; allotted Decimal @db.Decimal(5,2); used Decimal @db.Decimal(5,2) @default(0); @@unique([employeeId, leaveTypeId, year]) }
model LeaveRequest {
  id          String @id @default(uuid())
  employeeId  String
  employee    Employee @relation(fields: [employeeId], references: [id])
  leaveTypeId String
  leaveType   LeaveType @relation(fields: [leaveTypeId], references: [id])
  startDate   DateTime @db.Date
  endDate     DateTime @db.Date
  halfDay     Boolean @default(false)
  days        Decimal @db.Decimal(5,2)
  reason      String?
  attachmentMediaId String?
  status      ApprovalStatus @default(PENDING)
  decidedById String?
  decidedAt   DateTime?
  decisionNote String?
  legacyId    String? @unique
  createdAt   DateTime @default(now())
  @@index([employeeId, startDate])
  @@index([status])
}
enum ApprovalStatus { PENDING APPROVED REJECTED CANCELLED }

model Holiday { id String @id @default(uuid()); date DateTime @db.Date @unique; name String; type String }   // regular / special (PH)
model Announcement { id String @id @default(uuid()); title String; body String; priority String @default("normal"); expiresAt DateTime?; createdById String; createdAt DateTime @default(now()) }
```

### Concurrency rules
- **Checkout**: one transaction, `SELECT … FOR UPDATE` on `InventoryLevel` rows ordered by `variantId` (deadlock-safe), check `onHand - reserved >= qty`, increment `reserved`, create `Order`+`OrderItem` with server prices, write `StockMovement(RESERVE)`. On payment success → `onHand -= qty, reserved -= qty`, `SALE`. On expiry/failure → `RELEASE`.
- **Webhooks**: insert `WebhookEvent` by provider event id first; unique-violation = already processed → 200.
- **Clock-in**: `@@unique([employeeId, workDate])` + an open-punch check inside a transaction prevents double clock-in.
- **Leave approval**: transaction updates `LeaveRequest.status` and `LeaveBalance.used` together; balance check uses `FOR UPDATE`.

### Excluded on purpose
`dailyRate`, `foodAllowance`, `uniformBond`, `sss`, `philhealth`, `pagibig` exist in the current Firestore `employees` collection. They are payroll / government-ID data and are **not modeled** (see `docs/audit/migration-risks.md`).

---

## 2. MongoDB (CMS)

Every document is validated by a **Zod schema in `packages/content`** (also exported as JSON Schema and installed as a Mongo `$jsonSchema` validator, so bad writes fail at both layers).

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
