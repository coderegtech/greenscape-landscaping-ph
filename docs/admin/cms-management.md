# CMS management

Content and copy live in MongoDB as JSON documents validated by Zod schemas (`packages/content`); media lives in
Supabase Storage. The admin CMS needs `cms.read` / `cms.write` / `cms.publish` (and `media.*` for the library).

## What can be edited

Home page sections and hero, services and service pages, about, articles/stories, projects and the gallery, FAQs,
testimonials (moderation), site settings (company details, navigation menus, footer, CTAs), SEO metadata per document,
CMS-created pages at `/<slug>`, and product marketing copy.

## Workflow

- **Draft, scheduled, published, archived.** Edits always go to the draft; publishing copies the draft to the live
  version, so unpublished edits never leak. Optimistic revisions stop two editors overwriting each other.
- **Version history:** every save, publish and rollback is a snapshot in `pageRevisions`; restore any of them.
- **Scheduled publishing:** a Redis-locked worker publishes due documents every 60 s.
- **Preview:** signed, path-bound 10-minute links open the draft in the real site (Next draft mode).
- **Cache:** publishing invalidates the Redis tags for that content and revalidates the affected Next.js pages, so the
  public site shows the change on the next request with its usual design and animations.
- **JSON export and import** per document.

## Editor

Schema-driven field editor: rich text (Tiptap, limited to what the site renders), image picker with upload, repeatable
groups, a page section builder with reorder, SEO tab, publishing tab, history tab and JSON tab.

## Media library

Signed uploads, magic-byte and decode checks, dimensions and blur placeholders, alt text; delete is refused while any
content uses the file; `pnpm media:sweep` removes orphans.

Tests: `tests/integration/cms-admin.test.ts`, `tests/e2e/cms.spec.ts`.
