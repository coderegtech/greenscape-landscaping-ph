# Greenscape documentation

Start here. Each portal has a guide with screenshots taken from the running application; the architecture, security
and deployment pages explain how it works underneath.

## Overview

| Page | What |
|---|---|
| [System status](overview/system-status.md) | What is built, verified, partial or excluded; stack discrepancies; known limitations |
| [Route coverage](overview/route-coverage.md) | Every route in the three apps, with screenshot, documentation and video scene (generated) |
| [Feature inventory](overview/feature-inventory.md) | Business features by portal and the pages and API behind each |
| [Progress log](progress.md) | Phase-by-phase history and decisions D1–D9 |

## Portals

| Portal | Guide | Pages |
|---|---|---|
| Customer website (`apps/web`, :3000) | [customer/README.md](customer/README.md) | [Home and content pages](customer/site-pages.md) · [Services, projects, gallery](customer/services-projects-gallery.md) · [Shop, cart, checkout](customer/shop.md) · [Sign-in and account](customer/account.md) |
| Employee portal (`apps/employee`, :3002) | [employee/README.md](employee/README.md) | [All portal pages](employee/portal.md) · [Attendance rules](employee/attendance-system.md) |
| Admin console (`apps/admin`, :3001) | [admin/README.md](admin/README.md) | [Sign-in, dashboard, analytics, notifications](admin/console.md) · [Commerce](admin/commerce.md) · [CMS](admin/cms.md) · [HR and attendance](admin/hr.md) · [Users, roles, system](admin/system.md) |

## Architecture

| Page | What |
|---|---|
| [Diagrams](architecture/diagrams.md) | 13 Mermaid diagrams: system, auth flows, data stores, CMS, payments, attendance, realtime, push, PWA, deployment, CI/CD |
| [Architecture](architecture.md) | Design: request flow, auth, storage, caching, payments, API surface |
| [Multi-portal system](architecture/multi-portal-system.md) | Three apps, one API, one identity |
| [Database schema](database-schema.md) · [API](api-documentation.md) | Tables and endpoints (live OpenAPI at `/v1/docs`) |
| [Realtime](realtime/README.md) · [Notifications](notifications.md) | Socket.IO, Web Push, preferences, sounds |
| [Authentication](auth/supabase-authentication.md) · [Google](auth/google-oauth.md) · [Employee provisioning](auth/employee-provisioning.md) · [Roles](auth/role-permissions.md) | Sign-in and permissions |
| [Security](security.md) | Threat model, audits, checklists (folder [security/](security/)) |
| [Deployment](deployment.md) | Dokploy, environment variables, CI/CD, production branch, rollback (folder [deployment/](deployment/)) |
| [Testing](testing.md) | Unit, integration, e2e, visual, smoke |

## Video

[video/README.md](video/README.md): storyboards, narration script, scene manifest and the recording guide.
Recording status is shown there; no video has been published yet.

## Keeping the docs current

| Command | Does |
|---|---|
| `pnpm docs:capture` | Signs in synthetic accounts and screenshots every route at desktop, mobile and full page (needs the local stack running); real people's names, emails and phone numbers are blanked out and a picture that still shows one is refused |
| `pnpm docs:inventory` | Rebuilds [route coverage](overview/route-coverage.md); `--check` fails on undocumented routes or a stale table |
| `pnpm docs:video:prepare` | Regenerates the storyboard, script, shot list and transcript from `video/scenes.json` |
| `pnpm docs:validate` | Links, images and sizes, scene manifest schema, claimed assets, secrets and personal data (runs in CI) |

After a UI change: run `docs:capture` (or `DOCS_ONLY=admin/orders pnpm docs:capture` for one area), look at the new
pictures before committing them, then `docs:inventory` and `docs:validate`.
