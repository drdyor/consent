# WINDOW C3 Report — Evidence-Freshness Monitoring

**Completed:** 21 August 2026  
**Scope:** Synthetic-data implementation only. The monitor is informational and does not alter authorization, signed snapshots, or clinical/legal source content.

## Delivered behavior

| Control | Implemented behavior |
|---|---|
| **Freshness flags** | `consentEvidenceFreshnessFlags` records when a signed consent’s source later becomes `superseded` or when its recorded product registry state changes after signing. Each consent/flag type is unique, enabling safe scheduled retries. |
| **Immutable signed records** | The recheck reads signed snapshots only to compare historical source/product state. It writes a separate flag and audit event; it never edits `signedSnapshot`, `snapshotHash`, consent status, or authorization. |
| **Administrative queue** | `/evidence-freshness` surfaces open flags with signed and current values, the underlying source, consent navigation, manual recheck, and an administrator acknowledgement action. |
| **Daily execution** | A task-UID-bound daily endpoint at `/api/scheduled/consent-evidence-freshness` looks up its clinic configuration from durable settings, runs deterministically, handles orphan tasks safely, and records `lastRunAt`. |
| **Activation boundary** | The monitor may be run manually now. Daily activation is intentionally available only after the site is deployed, because scheduled calls target the production site. |

> **Informational status:** A later evidence change does not retroactively change the sealed record or automatically invalidate a treatment authorization. It creates a review item for clinic governance.

## Validation

The full suite passed with **33 test files and 79 tests**, followed by a clean TypeScript check. The new behavior tests prove that superseding a source after signing creates a flag without changing snapshot fields, while an unchanged approved source does not create a flag.

## Migrations

`drizzle/0023_fast_wildside.sql` adds the idempotent signed-consent evidence-freshness flag table. `drizzle/0024_clammy_obadiah_stane.sql` adds the clinic schedule configuration that stores the generated task UID and last-run timestamp.
