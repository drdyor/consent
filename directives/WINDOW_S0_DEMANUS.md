# WINDOW S0 — De-Manus migration (EXISTENTIAL — run first)

Single controlling document. This product dies on 2026-08-24 unless it is off the Manus
platform. Everything downstream (shop, labs) must be built on the migrated stack, so this is
first. Synthetic data only. Extend the existing 22-test suite; reproduce-before-fix.

## What must move
- **Auth:** Manus OAuth (`_core/context.ts`, `_core/sdk.ts`, `authenticateRequest`) → portable
  auth (Lucia / Auth.js or equivalent open-source), issuing the app's own session/JWT. Preserve
  the existing per-clinic workspace/role model (`requireWorkspace`, admin vs practitioner).
- **Storage:** Forge presigned-S3 (`server/storage.ts`) → direct S3 / self-hostable MinIO
  (aws-sdk is already a dep). Same key layout; same presign contract.
- **Database:** MySQL (`drizzle-orm/mysql2`, `server/db.ts`) → Postgres (`drizzle-orm/
  postgres-js`). Port the 18 migrations; verify the schema round-trips.

## Gates (+ traps, behavioural)
- `no_manus`: repo + build contain no `manus`, `forge`, `OWNER_OPEN`, `authenticateRequest`,
  `mysql2` import. Trap: a planted `manus` import FAILS.
- `auth_portable`: login/session/logout work against the new auth with the existing role model;
  a cross-clinic access attempt is rejected (the existing isolation tests pass on new auth).
- `storage_portable`: upload + presigned-get round-trip against S3/MinIO.
- `db_postgres`: the full suite passes against Postgres (not MySQL); every migration applies.

## Definition of done
Full existing suite green on Postgres + portable auth + S3/MinIO; no Manus markers; committed +
pushed; `reports/WINDOW_S0_REPORT.md`. Update STATE.md → `WINDOW_C1_WITHDRAWAL_NOTARY.md`.
Data export: if the hosted instance holds any non-synthetic data, note it for operator export
(operator-run) — do not migrate real data through the sandbox.
