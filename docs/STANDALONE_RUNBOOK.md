# Standalone Runbook — Aegis Consent with ZERO Manus services

**WINDOW_C4 Stage 3 (2026-08-28).** This runbook boots the app from a clean
clone with **no Manus platform service at all**: local email+password auth,
S3-compatible storage (MinIO), and the in-process scheduler. Manus remains the
**default** provider set — nothing here activates until the operator flips the
`*_PROVIDER` env vars.

## Provider matrix

| Seam | Env var | Default (Manus era) | Standalone value | Extra env when standalone |
|---|---|---|---|---|
| Auth | `AUTH_PROVIDER` | `manus` (OAuth portal) | `local` | — (uses existing `JWT_SECRET`) |
| Storage | `STORAGE_PROVIDER` | `forge` | `s3` | `S3_ENDPOINT`, `S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`, optional `S3_REGION` (default `us-east-1`) |
| Scheduler | `SCHEDULER_PROVIDER` | `manus` (heartbeat) | `internal` | optional `INTERNAL_SCHEDULER_TICK_MS` (default 60000) |
| External cron (optional alternative) | `SCHEDULED_JOBS_SECRET` | unset (disabled) | any strong secret | cron calls `POST /api/scheduled/*` with `Authorization: Bearer <secret>` |

Reversibility: unset the three `*_PROVIDER` vars and the app behaves exactly as
before (Manus OAuth, Forge storage, heartbeat cron). No Manus code was deleted.

## 1. Prerequisites

- Node 20+, pnpm, Docker.
- Clean clone of this repo, branch with migrations up to `0027`.

## 2. Infrastructure

```sh
docker compose -f docker-compose.standalone.yml up -d
# wait for: aegis-standalone-mysql healthy, minio-init prints "bucket aegis ready"
```

## 3. Database provisioning — KNOWN DEFECT + workaround

Fresh-DB provisioning is **broken on main** (QA audit FINDING #2, owned by
WINDOW_C4 Stage 2 / Manus — deliberately NOT fixed on this branch):

- `drizzle-kit migrate` dies at `drizzle/0008_round_solo.sql` (corrupt duplicated
  ALTERs → `ER_PARSE_ERROR 1064`);
- `drizzle-kit push` gets further but fails with `ER_TOO_LONG_IDENT 1059` on the
  >64-char FK name `consentEvidenceFreshnessFlags_consentRecordId_consentRecords_id_fk`
  (from `0023_fast_wildside.sql`).

**Workaround (same one the QA audit used):** `push --force` creates every table
(including `localCredentials` from migration 0027's schema) *before* it aborts on
that FK name. The missing piece is that one FK constraint — the app enforces the
relation in queries, so runtime is unaffected.

```sh
# from the repo root (Git Bash / POSIX shell)
DATABASE_URL="mysql://root:aegis-local@127.0.0.1:33114/aegis" npx drizzle-kit push --force
# EXPECTED: ends with "Error: Too long identifier ... consentEvidenceFreshnessFlags_..."
# verify the tables landed anyway (expect 36 rows):
docker exec aegis-standalone-mysql mysql -uroot -paegis-local aegis -e "SHOW TABLES;"
```

## 4. Boot the server — zero Manus env vars

```sh
DATABASE_URL="mysql://root:aegis-local@127.0.0.1:33114/aegis" \
JWT_SECRET="change-me-standalone-secret" \
AUTH_PROVIDER=local \
STORAGE_PROVIDER=s3 \
SCHEDULER_PROVIDER=internal \
S3_ENDPOINT="http://127.0.0.1:9100" \
S3_BUCKET=aegis \
S3_ACCESS_KEY=aegis-access \
S3_SECRET_KEY=aegis-secret-key \
PORT=3130 NODE_ENV=development npx tsx server/_core/index.ts
```

Note what is **absent**: `OAUTH_SERVER_URL`, `VITE_OAUTH_PORTAL_URL`,
`OWNER_OPEN_ID`, `BUILT_IN_FORGE_API_URL`, `BUILT_IN_FORGE_API_KEY`.

(Production shape: `pnpm build && node dist/index.js` with the same env.)

## 5. First user = admin; register → login

```sh
# register (first account on an empty DB is promoted to admin)
curl -s -c cookies.txt -H "Content-Type: application/json" \
  -d '{"email":"owner@clinic.example","password":"standalone-pass-1","name":"Dr Owner"}' \
  http://127.0.0.1:3130/api/auth/register
# → {"success":true,"user":{...,"role":"admin"}}

# login (session cookie saved to cookies.txt)
curl -s -c cookies.txt -H "Content-Type: application/json" \
  -d '{"email":"owner@clinic.example","password":"standalone-pass-1"}' \
  http://127.0.0.1:3130/api/auth/login

# sanity: which provider is active + who am I
curl -s http://127.0.0.1:3130/api/auth/provider          # {"provider":"local"}
curl -s -b cookies.txt "http://127.0.0.1:3130/api/trpc/auth.me?batch=1&input=%7B%220%22%3A%7B%22json%22%3Anull%7D%7D"
```

In the browser: `http://127.0.0.1:3130/` — unauthenticated visits are routed to
the built-in `/login` page (the server reports `provider=local`); with
`AUTH_PROVIDER=manus` the Manus portal redirect is untouched.

Login attempts are rate-limited (10 failures / 15 min per IP+email → HTTP 429).

## 6. End-to-end consent proof (drawn signature → MinIO)

The scripted version of this walkthrough is
`reports/qa_scripts/standalone_demanus_proof.ts` (synthetic data only):

```sh
DEMANUS_BASE=http://127.0.0.1:3130 npx tsx reports/qa_scripts/standalone_demanus_proof.ts
```

It registers, logs in, imports + activates a starter template, creates a
procedure-only consent, sends it, signs it with a **drawn** signature (PNG →
`storagePut` → presigned PUT → MinIO), fetches the stored signature back through
`/manus-storage/<key>` (307 → MinIO presigned GET), and prints the
`snapshotHash`. Verify the object landed:

```sh
docker exec aegis-standalone-minio mc alias set local http://127.0.0.1:9000 aegis-access aegis-secret-key
docker exec aegis-standalone-minio mc ls --recursive local/aegis
```

## 7. Scheduler proof

- Internal: activate a schedule in the app (e.g. tRPC
  `consent.activateDailyFreshnessSchedule`) — it stores the synthetic taskUid
  `internal:consent-evidence-freshness-clinic-<id>`; the in-process scheduler
  runs the three jobs daily at 05:00/05:15/05:30 UTC (tick = 60 s, drift-guarded,
  once per UTC day). Set `INTERNAL_SCHEDULER_TICK_MS=5000` while testing.
- External cron alternative: set `SCHEDULED_JOBS_SECRET=<secret>` and call:

```sh
curl -s -X POST -H "Authorization: Bearer <secret>" \
  http://127.0.0.1:3130/api/scheduled/consent-evidence-freshness
# → {"ok":true,"mode":"shared-secret","results":[...per activated clinic...]}
```

## 8. Teardown

```sh
docker compose -f docker-compose.standalone.yml down -v
```

## Known limitations (honest list)

- Fresh-DB migration remains broken upstream (FINDING #2) — the `push --force`
  workaround above is the supported path until WINDOW_C4 Stage 2 fixes 0008/0023.
- DB stays MySQL-dialect; Postgres migration is a separate operator decision.
- The sealed-snapshot hash defect (FINDING #1 / Stage 1) is untouched here.
- Internal scheduler state is in-memory: a restart during the 05:xx window may
  re-run that day's scans once (they are idempotent-style scans).
- Local auth has open self-registration; only the FIRST account gets admin.
  Front it with a reverse proxy or disable exposure if that is not acceptable.
