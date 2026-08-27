# FINAL HANDOVER — Manus last window (consent/Aegis), 2026-08-28

You are a fresh instance. This is your single orientation document for the final free-tier
session. Product: Aegis Consent — sealed, evidence-gated, lot-bound clinical consent
(tRPC v11 + React + Drizzle/MySQL). Free tier ends today; after this window you cannot be
reached and the platform data cannot be retrieved.

## Read in this order
1. `directives/WINDOW_C4X_EXIT_HANDOVER.md` — your LAST task, the window's definition of done.
2. `directives/BACKLOG_CODE_READ_2026-08-28.md` — the actionable ledger; §D = your
   merge-coordination notes.
3. `directives/WINDOW_C4_RESTORE_SEAL_DEMANUS.md` Stage 4 — the remediation scope you were
   authorized for (option B, 2026-08-27): seal-hash reproducibility, expired-lot blocking,
   practitioner invite/join, Malta jurisdiction.
4. `reports/QA_PERSONA_AUDIT_2026-08-27.md` + `reports/PROFESSION_FIT_DEMO_2026-08-27.md` —
   the verified findings your fixes answer.

## Execution order for this window
1. Finish the (B) safety-remediation pass on your branch if incomplete — regression tests
   run against a LIVE boot, honest fix-or-flag report, branch pushed.
2. Execute WINDOW_C4X in full (manifests: env, DB dump w/ row counts + sha256, storage
   bytes w/ per-object hashes, scheduler state, identity map; sandbox repatriation sweep).
   Anything existing only in chat or the sandbox counts as NOT delivered.
3. Append the closing line to `directives/STATE.md` per C4X §E8.

## The operator's branches (do NOT rebuild any of this; reconcile only)
All verified by the operator side 2026-08-28; every branch has its own committed report:
- `oss-adoption-2026-08-28` — procedure-only consent (product/lot optional per template),
  starter template library, FDI tooth keys, medical_device category, PLUS de-Manus provider
  seams (AUTH/STORAGE/SCHEDULER env-gated; **Manus remains the default provider** — your
  runtime is unaffected). Report: `reports/OSS_ADOPTION_2026-08-28.md`,
  `reports/DEMANUS_SEAMS_2026-08-28.md`.
- `signing-ux-2026-08-28` — signature_pad, blank-signature seal bug FIXED, patient-signing-
  link UI + QR, ceremony audit events. `reports/SIGNING_UX_2026-08-28.md`.
- `server-pdf-passport-2026-08-28` — server-side sealed-consent PDF, patient passport,
  public non-PHI `/verify/<snapshotHash>`. `reports/SERVER_PDF_PASSPORT_2026-08-28.md`.
- `surveyjs-forms-2026-08-28` — opt-in render engine, sealed snapshots proven byte-identical
  across engines. `reports/SURVEYJS_ADOPTION_2026-08-28.md`.
- `shop-foundation-2026-08-28` — WINDOW_S1 + S2A, gates trap-proven live; fixes the
  migration-journal defect. `reports/WINDOW_S1_REPORT.md`.

## Hard coordination rules
- **Expired-lot blocking must treat NULL expiry as "procedure-only, no check"** (backlog D1)
  — the operator branches make product/lot optional per template.
- **Migration numbering (backlog D4):** three branches each carry a different `0027`.
  Do NOT renumber or merge them — that is operator-side work post-window. Just avoid
  minting 0027/0028 yourself; if you need a migration, start at `0040_` to be collision-free.
- Your prior branch `aegis-malta-dental-ops-2026-08-27` is DO-NOT-MERGE (destructive).
  Do not build on it; do not delete it.
- Signing/sealing ownership per ruling D1: Clinic's engine signs; Aegis is the governance
  hub. Odontogram/implant passport/chart/radiograph are Clinic-owned — not your scope.
- Nothing you produce counts unless committed and pushed. Honest "did not reach" beats
  shallow passes. Status readbacks in place of executed steps are a protocol violation.
