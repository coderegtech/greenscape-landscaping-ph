# Migration reports

Generated on the **local development environment** (2026-11-10). Each environment produces its own when the runbook in [`../migration-plan.md`](../migration-plan.md) is run there; staging and production reports belong next to their runs.

- `media-report.dry-run.{md,json}`: images checked before copying (source checksums).
- `media-report.{md,json}`: the applied copy (122 images, 34 documents, 0 Firebase links left).
- `asset-check.md`: every image URL the site can show loads; checksums match the dry run.

Private-data import reports are written next to the export folder, outside the repository, because they describe personal data.
