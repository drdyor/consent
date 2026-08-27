# ACTIONABLE BACKLOG — full code-read findings, 2026-08-28 (consent/Aegis)

Source: line-by-line code inventory (Claude, 2026-08-28). Fix-or-flag tracked; nothing here
may silently disappear. Benchmark: `docs/OSS_BENCHMARK_SCORED_2026-08-27.md` §5 (v2).
NOTE: Manus B-pass (seal-hash, expired-lot, invite/join, Malta) runs concurrently — items
below are DISJOINT from that scope unless marked.

## A. HARD DEFECTS

- [ ] **A1 — migration 0025 missing from `drizzle/meta/_journal.json`** (journal stops at
  idx 24) → `clinicConsentPackages` table is never created by `db:push`. Register it.
  (Branch `oss-adoption-2026-08-28` added 0026 hand-applied the same way — fix both.)
- [ ] **A2 — audit hash-chain has gaps**: `auditEvents.previousEventHash/eventHash` are
  populated ONLY by the withdrawal path; every other audit insert leaves them NULL. Either
  chain all events (vitalis `audit_chain.py` is the reference implementation) or rename the
  claim. ⚠ Adjacent to Manus seal-hash scope — coordinate at merge, do not edit during B-pass.
- [ ] **A3 — plaintext patient names still on `consentRecords`** alongside the AES-256-GCM
  `patients` entities (`patientFirstName/LastName/Email` columns). Migrate reads to the
  encrypted entity + backfill (`backfillPatientLinks` exists, BACKEND-ONLY) then drop or
  null the plaintext columns.
- [ ] **A4 — patientIdentity dev fallback key**: encryption key derives from `JWT_SECRET`
  with a dev fallback present. Fail-closed on missing secret in production boot.
- [ ] **A5 — fresh-DB provisioning broken** (>64-char FK name kills `db:push` after 34
  tables; 0008 corrupt) — QA FINDING #2, reconfirmed twice. In C4 Stage 4 scope.

## B. BUILT-BUT-UNREACHABLE (cheap wins — wiring only)

- [ ] **B1 — patient-signing links have NO UI issuer** (`createPatientSigningLink` called
  only by qa_scripts) — the patient-device signing feature is invisible in product.
- [ ] **B2 — notary settings BACKEND-ONLY** — a clinic cannot enable Hedera notarisation
  from the UI.
- [ ] **B3 — orphan routes**: `/patients/:id` (cross-consent history) and
  `/evidence-freshness` linked from nowhere — add nav entries.
- [ ] **B4 — registry verification (`verifyProductRegistry`) has no UI caller.**
- [ ] **B5 — clinicIntegration API unexposed** (no external auth surface) — pairs with
  vitalis `aegis_adapter.py` (also routeless). One contract, two dormant halves.
- [ ] **B6 — manual/commercial document-scan triggers BACKEND-ONLY.**

## C. EMPTY SHELLS / CONTENT

- [ ] **C1 — zero seed data**: market catalogue empty at runtime. (Starter templates FIXED
  on branch `oss-adoption-2026-08-28` — importable dental library, DRAFT-gated.)
- [ ] **C2 — W_C5 education ingest ~5% done** (one probe + one held artifact; no harvest,
  no registry table, no change monitor, no NICE trap). Directive queued behind C4.
- [ ] **C3 — dead template code**: `ComponentShowcase.tsx` (1,437 lines), `AIChatBox.tsx`
  (references non-existent `trpc.ai.chat`), `_core/llm.ts` + 4 more unused Manus modules.
  Delete in the de-Manus pass (C4 Stage 3), with backup per house rule.

## D. MERGE-COORDINATION NOTES FOR MANUS (2am window)

- [ ] **D1 — expired-lot blocking must treat NULL expiry as "procedure-only, no check"**
  (branch `oss-adoption-2026-08-28` makes product/lot optional per template).
- [ ] **D2 — branch `oss-adoption-2026-08-28` exists** (procedure-only consent, starter
  library, FDI tooth keys, medical_device category, +11 tests; PLUS de-Manus provider seams
  in progress — env-gated AUTH/STORAGE/SCHEDULER providers, Manus stays default). Merge-
  coordinate; only overlap is a display-only leftJoin in `workspace.ts` recent-records.
- [ ] **D3 — two further operator branches exist, both based on D2's tip:**
  `surveyjs-forms-2026-08-28` (opt-in SurveyJS render engine per template, default off,
  snapshot pipeline untouched) and `shop-foundation-2026-08-28` (WINDOW_S1 seller catalog +
  purchase-in + batch/expiry on the EXISTING supplier/PO/lot tables). If your remediation
  collides with either area, note it and finish your scope — reconciliation is operator-side.

## Standing rule (Eva, 2026-08-28)
**No scoring or comparative claims without reading the code.**
