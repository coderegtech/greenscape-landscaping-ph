# Incident response

For a small business: one owner who decides, one technical contact who acts. Keep this page printed with the phone numbers filled in.

| Role | Who | Contact |
|---|---|---|
| Incident owner (decides, informs customers and the NPC) | Business owner | _fill in_ |
| Technical lead (contains, fixes, preserves evidence) | Developer / IT contact | _fill in_ |
| Hosting, Supabase, payment provider support | Their support portals | _fill in account ids_ |

## 1. Detect
Signals:
- `security.alert` in the logs or Sentry: repeated refusals from one client.
- A spike in 5xx in Sentry.
- `security.webhook_bad_signature`, `security.relink_refused` or `security.roles_changed` you didn't expect.
- Supabase Auth alerts.
- A customer or staff report.
- An admin `AuditLog` entry nobody recognises.

## 2. Triage (first hour)
1. Write down the time, what was seen and who saw it.
2. Classify the incident:
   - **account takeover**: staff or customer;
   - **data exposure**;
   - **payment anomaly**;
   - **defacement**: CMS;
   - **availability**;
   - **leaked secret**.
3. Decide whether personal data may be affected. If yes, start the 72-hour clock for the National Privacy Commission (RA 10173 and NPC Circular 16-03).

## 3. Contain
| Situation | Do this |
|---|---|
| Staff account compromised | Admin → Users: **Suspend**. The API refuses at once and the identity is banned at Supabase. In Supabase, remove the user's MFA factors and force a password reset. Review the `AuditLog` for that actor. |
| Many accounts or unknown scope | Rotate `INTERNAL_API_KEY`, `REVALIDATE_SECRET` and `PREVIEW_SECRET`; in Supabase, rotate the JWT signing key (this signs everyone out). |
| Leaked secret (see rotation below) | Rotate it now. Then search Gitleaks reports and git history. If it was committed, rotate even if the commit was "removed". |
| Defaced content | CMS → History → restore the previous revision (old revisions are re-validated), or unpublish. Check the audit log for the actor. |
| Payment anomaly | Do **not** change payment rows by hand. Check webhook events and provider records; refund through the admin (audited). Switching the provider off means removing the checkout (contact the developer). |
| Abuse or DoS | Lower `RATE_LIMIT_PER_MIN` or `FORM_RATE_LIMIT_PER_HOUR`; block at the CDN/WAF; Redis keys are per hashed client, so a single key can be cleared. |

## 4. Rotating credentials
| Secret | Steps |
|---|---|
| `SUPABASE_SECRET_KEY` | Supabase → Settings → API keys: create a new secret key, update the API env, restart the API, delete the old key |
| Supabase JWT signing key | Supabase → JWT signing keys: rotate. The API's JWKS cache picks up the new `kid` automatically; all sessions end |
| Database passwords | `ALTER ROLE greenscape_app PASSWORD '…'` (same for migrate), update the env, restart the API |
| Mongo / Redis app passwords | `db.changeUserPassword` / `ACL SETUSER`, update the env, restart |
| Stripe keys and webhook secret | Stripe dashboard: roll the key, update the env, restart; roll the webhook secret, then update |
| `INTERNAL_API_KEY`, `REVALIDATE_SECRET`, `PREVIEW_SECRET`, `MOCK_PAYMENT_SECRET` | Generate (`node -e "console.log(require('crypto').randomBytes(32).toString('base64url'))"`), update api, web and admin together, restart |

## 5. Preserve evidence
- Export the relevant `AuditLog` rows and the security log channel (pino JSON, filtered by `requestId`, `userId` or `client`) before any cleanup.
- Keep Sentry events.
- Don't delete accounts involved; suspend them.

## 6. Recover and learn
- Restore from backup only into a new database, then compare.
- Write a short post-incident note: timeline, cause, fix, and what will catch it next time (a test, an alert, a checklist line).
- Add a regression test for the cause.

## Backups and restore drill (monthly)
1. Take the latest backup (managed point-in-time or `pg_dump -Fc`; MongoDB `mongodump --gzip`).
2. Restore into a scratch environment.
3. Run `pnpm assets:check` and the smoke e2e against it.
4. Record the date and the restore time.

Supabase Storage: enable the provider's backups, or sync buckets to separate storage weekly.

## Log retention and access
- **Application logs**: 30 days.
- **Security channel**: 180 days.
- **`AuditLog` table**: kept for the life of the records it describes (minimum 2 years).
- **Access**: owner and technical lead only. Logs contain user ids and hashed client keys, never passwords, tokens or payment details.
