# Migration Plan

Status (Phase 11):
- **Public content: migrated.** Pages, services, projects, stories, gallery, FAQ and approved feedback (Phase 6), the product catalogue (Phase 8), and now **every image**: the 122 photos the content still loaded from Firebase Storage are in Supabase Storage, and all references point there (`pnpm media:migrate`, reports in [`docs/migration/`](migration/)). `pnpm assets:check`: 301 image URLs, **0 not loading, 0 Firebase links left**, 122/122 checksums equal to the dry run.
- **Private data: tooling ready, not run.** Users, quotation history, chats, employees, time logs, leave, unapproved feedback and announcements need an authorised read-only export (D3), which this project does not have. The extractor, importer and their dry-run report are built and tested against a synthetic export; run them with the owner using the runbook below.

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

## Runbook (Phase 11 tooling)

### A. Images (public; safe to run any time, idempotent)
1. `pnpm media:migrate` (dry run): downloads each referenced image from Firebase Storage (read only), verifies it is an image, records its SHA-256, writes `docs/migration/media-report.md`. Nothing changes. Keep a copy as `media-report.dry-run.{md,json}`.
2. `pnpm media:migrate --apply`: re-encodes to WebP (≤ 2000 px), uploads to `public-media/cms/legacy/`, records each in the media library with its source URL and checksum, rewrites references in live content, drafts and saved versions (adding width, height and blur placeholders), clears caches and asks the website to refresh.
3. `pnpm assets:check`: every image URL the site can show must return 200, no Firebase links may remain, and copied checksums must equal the dry run. Exits non-zero otherwise; result in `docs/migration/asset-check.md`.
4. After the production run passes, remove the Firebase entry from `images.remotePatterns` in `apps/web/next.config.ts`.

### B. Private data (needs the owner's authorised access, D3)
1. Owner signs in with an account that has read access: `gcloud auth login`.
2. Extract to a folder **outside the repository** (the script refuses an in-repo path): `node scripts/migrate/extract-firestore.mjs --out ../greenscape-export --token "$(gcloud auth print-access-token)"`. GET requests only.
3. Users: `firebase auth:export ../greenscape-export/auth-users.json --format=json --project greenscape-palawan`.
4. Dry run: `pnpm data:import --dir ../greenscape-export`. Read `import-report.md` in that folder: counts per collection (in file / valid / would create / already here / rejected), SHA-256 of each file, rejected records with reasons, fields not copied (names and counts only, never values), and the **mappings to confirm** (quotation and leave statuses, service names, employee status). Change `MAPPINGS` in `scripts/migrate/lib/transform.ts` if the business disagrees, then dry-run again.
5. Apply on staging first: `pnpm data:import --dir ../greenscape-export --apply`. Re-running skips everything already imported (legacy ids), so a final delta run after freezing the old admin is safe.
6. Afterwards: set allowances for any leave types the import created (0 days), assign schedules, grant staff roles in Users & roles (the old admin list is **not** turned into roles automatically), then delete the export folder.

What the importer does not copy: pay, allowance and government-ID fields (D5), clock-in photos (D6), avatars and emails on feedback, password hashes (the old site used Google sign-in only; people sign in with Google or use "Forgot password"), analytics, notes and version notes.
