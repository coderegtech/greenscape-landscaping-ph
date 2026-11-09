# Greenscape Landscaping PH — Platform Rebuild

Rebuild of https://greenscapelandscapingph.com into a public site + shop + CMS + attendance + admin platform.
Branch: `rebuild/platform`. Current phase: **2 (Planning) complete — awaiting decisions D1–D9** in `docs/implementation-plan.md`.

## Read first
| Doc | What |
|---|---|
| `docs/audit/` | What exists today (Playwright crawl, screenshots, a11y, performance, admin inference, risks) |
| `docs/architecture.md` | Target architecture, auth, storage, caching, payments, privacy |
| `docs/database-schema.md` | PostgreSQL (Prisma) + MongoDB (CMS) designs |
| `docs/implementation-plan.md` | Decisions needed, phased roadmap, design-skill plan |
| `docs/migration-plan.md` | Firestore → Postgres/Mongo/Supabase mapping, redirects, rollback |
| `docs/progress.md` | Status log |

## Re-run the audit
```bash
cd scripts/audit && npm install && npx playwright install chromium
node crawl.mjs 80        # crawl + screenshots + axe → docs/audit/raw/crawl.json
node lighthouse.mjs      # Lighthouse baseline → docs/audit/raw/lighthouse.json
node report.mjs          # regenerate routes/performance/accessibility/api-endpoints.md
```
The crawler is read-only: it never submits forms or signs in, and blocks the site's visitor tracker and Google Analytics.
