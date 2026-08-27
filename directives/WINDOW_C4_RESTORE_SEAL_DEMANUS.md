# WINDOW C4 — Restore the branch, fix the seal, de-Manus via the proven playbook

This is your single controlling document for the drdyor/consent repo. Read first:
`reports/QA_PERSONA_AUDIT_2026-08-27.md` (independent live audit of this repo),
`HANDOVER_CLINIC_CLINICAL_COMPLETENESS_2026-08-27.md` (the Clinic boundary), and
`reports/DEMANUS_MIGRATION_PLAN.md`. Any earlier instruction that conflicts is SUPERSEDED,
including anything on branch `aegis-malta-dental-ops-2026-08-27`. An honest "did not reach
stage N" beats shallow passes at everything. Execution-mode rule: status readbacks in place
of executed steps are a protocol violation; ambiguity → literal reading + note in report +
continue; stop only at ⛔.

## What the independent audit established (2026-08-27, live against a booted instance)

- The app runs WITHOUT Manus today (own JWT seam, plain MySQL 8, zero platform services).
- **CRITICAL #1:** the sealed-snapshot hash is computed on in-memory key order; MySQL JSON
  reorders keys, so recomputation never matches — `verifyNotary` returned `"modified"` on a
  CLEAN record. Every court-grade claim is void until this is fixed. The mocked test suite
  (79 green tests) cannot see it.
- **#2:** fresh-DB provisioning is broken: migration `0008_round_solo.sql` is corrupt
  (duplicated ALTERs → ER_PARSE_ERROR) and `0023` FK names exceed 64 chars (ER_TOO_LONG_IDENT).
- Patient entity + one-use patient-device signing EXIST and WORK (reuse correctly rejected).
- Tenant isolation on consent/patient/audit data held under live cross-tenant probes.

## Hard boundaries (violations = build failures)

- **Scope (per the Clinic handover, amended by operator ruling D1):** Aegis is the governance/
  operations hub — sources, education registry, consent templates/packages as CONTENT,
  product/lot/expiry, kits, receipts, group buying. Aegis does NOT sign consents for Clinic:
  consent signing/sealing/withdrawal for the clinic product lives in drdyor/clinic (its
  WINDOW_15 engine). Aegis's own signing stack is RETAINED and fixed (it may serve Aegis as a
  standalone product later) but is not wired into the Clinic contract.
- Never delete or edit controlling documents, handovers, reports, or tests to make work
  disappear. Deletions of working features require an operator line in this file. Audits
  annotate, never delete.
- Committed migrations are append-only: never rewrite a migration that exists on main.
  New schema work = new migration files.
- No patient-facing clinical content, no symptom/medication inspection, no risk scores,
  no referrals (the Clinic handover's exclusion list applies verbatim).
- Platform gate: no NEW Manus/Forge coupling; the de-Manus stage removes the existing one.

## Stage 0 — Repair the branch (before any new feature)

The branch `aegis-malta-dental-ops-2026-08-27` deleted, relative to main: all handovers,
IDEAS.md, the entire `directives/` set, `PatientSign.tsx`, `PatientHistory.tsx`,
`EvidenceFreshness.tsx`, the notary/withdrawal/freshness/clinicIntegration integration tests,
the de-Manus plan/runbook — and rewrote migrations 0021–0024. Do NOT merge it as-is.

1. Create `integration/aegis-ops-2026-08-27` from `origin/main`.
2. Cherry-pick/port the branch's ADDITIVE work onto it: the governance module (reviewer
   roster, education-resource registry), Malta ops controls, consent-attachment provenance.
   Re-express its schema changes as NEW migrations on top of main's 0021–0025 (never replace).
3. Restore/keep everything the branch deleted. If the branch's UI removed pages because
   "signing moved to Clinic", the pages and their tests still stay (operator ruling: Aegis
   retains its own signing stack); removal is a future operator decision, not yours.
4. Run the FULL suite + typecheck + build on the integration branch. Report the diff summary:
   files added/modified, ZERO deletions of the protected classes above.
⛔ STOP after Stage 0's report is pushed — the operator merges to main, not you.

## Stage 1 — The seal (CRITICAL #1)

- Canonical serialization before hashing (stable key order, e.g. RFC 8785-style JCS or an
  explicit stable stringify), used identically at seal time and verify time; store the exact
  canonical byte payload (or enough to reproduce it) alongside the hash.
- Migration/backfill: recompute-and-mark for existing records — a record sealed under the old
  method gets `seal_version=1` and verifies under the v1 rule; new records `seal_version=2`.
  Never silently re-hash history.
- Tests must run against a REAL MySQL (containerized), not mocks — the audit proved mocks
  cannot see this class of bug. Trap: tamper one stored snapshot byte → verify MUST say
  modified; verify a clean record → MUST say intact. Both recorded.

## Stage 2 — Fresh-DB provisioning (#2)

Fix `0008` (corrupt SQL) and `0023` (>64-char FK names) so `drizzle-kit migrate` provisions an
empty MySQL 8 from zero. Gate: a clean-room provision (empty container → migrate → boot →
smoke) runs in CI-fashion via `npm run audit`. This is also the restore-drill for the
recovery archive: document the exact restore commands in `RESTORE_INSTRUCTIONS.md`.

## Stage 3 — De-Manus (copy the proven playbook)

Execute `reports/DEMANUS_MIGRATION_PLAN.md`, implemented by ADAPTING the already-delivered
playbook in the DMCA repo's `directives/WINDOW_01_DEPLATFORM.md` (same stack, proven with a
production-container proof): D1 local email+password auth (argon2id + existing JWT cookie
seam, bootstrap admin from env, signup off), D3 Forge→S3-compatible presign (SDK already in
package.json), D4 SMTP notifications fail-safe, D5 cron via bearer secret, D6 Dockerfile +
DEPLOY.md, D7 strip manus vite plugins. DB stays MySQL-compatible this window (dialect
migration is a separate operator decision). Audit gates copied from that playbook: `platform`
marker grep over source AND dist, `ghost_build` from a clean archive. Traps: a planted
`manus` import and a planted OAUTH_SERVER_URL reference must FAIL.

## Stage 4 — Integrity gaps from the profession-fit demo (reports/PROFESSION_FIT_DEMO_2026-08-27.md)

Live-proven on current main; all four are integrity-class, not polish:
1. **Expired-lot gate.** A consent was sealed and SIGNED against a lot expired 2025 with zero
   warning. Fail-closed: expired lot blocks sealing; near-expiry warns. Trap: the demo's exact
   case must FAIL post-fix.
2. **Practitioner attribution.** No invite/join exists; a second professional's login silently
   creates a new clinic, so real clinics share one login and every snapshot seals the WRONG
   practitioner identity. Build invite/join with member roles; the sealed snapshot records the
   authenticated individual who obtained consent.
3. **Product-less consents.** `consent.create` hard-requires productId+lot+expiry, making
   procedure-only consents (perio SRP, hygiene) impossible. Add a procedure-only consent type
   with the same seal/withdraw discipline; product binding stays mandatory for device/injectable
   types.
4. **Jurisdiction: Malta.** MT does not exist; an honest MT source was rejected until relabelled
   "EU" — the gate is forcing dishonest labels. Add mt/uk_gb-style jurisdiction rows; a market
   the gate doesn't know must say "jurisdiction not yet governed", never coerce a relabel.

## Cross-repo contract (mirror of the Clinic side)

Commit the byte-identical literal fixture `shared/fixtures/aegis_consent_package.v1.json`
(same file lives in drdyor/clinic). The package API's contract test validates against the
fixture. Contract changes bump the version and update BOTH repos' fixtures same-day.
Aegis serves: baseline-releases metadata, education deliveries, consent packages (content),
passport artifacts, kit events, receipts — exactly the P1/P2 surface of the Clinic handover,
with opaque public IDs (never internal integers).

## Report discipline & definition of done

Per stage: `reports/WINDOW_C4_STAGE_N.md` — built, audit/test run IDs, PASS/FAIL, NOT-done
stated plainly; every FAIL fixed same-stage or in OPEN DEFECTS with cause. Chat-only
deliverables count as NOT delivered — commit them under `reports/` first. Done = suite +
audit green against real MySQL (with trap proof) + pushed to the integration branch (Stage 0)
or main (later stages, after the operator's Stage-0 merge) + exact operator re-verify
commands in the final report.

## NOT in scope / operator-owned

Merging Stage 0 to main; retiring any UI page; the MySQL→Postgres dialect decision; hosting,
domains, pricing, entities; consent WORDING (counsel); anything patient-facing; selling
Aegis standalone; deleting the old Manus-era files (annotate, never delete).
