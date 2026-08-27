# Aegis Consent — QA Persona Audit (post-Manus viability)

**Date:** 2026-08-27 · **Auditor:** Claude (for Dr Eva) · **Repo:** `C:\Users\Forre\consent`
**Mode:** AUDIT ONLY. No product code was changed. All test data is synthetic, created in a
throwaway `aegis-audit-mysql` Docker container (deleted-on-teardown). Audit-only helper scripts
live in `reports/qa_scripts/` (driver + diagnostics), the only files added.

---

## 0. Boot verdict — CAN IT RUN POST-MANUS?

**YES — the app boots, serves, signs consents, and passes its full suite locally with ZERO
Manus services.** Manus OAuth, Forge, and MySQL/TiDB are all replaceable at the edges; the
consent engine itself is portable and ran end-to-end against a plain MySQL 8 container.

| Check | Result |
|---|---|
| `pnpm install` | ✅ exit 0 |
| `pnpm test` (vitest) | ✅ **33 files / 79 tests pass** — but all DB-mocked (see FINDING #1) |
| `pnpm check` (tsc) | ✅ clean |
| `pnpm build` (vite + esbuild) | ✅ built (dist/index.js 242 kb; client 1.16 MB) |
| Dev server cold boot, **no env vars** | ✅ serves SPA (HTTP 200); logs `OAUTH_SERVER_URL not configured` but does not crash |
| Dev server + MySQL + JWT_SECRET | ✅ full API works |
| Prod build boot (`node dist/index.js`) | ✅ serves (HTTP 200) |
| Frontend alone | ✅ renders login shell, patient-sign page, evidence-boundary copy |

**Minimum to boot the API locally:** `DATABASE_URL` (MySQL), `JWT_SECRET`, and a MySQL server.
Nothing Manus-hosted is required to *run*; it is only required to *log in the normal way* and to
*store uploaded files*. For this audit I bypassed Manus OAuth by minting the app's own HS256
session JWT (the server verifies it with `JWT_SECRET` — `sdk.verifySession`), which is exactly
the seam a portable auth provider plugs into.

### Exact minimal de-Manus surface (file paths + counts)

**AUTH (replace Manus OAuth → OIDC/Auth.js/Lucia) — ~6 files:**
- `server/_core/oauth.ts` — `/api/oauth/callback`, `/api/oauth/start` (Manus code exchange)
- `server/_core/sdk.ts` — `exchangeCodeForToken`, `getUserInfo`, `authenticateRequest`, session JWT mint/verify (the JWT + cookie half is portable and reusable; only the OAuth-server calls are Manus)
- `server/_core/cookies.ts` — session cookie options (portable, keep)
- `server/_core/env.ts` — `OAUTH_SERVER_URL`, `OWNER_OPEN_ID`, `appId` (Manus identity)
- `client/src/const.ts` — `startLogin()` hard-navigates to the Manus OAuth portal (`VITE_OAUTH_PORTAL_URL`)
- `client/src/_core/hooks/useAuth.ts` — client auth hook
- Note: `users.openId` is the Manus identity key threaded everywhere (owner detection: `db.ts` `openId === ENV.ownerOpenId → role admin`).

**STORAGE (replace Forge → S3/MinIO) — 2 files:**
- `server/storage.ts` — Forge presign PUT/GET (`BUILT_IN_FORGE_API_URL/KEY`). Already imports `@aws-sdk/client-s3` + presigner in `package.json`, so the S3 target is half-wired.
- `server/_core/storageProxy.ts` — `/manus-storage/*` 307-redirect proxy
- Consumers: drawn-signature upload (`consents.sign`), supplier evidence downloads (`server/_core/index.ts`), photos.

**DB DIALECT (MySQL → Postgres) — schema + 25 migrations:**
- `drizzle.config.ts` — `dialect: "mysql"`
- `server/db.ts` — `drizzle-orm/mysql2`, `onDuplicateKeyUpdate`, `$returningId()` (MySQL-only idioms)
- `drizzle/schema.ts` — **91 `mysqlTable`/`mysqlEnum` usages**, 34 tables
- `drizzle/*.sql` — **25 migration files** (two are broken on a fresh DB — FINDING #2)
- dep `mysql2`

**SCHEDULER (Manus heartbeat → cron/durable jobs) — 1 core + 2 consumers:**
- `server/_core/heartbeat.ts` — `createHeartbeatJob` (Manus platform cron)
- consumers: `server/routers/consents.ts` (evidence-freshness), `server/routers/supplierOps.ts`
- 4 `/api/scheduled/*` endpoints gated on Manus cron identity (`user.isCron && user.taskUid`)

**BUILD/RUNTIME Manus glue (cosmetic, removable):**
- `vite.config.ts` — `vite-plugin-manus-runtime`, `vitePluginManusDebugCollector`, `allowedHosts: .manus*.computer`
- `package.json` dep `vite-plugin-manus-runtime`, `client/public/__manus__/debug-collector.js`
- `client/src/components/ManusDialog.tsx`
- `index.html` references `%VITE_ANALYTICS_ENDPOINT%/umami` → 400 + MIME console error locally (harmless, see FINDING #8)

The de-Manus plan the repo already carries (`reports/DEMANUS_MIGRATION_PLAN.md`) is accurate and
matches this surface. It is **planning-only and gated at WINDOW_C4** pending Eva's fold/standalone
decision — no migration code has been started (confirmed: schema is still MySQL, `oauth.ts`/
`storage.ts`/`heartbeat.ts` still Manus).

---

## 1. Persona table

Boot succeeded, so personas were run **LIVE** over tRPC against the booted server (MySQL 8),
authenticating each persona with its own app session JWT. Verdicts are runtime-observed unless
marked UNTESTED-STATIC.

| # | Persona | Goal | Verdict | Evidence |
|---|---|---|---|---|
| **P1** | Dr Amira, clinic owner (PL) | create clinic, product, evidence gate, treatment map, sign, verify hash | **WORKS** (with 1 critical caveat) | clinic auto-created on first `workspace.overview`; `createProductSource`→product+source+disclosure; **evidence gate FAILS correctly** pre-approval ("source requires clinic-administrator approval"); `verifyCanonicalSource`→`approveSource`→ gate opens; `addInventoryLot`, `consent.create`, `addMapEntry`, `send`, `sign` all succeed; sign returns `snapshotHash` + `notaryStatus: notary_pending`. **BUT hash is not independently reproducible — FINDING #1.** |
| **P2** | 2nd practitioner, wants same clinic | see/edit P1's consents | **WORKS as designed (isolated)** — and confirms the structural limit | P2's first `workspace.overview` **auto-creates a NEW clinic (id 2)**, not membership in clinic 1. `consent.get(P1 record)` → "Consent record not found"; `consent.list` → 0 rows. One-clinic-per-user is real: **there is no invite/join flow at all** (FINDING #3). Two practitioners cannot share a clinic. |
| **P3** | 2nd clinic, cross-tenant | read clinic A's consents/products | **WORKS (tenant-isolated)** with 1 design note | `consent.get`/`patientHistory`/`audit(recordId)` on clinic-A objects all denied/empty; `deleteMapEntry` on A's entry denied. **Object-level authz is consistently enforced by `AND clinicId = workspace.clinic.id` on every consent/patient/map query.** Design note: `catalog.sources` and `consent.create`'s product lookup are **global, not clinic-scoped** — P3 could see P1's source and create a consent referencing P1's approved product/template ids (FINDING #5). No consent data leaked; but product/template rows are cross-tenant readable/usable. |
| **P4** | Patient (Zofia), own-device signing | invite link, sign on phone, one-use | **WORKS** (this is newer than the handover says) | `createPatientSigningLink`→opaque token (+ `/patient-sign/:token` path); DB stores only SHA-256 `tokenHash`. **Anon** `patientSigningLink` lookup + `patientSign` succeed; **reuse rejected** ("Patient signing link has already been used"). Patient page renders headless with disclosures + acknowledge + sign UI (screenshot `reports/qa_scripts/patient_sign_page.png`). **Handover §2/§4 is stale** — a real `patients` entity AND patient-held signing already exist (WINDOW_C2). No patient *account/portal* to view history or self-withdraw (FINDING #6). |
| **P5** | Medico-legal auditor | independently verify hash + chain; withdrawal; server PDF | **PARTLY BROKEN** | **Withdrawal: WORKS** — `consent.withdraw` flips status→`voided`, writes `withdrawalEventHash`, leaves `snapshotHash` unchanged (`snapshotHashUnchanged: true`); append-only. **Independent hash verify: BROKEN** — recomputing SHA-256 over the stored snapshot JSON does NOT match the stored hash, and the product's own `verifyNotary` returns **`status: "modified"` on an untampered record** (FINDING #1). **Server-side PDF: MISSING** — PDF is client-only (`jspdf`/`html2canvas` in `client/src/pages/Records.tsx`); no server render, `renderedPdfUrl` never populated (FINDING #4). Hedera notary is code-complete but inert without operator creds (FINDING #7). |

---

## 2. Findings — ranked by severity (WORKING / BROKEN / MISSING / UNTESTED)

### 🔴 CRITICAL

**FINDING #1 — BROKEN: the hash-sealed snapshot is NOT independently verifiable; the tamper
alarm fires on clean, untampered data.** This is the product's core court-grade claim.
- The snapshot is hashed in memory *before* DB persistence with insertion-ordered keys
  (`consentSnapshot.ts:37` — `sha256(JSON.stringify(snapshot))`). MySQL's JSON column **reorders
  object keys** on storage. On read-back, `JSON.stringify(stored snapshot)` produces a different
  byte string, so the SHA-256 no longer matches.
- **Live proof:** signed record id 2 → stored `dd7fb55…`; recompute over the API-returned
  snapshot → `9de0fc03…` (no match). Reproduced on every signed record.
- **Worse — the product's own verifier agrees it's "modified":** with a notary reference
  populated, `consent.verifyNotary(recordId:2)` returned
  `{"status":"modified","message":"The stored signed snapshot no longer matches its sealed hash"}`
  for a record that was never altered. Code path: `consentNotary.ts:41`
  `if (calculateSnapshotHash(input.signedSnapshot) !== input.snapshotHash) return "modified"`.
- **Why the 79 green tests miss it:** every snapshot test builds the object in memory and never
  round-trips a real DB (`consentNotary.test.ts`, `consents.integration.test.ts` all mock `getDb`).
  Green-on-mocks hid a defect that appears on the first real persist.
- **Impact:** an auditor cannot reproduce the hash; the notary "certified/modified" verdict is
  unreliable against persisted data; the immutability proof is "by convention" only, exactly the
  weakness the handover's idea #1 hoped to *fix*, but it is worse than assumed — the existing
  verify is actively wrong. **Fix direction (not applied):** canonicalize before hashing
  (stable key sort / deterministic serialization) and hash the exact stored bytes, or store the
  canonical serialized string alongside the hash. Note the Postgres migration will NOT fix this
  (jsonb also reorders); `json` type + canonical serialization is required.

### 🟠 HIGH

**FINDING #2 — BROKEN: fresh-database provisioning fails; neither `drizzle-kit migrate` nor
`drizzle-kit push` completes cleanly.**
- `drizzle-kit migrate` aborts on `drizzle/0008_round_solo.sql`: the two `ALTER TABLE
  productSources ADD …` statements are **duplicated after the `--> statement-breakpoint` with no
  separator**, producing `ER_PARSE_ERROR 1064`. The migration journal cannot advance past 0008.
- `drizzle-kit push --force` gets further but fails on `ER_TOO_LONG_IDENT 1059`: FK name
  `consentEvidenceFreshnessFlags_consentRecordId_consentRecords_id_fk` (and siblings in
  `0023_fast_wildside.sql`) **exceed MySQL's 64-char identifier limit**.
- I created the 34-table schema via `push` (tables landed before the FK error) to run the audit.
- **Impact:** a clean self-host / new-tenant provision is broken today. The existing hosted
  instance works only because it was migrated incrementally on Manus. Must be fixed as part of any
  de-Manus / standalone path.

**FINDING #3 — MISSING: no way to add a second practitioner to a clinic (no invite/join).**
- `workspace.ts` only ever `insert(clinicMembers)` for the *owner* during `ensureWorkspace`.
  There is no invite, no join, no "add member" mutation anywhere (`grep insert(clinicMembers)` →
  1 hit, the self-provision). Every new user silently gets their own brand-new clinic.
- **Impact:** the product cannot model a real multi-practitioner clinic — the primary B2B unit.
  Handover's "one-clinic-per-user" is confirmed and is a hard product ceiling, not a config issue.

### 🟡 MEDIUM

**FINDING #4 — MISSING: no server-side PDF of the signed consent.** PDF generation is
client-only (`jspdf` + `html2canvas` in `client/src/pages/Records.tsx`, `SupplyGovernance.tsx`).
`consentRecords.renderedPdfUrl` exists in schema but is never written. An auditor/regulator has
no server-authoritative document artifact; the "record of consent" is a DB row + a browser-
rendered PDF. (Handover does not claim otherwise, but P5 needs it.)

**FINDING #5 — DESIGN NOTE / LOW-authz-gap: product sources, products, and templates are
globally readable/usable across tenants.** `catalog.sources` and the product/template lookups in
`consent.create` filter by id only, not by `clinicId` (`consents.ts:212` product lookup has no
clinic scope; templates allow `isStarterTemplate OR clinicId=self` for *listing* but `create`
accepts any `templateId`). P3 (clinic B) could enumerate clinic A's source and create a consent
citing clinic A's approved product + template ids. **No consent/patient data leaks** (those are
strictly scoped), but the catalogue layer is effectively a shared global namespace. May be
intentional (shared market catalogue) — flag for Eva: if sources are meant clinic-private, add
`clinicId` scoping; if shared, document it.

**FINDING #6 — MISSING (expected): no patient account/portal.** Patient-held *signing* exists
(P4 WORKS), but a patient cannot log in to view their own consent history or self-initiate
withdrawal. Withdrawal is clinic-initiated only (`consent.withdraw` is `protectedProcedure`).
GDPR "data subject" self-service is absent. Matches handover idea #2/#4 as future work.

**FINDING #7 — WORKING-BUT-INERT: Hedera notarization is code-complete but does nothing without
operator credentials.** Every sign returns `notary_pending` (no `HEDERA_OPERATOR_ID/KEY`).
`verifyNotary` returns `unknown` with no reference. This is honest (it never claims certified
without a real Mirror-Node match) — but note it is **untested against a live ledger** in this
audit (no testnet creds used). UNTESTED-STATIC for the on-ledger path.

### 🟢 LOW / COSMETIC

**FINDING #8 — cosmetic: analytics tag breaks locally.** `client/index.html:20` hard-codes
`src="%VITE_ANALYTICS_ENDPOINT%/umami"`; unset locally → HTTP 400 + a MIME console error on every
page. Harmless to function; noise for QA. Manus-era leftover.

**FINDING #9 — cosmetic: Manus runtime/debug glue still wired.** `vite-plugin-manus-runtime`,
`__manus__/debug-collector.js`, `.manus*.computer` allowedHosts, `ManusDialog.tsx` — all still
present. No runtime harm locally; remove during de-Manus.

**FINDING #10 — WORKING: tenant isolation on the data that matters is solid.** Consents,
patients, treatment-map entries, audit events, inventory, supplier docs are all consistently
scoped by `clinicId` on read AND write (65 `clinicId` predicates in `consents.ts` alone). P2 and
P3 cross-tenant read/edit probes were all correctly denied. This is the strongest part of the app.

---

## 3. Exact commands & errors

```
# install / test / typecheck / build (repo root)
pnpm install                                             # exit 0
pnpm test                                                # 33 files / 79 tests pass (all DB-mocked)
pnpm check                                               # clean
pnpm build                                               # ok; client 1,157 kB, dist/index.js 242 kb

# DB provisioning (FINDING #2)
docker run -d --name aegis-audit-mysql -e MYSQL_ROOT_PASSWORD=audit \
  -e MYSQL_DATABASE=aegis -p 33111:3306 mysql:8
DATABASE_URL="mysql://root:audit@127.0.0.1:33111/aegis" npx drizzle-kit migrate
  → ER_PARSE_ERROR 1064 on drizzle/0008_round_solo.sql (duplicated ALTER after breakpoint)
DATABASE_URL=… npx drizzle-kit push --force
  → ER_TOO_LONG_IDENT 1059: 'consentEvidenceFreshnessFlags_consentRecordId_consentRecords_id_fk'
    (tables 34/34 created before the FK error; used for the audit)

# boot (dev)
PORT=3111 NODE_ENV=development DATABASE_URL=… JWT_SECRET="aegis-audit-secret-2026" \
  VITE_APP_ID="local-audit" npx tsx server/_core/index.ts
  → "Server running on http://localhost:3111/"  (logs OAUTH_SERVER_URL not configured, no crash)
  → GET /  → 200 ;  GET /api/trpc/auth.me → {"result":{"data":{"json":null}}}

# boot (prod build)
PORT=3112 NODE_ENV=production DATABASE_URL=… JWT_SECRET=… node dist/index.js  → 200

# personas — reports/qa_scripts/persona_audit.ts (LIVE over tRPC; app-minted session JWTs)
P1 approveSource (pre-verify)  → ERR "administrator must verify and attest to the canonical … document"  (gate OK)
P1 consent.create (pre-approve)→ ERR "source requires clinic-administrator approval"                     (gate OK)
P1 consent.sign (no acks)      → ERR "Every required … disclosure must be acknowledged before signing"   (gate OK)
P1 consent.sign (with acks)    → OK  snapshotHash=efde41…  notaryStatus=notary_pending
P5 HASH REPRODUCIBILITY        → storedHash efde41…  vs recompute 9ffa64…  matches:FALSE                  (FINDING #1)
consent.verifyNotary(id 2)     → {"status":"modified","message":"stored signed snapshot no longer matches its sealed hash"}  (FINDING #1)
P4 patientSign                 → OK ; P4 reuse → ERR "Patient signing link has already been used"         (one-use OK)
P1 consent.withdraw            → OK status=voided, withdrawalEventHash set, snapshotHashUnchanged=true    (withdrawal OK)
P2 overview                    → new clinic id=2 (auto), sameClinic:false                                 (FINDING #3)
P2 consent.get(P1 rec)         → ERR "Consent record not found" ; consent.list → 0                        (isolation OK)
P3 consent.get(P1 rec)         → ERR "Consent record not found"                                           (isolation OK)
P3 catalog.sources             → seesP1Source: TRUE                                                       (FINDING #5)
P3 consent.create(P1 template) → OK id=9 (cross-tenant catalogue use)                                     (FINDING #5)
```

**Artifacts:** `reports/qa_scripts/persona_audit.ts` (driver), `hash_diag.ts`, `verify_probe.ts`
(diagnostics), `make_signing_link.ts`, `patient_sign_page.png`, `root_unauth_page.png`.

---

## 4. Bottom line

Aegis **survives Manus**: it boots, signs, and passes its suite with no Manus service, and the
de-Manus surface is small and well-understood (auth ~6 files, storage 2, DB dialect + 25
migrations, scheduler 3). Tenant isolation on consent/patient data is genuinely strong.

But two things must be fixed before any "court-grade consent of record" claim is made, and both
are hidden by the all-green mocked suite: **(1)** the signed-snapshot hash is not reproducible
from stored data and the product's own verifier reports untampered records as "modified"
(CRITICAL), and **(2)** a clean database cannot be provisioned (both migrate and push fail).
Fixing #1 is also a prerequisite for the handover's Hedera-notary and evidence-freshness ideas —
anchoring or re-verifying a hash that doesn't reproduce would anchor a value no auditor can
recompute.
