# Migration Plan

Status: **design**. Source access (decision D3 in `implementation-plan.md`) is not yet granted, so nothing has been read from Firestore beyond what the public site renders.

## Source inventory (from public client code + rendered pages)

Firebase project `greenscape-palawan` (Firestore default DB, Firebase Storage bucket `greenscape-palawan.firebasestorage.app`, Firebase Auth with Google sign-in).

| Firestore path | Seen in | Target | Notes |
|---|---|---|---|
| `products` (+ `likes` subcollection) | public `products.js`, admin `products` | Postgres `Product`/`ProductVariant`/`InventoryLevel` + Mongo `productContent` | `price`, `originalPrice` → variant `price`/`compareAtPrice`; `sizes`/`colors` → variants (if no stock data: `trackInventory=false` until counted); `careInstructions`, `wateringFrequency`, `description` → Mongo; `payment` free text → dropped (checkout replaces it). Likes → optional `ProductLike` or dropped (decide) |
| `projects` | `projects.js`, admin `projects` | Mongo `projects` | `category`, `location`, `imageUrls[]`, `isFeatured` |
| `gallery` | admin `gallery` | Mongo `galleryItems` | |
| `stories` | admin `stories` | Mongo `articles` | `author`, `excerpt`, `thumbnailUrl`; body format TBD (likely HTML → convert to rich-text JSON, sanitize) |
| `testimonials` | home page, admin | Mongo `testimonials` | Keep `status` (pending/approved); `userPhoto` URLs are Google avatars → don't copy, store null |
| `services/{name}` | `services.js`, admin | Mongo `services` | images under Storage `services/{service}/…` |
| `settings/hero` | `hero.js`, admin `hero` | Mongo `pages(home).sections[hero]` | images under `hero-images/` |
| `settings/siteSettings`, `settings/emailNotifications` | admin `settings` | Mongo `siteConfig` / env + Postgres settings | |
| `settings/adminAccess` | auth guard | **Not migrated as-is** → seed `UserRole` rows for the listed emails after confirmation | |
| `settings/cacheVersion`, `settings/siteVersion`, `versionNotes`, `notes`, `analytics/*` | admin dashboard | Not migrated (replaced by build versioning, GA/Sentry) | Export to JSON archive |
| `quotations` | home quote form, admin | Postgres `Quotation` | Fields: name, email, phone, service, projectLocation, preferredDate, bestTimeToTalk, status, read, submittedAt |
| `conversations` (+ messages) | admin `messages` | Postgres `Conversation`/`Message` | Requires mapping Firebase UIDs → new users |
| `adminUsers` | admin dashboard | Seed roles only | |
| `employees` | admin `employees` | Postgres `Employee` | **Drop**: `dailyRate`, `foodAllowance`, `uniformBond`, `sss`, `philhealth`, `pagibig` (payroll / gov't IDs, out of scope) |
| `timeLogs` | admin `employees` | Postgres `AttendanceRecord` + `TimePunch` | `morningIn/morningOut/afternoonIn/afternoonOut` → 4 punches per day; `timeInPhoto`/`timeOutPhoto` → only if D6 = keep |
| `leaveRequests` | admin `employees` | Postgres `LeaveRequest` | `leaveType` strings → `LeaveType` rows |
| `announcements`, `employeeNotes` | admin `employees` | `Announcement`; notes → decide | |

## Steps

1. **Freeze & back up**: `gcloud firestore export gs://…` + `gsutil -m cp -r` Storage bucket to an offline archive. Read-only service account. No writes to Firebase at any step.
2. **Extract** to local NDJSON (`scripts/migrate/extract.ts`), one file per collection, with document ids.
3. **Transform** (`transform.ts`): pure functions per collection, Zod-validated output; rejected rows to `rejects/*.ndjson` with reasons. Unit tests per transformer.
4. **Assets**: download each referenced Storage/URL image, hash, upload to Supabase `public-media` (or `employee-private`), write `MediaAsset`, rewrite references to `storagePath`. Report missing/404 assets.
5. **Load** into a fresh staging DB (idempotent upserts keyed on `legacyId`).
6. **Users**: create Supabase users for staff + customers who have orders/quotes/conversations (email only, `email_confirm=true` only for verified Google emails). Firebase password hashes are not needed — current login is Google-only, so users re-link via Google OAuth on first login.
7. **Reconcile**: counts per collection (source vs loaded vs rejected), field-level spot checks on 5 % sample, asset checksum match, every legacy URL → 200 or 301.
8. **Dry runs**: at least two full runs on staging before cutover.
9. **Cutover**: put the Firebase admin into read-only (announce), final delta extract (by `createdAt`/`updatedAt` > last run), load, switch DNS, keep Firebase Hosting serving for 14 days behind a redirect.
10. **Rollback**: DNS back to Firebase Hosting (unchanged), new system data that arrived after cutover exported for manual replay.

## URL redirects (legacy → new)

| Legacy | New |
|---|---|
| `/index.html` | `/` |
| `/pages/about-greenscape/` | `/about` |
| `/pages/our-story/`, `/pages/our-story/index.html` | `/stories` |
| `/pages/our-story/story.html?id={firestoreId}` | `/stories/{slug}` (lookup by `legacy.firestoreId`) |
| `/pages/gallery.html` | `/gallery` |
| `/pages/services/{garden-design,garden-essential,landscaping,garden-maintenance}/index.html` | `/services/{garden-design,garden-essentials,landscaping,garden-maintenance}` |
| `/pages/services/products/index.html?category=X` | `/shop?category=X` |
| `/pages/services/products/…?id=…` (product detail) | `/shop/{slug}` |
| `/pages/projects/{residential-garden,commercial-landscaping,indoor-landscaping,landscape-rehabilitation}.html` | `/projects?category=…` |
| `/pages/contact/`, `/pages/contact/faq.html`, `/pages/contact/client-feedback.html` | `/contact`, `/faq`, `/testimonials#share` |
| `/pages/testimonials.html` | `/testimonials` |
| `/share/story?id={firestoreId}` (OG-tag share page that JS-redirects to the story; used by FB/Twitter share buttons) | `/stories/{slug}` (Next.js renders OG tags natively) |
| `/pages/services/products/product-detail?id={firestoreId}` | `/shop/{slug}` |
| `/pages/` (serves a duplicate of home) | `/` |
| `/pages/get-a-quote/index.html` | `/quote` |
| `/pages/delivery-policy.html`, `/pages/privacy-policy.html` | `/delivery-policy`, `/privacy` |

Full list regenerated from `docs/audit/routes.md` at Phase 11.
