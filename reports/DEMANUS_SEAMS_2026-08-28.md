# De-Manus Runtime Seams — WINDOW_C4 Stage 3 (2026-08-28)

**Branch:** `oss-adoption-2026-08-28` · **Mission:** make Aegis Consent fully
runnable with ZERO Manus platform services, as REVERSIBLE env-gated providers.
**Manus remains the default for every seam** until the operator flips env vars.
Nothing was deleted; the alternates are additive.

Playbook basis: `directives/WINDOW_C4_RESTORE_SEAL_DEMANUS.md` Stage 3, the
"Exact minimal de-Manus surface" map in `reports/QA_PERSONA_AUDIT_2026-08-27.md`,
and the proven `C:\Users\Forre\DMCA\directives\WINDOW_01_DEPLATFORM.md`
(present and read; D1/D3/D5 decisions transplanted, adapted to this repo's
providers-seam shape).

## What was built

### 1. Provider selection seam (`server/providers/config.ts`)
Read at call time, validated loudly (unknown value throws — no silent fallback):

| Env var | Values | Default |
|---|---|---|
| `AUTH_PROVIDER` | `manus` \| `local` | `manus` |
| `STORAGE_PROVIDER` | `forge` \| `s3` | `forge` |
| `SCHEDULER_PROVIDER` | `manus` \| `internal` | `manus` |
| `SCHEDULED_JOBS_SECRET` | any string | unset (external-cron path disabled) |
| `S3_ENDPOINT / S3_BUCKET / S3_ACCESS_KEY / S3_SECRET_KEY / S3_REGION` | — | used only when `STORAGE_PROVIDER=s3` |
| `INTERNAL_SCHEDULER_TICK_MS` | ms (min 5000) | 60000 |

### 2. Auth seam (`server/providers/localAuth.ts`, migration 0027)
- Email+password, **scrypt** from `node:crypto` (N=16384,r=8,p=1, per-hash salt,
  constant-time compare) — no new dependency.
- New table `localCredentials` (schema + hand-written
  `drizzle/0027_demanus_local_credentials.sql`; FK name 33 chars, follows the
  0025/0026 pattern; migrations 0000–0025 untouched).
- Sessions are the EXISTING app JWT via `sdk.signSession` + the existing cookie
  (`app_session_id`), so `sdk.verifySession`/`authenticateRequest`/tRPC context
  are reused verbatim, per the QA audit's "portable half" finding. Cookie
  degrades `sameSite` none→lax on plain http so browsers keep it locally.
- Stable identity `users.openId = local:<uuid>` (42 chars, fits varchar(64)) —
  nothing downstream of openId changes.
- **First registered user on an empty DB → role admin** (mirrors ownerOpenId
  promotion); later users → `user`.
- Endpoints: `GET /api/auth/provider` (always on), `POST /api/auth/register`,
  `POST /api/auth/login` (both 404 unless `AUTH_PROVIDER=local`).
- Rate limits: login 10 failures / 15 min per IP+email → 429; registration
  20/h per IP.
- Client: `GET /api/auth/provider` probe inside `startLogin()` — `local` routes
  to the new built-in `/login` page (`client/src/pages/Login.tsx`, register +
  sign-in, app design language); `manus` (or probe failure) keeps the exact
  Manus OAuth portal navigation. Manus oauth routes/`sdk` untouched.

### 3. Storage seam (`server/providers/s3Storage.ts`)
- `STORAGE_PROVIDER=s3`: presigned PUT/GET via the **already-present**
  `@aws-sdk/client-s3` + `s3-request-presigner`; `forcePathStyle` whenever a
  custom endpoint is set (MinIO). No new dependency.
- `server/storage.ts` keeps **identical public signatures**
  (`storagePut/storageGet/storageGetSignedUrl`) and keeps returning
  `/manus-storage/{key}` URLs, so every consumer (drawn-signature upload,
  supplier evidence, photos, clinic logo) and every already-stored DB URL works
  unchanged; `storageProxy.ts` 307-redirects those paths to an S3 presigned GET
  when the provider is s3. Forge path byte-for-byte preserved as default.

### 4. Scheduler seam (`server/providers/scheduler.ts` + `internalScheduler.ts`)
- Routers now call `registerScheduledJob(...)` — with provider `manus` it
  delegates to the untouched `createHeartbeatJob`; with `internal` it returns a
  synthetic `taskUid = internal:<job-name>` persisted on the clinic's settings
  row (activation semantics unchanged).
- In-process scheduler: setInterval tick (default 60 s) with a drift guard —
  dueness recomputed from the wall clock every tick, max once per UTC day per
  job; preserves the Manus daily times (05:00 expiry, 05:15 escalations,
  05:30 freshness UTC); invokes the SAME functions the `/api/scheduled/*`
  endpoints call (`runEvidenceExpiryScan`, `runOverdueIncidentDeliveryScan` +
  `runCommercialDocumentScanFollowup`, `runEvidenceFreshnessRecheck`) per
  clinic whose settings row has a non-null `scheduleCronTaskUid`. A failing
  clinic is logged and skipped, never blocks the others.
- External-cron alternative: all three `/api/scheduled/*` endpoints ALSO accept
  `Authorization: Bearer ${SCHEDULED_JOBS_SECRET}` (constant-time compare;
  runs every activated clinic, returns per-clinic results). The Manus cron
  identity path is untouched and still first-class.

### 5. Runnable proof
`docker-compose.standalone.yml` (mysql:8 + MinIO + bucket-init, localhost-bound
ports 33114/9100/9101) and `docs/STANDALONE_RUNBOOK.md` (clean clone → provision
→ boot → register → login → consent → MinIO evidence, plus teardown), including
the **FINDING #2 workaround exactly as the QA audit used it** (`drizzle-kit push
--force`; migrations 0008/0023 deliberately NOT fixed — that is C4 Stage 2 /
Manus territory).

## Verification evidence

**Static:** `pnpm check` clean · `pnpm test` **40 files / 120 tests green**
(was 33/79 pre-branch; +18 new provider tests this window: provider selection ×6,
local auth ×12 incl. wrong-password / rate-limit / first-user-admin, s3 presign
shape ×4, scheduler ×8) · `pnpm build` ok (dist/index.js 285.5 kb).

**Live (executed on this machine, 2026-08-27 ~16:18–16:21 UTC, throwaway
`aegis-standalone-*` containers, synthetic data, torn down after):**

1. `docker compose -f docker-compose.standalone.yml up -d` → mysql healthy,
   `minio-init` printed `Bucket created successfully local/aegis`.
2. Provisioning: `drizzle-kit push --force` ended at the documented pre-existing
   `ER_TOO_LONG_IDENT` on `consentEvidenceFreshnessFlags_consentRecordId_...`
   (FINDING #2 reproduced); **36 tables created including `localCredentials`**
   (verified via `SHOW TABLES` / `DESCRIBE localCredentials`).
3. Server booted with `AUTH_PROVIDER=local STORAGE_PROVIDER=s3
   SCHEDULER_PROVIDER=internal` and **zero Manus env vars** (no
   OAUTH_SERVER_URL / OWNER_OPEN_ID / BUILT_IN_FORGE_*).
4. `reports/qa_scripts/standalone_demanus_proof.ts` output (full log retained):
   - `GET /api/auth/provider` → `{"provider":"local"}`
   - register #1 → `role:"admin"`, openId `local:d2139e8e-…` (**first-user-admin live**)
   - register #2 → `role:"user"`
   - wrong-password hammering → **HTTP 429 on the 11th attempt** (10-failure budget)
   - login → session cookie; tRPC `auth.me` through the EXISTING JWT seam →
     `{openId:"local:d2139e8e-…", role:"admin"}`
   - clinic auto-provisioned (id 1); `dental-perio-srp` imported + activated;
     procedure-only consent created (record 1) → sent → **signed with a DRAWN
     signature**: `snapshotHash
     22b47911b6243a5e60753311ee98616ea983b50d158be538e028efa8f9a06fba`
   - `GET /manus-storage/consents/1/signature_8ea6f0f7.png` → **307** to
     `127.0.0.1:9100` with `X-Amz-Signature` → followed → **200, 70 bytes, PNG
     magic true**
   - MinIO listing: `mc ls --recursive local/aegis` →
     `consents/1/signature_8ea6f0f7.png  70B` (**object physically in MinIO**)
5. `reports/qa_scripts/scheduler_seam_proof.ts`:
   - `consent.activateDailyFreshnessSchedule` →
     `{"taskUid":"internal:consent-evidence-freshness-clinic-1","alreadyActive":false}`
     (no Forge call)
   - `POST /api/scheduled/consent-evidence-freshness` with
     `Authorization: Bearer <SCHEDULED_JOBS_SECRET>` → 200
     `{"ok":true,"mode":"shared-secret","results":[{"clinicId":1,"scanned":0,"flagged":0}]}`
   - wrong secret → rejected (500 via the pre-existing invalid-auth handler
     path — request NOT served; see NOT-DONE #6)
6. Server restart with the schedule activated → internal scheduler log:
   `[InternalScheduler] consent-evidence-freshness clinic=1 ok {"scanned":0,"flagged":0}`
   (**in-process job executed the real function for the activated clinic**).
7. Teardown: `docker compose … down -v` — containers and volumes removed.

## Honest NOT-DONE / limitations

1. **MySQL→Postgres dialect migration** — deliberately out of scope (operator
   decision per the directive).
2. **Migrations 0008/0023 not fixed** (FINDING #2) — C4 Stage 2 / Manus
   territory; runbook documents the `push --force` workaround only.
3. **Seal hash (FINDING #1) untouched** — Stage 1 / Manus B-pass; the
   snapshotHash above is evidence of flow, not of independent verifiability.
4. **Manus remains default everywhere** — no cutover performed; flipping the
   three env vars is the operator's act.
5. **Local auth has open self-registration** (mission asked for register +
   first-user-admin). No email verification / password reset / ALLOW_SIGNUP
   toggle yet — noted in the runbook; front with a proxy if exposure matters.
6. Wrong `SCHEDULED_JOBS_SECRET` yields HTTP 500 (generic) rather than 403,
   because the request falls through to the pre-existing invalid-session
   handler path shared with Manus cron auth; rejecting all non-matching Bearer
   tokens outright would break Bearer-session cron calls. Request is refused
   either way.
7. Internal scheduler day-ledger is in-memory: a restart during/after the 05:xx
   window can re-run that day's scans once (idempotent-style scans; noted in
   runbook). Multi-instance deployments would double-run — single-node tool.
8. Browser walkthrough of the /login page was not screenshotted (flow proven
   over HTTP; page compiles and routes). No UI beyond the login page was added.
9. `client/src/pages/Login.tsx` English-only for now.

## Scope-fence proof (files touched, commits `5d40ada..52f1ab1`)

New: `server/providers/{config,localAuth,s3Storage,scheduler,internalScheduler}.ts`
(+4 test files), `client/src/pages/Login.tsx`, `drizzle/0027_demanus_local_credentials.sql`,
`docker-compose.standalone.yml`, `docs/STANDALONE_RUNBOOK.md`,
`reports/qa_scripts/{standalone_demanus_proof,scheduler_seam_proof}.ts`.

Modified: `server/_core/env.ts` (+6 env lines), `server/_core/index.ts` (local
auth registration, shared-secret branch on 3 scheduled endpoints, scheduler boot
hook), `server/_core/storageProxy.ts` (s3 branch), `server/storage.ts` (s3
branch, signatures unchanged), `server/routers/consents.ts` and
`server/routers/supplierOps.ts` (**import swap + 3 call renames
`createHeartbeatJob`→`registerScheduledJob` only**), `drizzle/schema.ts`
(additive `localCredentials` table), `client/src/const.ts` (provider probe),
`client/src/App.tsx` (+/login route).

**NOT touched (hard fence held):** `server/services/consentSnapshot.ts`,
`consentNotary.ts`, `marketCompliance.ts`, lot-expiry validation, clinic
membership/join logic (`services/workspace.ts`), migrations 0000–0025, all
Manus `_core` files' behavior (`sdk.ts`, `oauth.ts`, `heartbeat.ts` unmodified).

## Operator re-verify commands

```sh
pnpm check && pnpm test && pnpm build
docker compose -f docker-compose.standalone.yml up -d
DATABASE_URL="mysql://root:aegis-local@127.0.0.1:33114/aegis" npx drizzle-kit push --force   # expected ER_TOO_LONG_IDENT tail
# boot per docs/STANDALONE_RUNBOOK.md §4, then:
DEMANUS_BASE=http://127.0.0.1:3130 npx tsx reports/qa_scripts/standalone_demanus_proof.ts
docker exec aegis-standalone-minio sh -c "mc alias set local http://127.0.0.1:9000 aegis-access aegis-secret-key && mc ls --recursive local/aegis"
docker compose -f docker-compose.standalone.yml down -v
```
