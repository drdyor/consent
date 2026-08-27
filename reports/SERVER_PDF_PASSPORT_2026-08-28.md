# Server-side sealed-consent PDF + consent passport + public verify route

**Date:** 2026-08-28 · **Branch:** `server-pdf-passport-2026-08-28` (worktree `C:\Users\Forre\consent-pdf`, base `5e49ef3`)
**Scope:** QA_PERSONA_AUDIT FINDING #4 (`renderedPdfUrl` never populated; no server-authoritative document) and PROFESSION_FIT persona-A item 9 / benchmark row 10 ("the patient walks out with nothing").
⏱ Reading time: ~7 min.

---

## BUILT

### 1. Server-side sealed-consent PDF (task 1)
- `server/services/consentPdf.ts` — renders the **STORED sealed snapshot JSON** (`consentRecords.signedSnapshot`, never live DB rows) to an A4 PDF with `@cantoo/pdf-lib`: clinic name/address + logo, template sections, disclosures + acknowledgements, product/lot/expiry **or** the procedure-only affirmative statement, practitioner + registration number/authority, drawn-signature PNG (typed shows name+method), treatment-map table, printed `snapshotHash`, notary status + Hedera topic/sequence/tx/consensus when present, withdrawal state on voided records, and a QR (`qrcode`) linking `/verify/<snapshotHash>`. Bilingual PL+EN labels follow the `Records.tsx` jspdf label set (`Pacjent / Patient`, …).
- `server/services/consentArtifacts.ts` — orchestration: loads the record, fetches logo/signature bytes **through the storage seam** (`storageGetSignedUrl` — works on forge AND s3), renders, optionally P12-signs, stores via `storagePut`, and **populates `consentRecords.renderedPdfUrl`**. `tryGenerateSealedConsentPdf` is the best-effort post-sign hook — it can never fail a completed signing (broken storage logs a warning; the record stays signed and the PDF is generated lazily on first download).
- Hook wired into BOTH sign paths in `server/routers/consents.ts` (`consent.sign` and `consent.patientSign`); the sign result now carries `renderedPdfUrl`.
- Download: `GET /api/consent-pdf/:recordId/download` (clinic-authenticated, `sdk.authenticateRequest` + `requireWorkspace` scoping; streams fresh bytes or 307-redirects to the stored object; `?regenerate=1` forces a re-render). Buttons on **ReviewConsent** (signed + voided sections) and **Records** rows.
- Optional digital signature: `server/services/pdfSign.ts` — behind `PDF_SIGN_P12_PATH` / `PDF_SIGN_P12_PASSPHRASE` using `@signpdf/signpdf` + `@signpdf/signer-p12` + `@signpdf/placeholder-plain` (byte-level placeholder; PDFs are saved with `useObjectStreams:false` for compatibility). When unset → unsigned-but-hash-printed, result `{signed:false, reason:"not_configured"}`. **Never fakes a signature state** — `signed:true` only when a real PKCS#7 container was embedded; failures return the unsigned bytes with the reason.

### 2. Implant/procedure passport (task 2, benchmark row 10)
- `server/services/consentPassport.ts` — one-page A4 patient take-home per signed consent: what/when/where/who (procedure, area, signed date, clinic, practitioner + registration), product+lot+expiry when present or the plain procedure-only line, snapshot hash, QR to the verify route, and a highlighted withdrawn banner on voided records. Client-facing copy follows house rules: plain language, no idioms, sentences under 15 words, PL/EN by record language.
- Machine-readable `consent-passport.json` (version, hash, verify URL, status, procedure, product/lot/expiry, practitioner, notary reference, withdrawal state) is **attached inside the PDF via pdf-lib `attach()`**.
- Endpoint `GET /api/consent-passport/:recordId/download` (clinic-authenticated) regenerates the passport deterministically on demand — no storage row needed. Download buttons alongside the sealed-PDF buttons.

### 3. Public verify route (task 3)
- `GET /verify/:snapshotHash` in `server/routes/consentArtifactRoutes.ts` (registered from `server/_core/index.ts`, same express pattern as the existing routes). Server-rendered HTML page; `?format=json` (or `Accept: application/json`) returns the facts object.
- `server/services/verifyPublic.ts` builds the facts by **WHITELIST construction** — record exists, status signed/withdrawn, sealed timestamp, snapshot hash, notary state + Hedera ids when present, withdrawal state (`withdrawnAt` + `withdrawalEventHash`). Deliberately excluded: all patient identity, practitioner name (optional-omit → omitted), clinic name/address, **withdrawal reason** (free text can carry PHI), and everything inside the snapshot. Hash param validated against `^[0-9a-f]{40,128}$`; unknown hash → 404; malformed → 400; HTML output escaped.

### 4. Deterministic regeneration (task 4)
- Renderers are pure functions of the snapshot + record facts. Creation/modification dates are pinned to the snapshot's `signedAt` (not generation time), date formatting is UTC-manual (locale-independent), QR bytes are deterministic → **same input produces byte-identical PDFs** (asserted in tests and live). The P12 signature step is the only nondeterministic layer (PKCS#7 embeds signing time), applied after render; hash comparisons in tests run on unsigned bytes.

## VERIFIED

- `pnpm check` — clean.
- `pnpm test` — **44 files / 148 tests pass** (120 pre-existing + 28 new):
  - `consentPdf.test.ts` — renders fixture snapshot (hash, product/lot, registration, notary ids, QR URL, sections, disclosures, map); **procedure-only fixture** renders the affirmative statement and no product; withdrawal state; byte-determinism (equal twice, different on changed snapshot); `winAnsiSafe` transliteration.
  - `consentPassport.test.ts` — what/when/where/who + product facts; **attached JSON parsed back out of the PDF** and field-asserted; procedure-only statement; withdrawn state; determinism.
  - `verifyPublic.test.ts` — whitelist facts asserted with `toEqual` on the whole object; **PHI canaries** (patient names, email, signer, withdrawal reason, clinic name/address, identityHash, practitioner) asserted absent from JSON and HTML; withdrawal state shown; draft/unhashed records → null; hash pattern rejects traversal/markup.
  - `consentArtifactRoutes.test.ts` — express app over **live HTTP** (`app.listen(0)` + fetch): verify JSON/HTML asserted on the FULL response body against canaries; 404 unknown / 400 malformed; sealed-PDF download renders → `storagePut(application/pdf)` → `renderedPdfUrl` persisted → streams `%PDF`; 307 redirect when already stored; passport 200 + deterministic + attachment.
- **LIVE SMOKE (actually run)** — throwaway `aegis-pdfsmoke-mysql` (MySQL 8, :33131) + `aegis-pdfsmoke-minio` (:9130, bucket `aegis`), schema via `drizzle-kit push --force` (36 tables; died at the documented >64-char FK — FINDING #2 reconfirmed, migrations are fenced), server booted `AUTH_PROVIDER=local STORAGE_PROVIDER=s3` on :3132. Driver `reports/qa_scripts/pdf_passport_smoke.ts`:
  - register/login → import `dental-perio-srp` starter → **procedure-only** consent create → send → sign → `snapshotHash 4f363bba…`, **`renderedPdfUrl` populated on sign** (`/manus-storage/consents/1/sealed-consent-4f363bba2237_….pdf`) and persisted on the record.
  - `GET /api/consent-pdf/1/download` → **307 to MinIO presigned GET** → 7,330 bytes, `%PDF` magic. Real S3-seam storage, zero Manus.
  - passport downloaded twice → **byte-identical**, `%PDF`, `consent-passport.json` attached.
  - `GET /verify/<hash>?format=json` → 200 facts (body logged in full); **no PHI canary** (patient name/email/doctor) in JSON or HTML; unknown hash → 404.
  - `consent.withdraw` (reason contained a canary) → verify shows `status:"withdrawn"`, `withdrawnAt`, `withdrawalEventHash`; **reason not leaked**.
  - Teardown: both containers removed, server process killed (verified port down).
- **P12 signing live-proven** (throwaway openssl self-signed P12): `maybeSignPdf` → `signed:true`, `/ByteRange` + `Adobe.PPKLite` present in output; with env unset → `signed:false, reason:"not_configured"` on the same bytes.

## NOT DONE (flagged)

- **@libpdf/core upgrade path** — BANNED this pass (LICENSE unresolved). If it clears review, it could replace the `@cantoo/pdf-lib` + `@signpdf/placeholder-plain` pairing with one library incl. incremental-save signing; the render code is isolated in two pure modules to make that swap cheap.
- **TSA (RFC 3161 timestamp authority)** — not implemented. The P12 signature carries local signing time only; no trusted timestamp, no LTV/PAdES. Upgrade path: `@signpdf` supports external signers; a TSA request would slot into `pdfSign.ts`.
- **Polish diacritics in the PDF glyphs** — standard PDF fonts (WinAnsi) cannot encode ą ć ę ł ń ś ź ż; text is transliterated (`Źródło → Zrodlo`) by `winAnsiSafe()`. Proper rendering needs a Unicode TTF + `@pdf-lib/fontkit` (MIT, but outside this pass's approved list) — one small follow-up.
- **`node-forge` dependency added** — it is the documented required peer of the approved `@signpdf/signer-p12` (unusable without it). Dual-licensed BSD-3-Clause OR GPL-2.0; **BSD-3-Clause elected**. Flagged because it is not literally on the approved three-package list.
- **Passport not persisted to storage** — regenerated deterministically per download (by design; no schema column exists for a second URL). Trivial to persist later if wanted.
- **Verify page shows the notary claim, not a Mirror-Node re-check** — it reports the stored notary state + ids; anyone can recheck them against Hedera Mirror Node. A live Mirror-Node call on a public unauthenticated route was deliberately avoided (SSRF/rate-limit surface). Note: independent recomputation of the hash from the snapshot still hits FINDING #1 (MySQL JSON key reordering) — owned by the fenced seal/canonicalization workstream, not this branch.
- `directives/BACKLOG_CODE_READ_2026-08-28.md` **does not exist in this worktree** — could not be read.

## FILES TOUCHED (fence proof)

`git diff --name-only 5e49ef3..HEAD`:
```
client/src/pages/Records.tsx
client/src/pages/ReviewConsent.tsx
package.json
pnpm-lock.yaml
reports/SERVER_PDF_PASSPORT_2026-08-28.md
reports/qa_scripts/pdf_passport_smoke.ts
server/_core/index.ts            (2-line route registration only)
server/routers/consents.ts       (import + post-sign hook + result field only)
server/routes/consentArtifactRoutes.ts (+ .test.ts)
server/services/consentArtifacts.ts
server/services/consentPassport.ts (+ .test.ts)
server/services/consentPdf.ts (+ .test.ts)
server/services/pdfInspect.ts
server/services/pdfSign.ts
server/services/verifyPublic.ts (+ .test.ts)
```
**FENCED files untouched:** `server/services/consentSnapshot.ts`, `consentNotary.ts` (read-only consumed), `marketCompliance.ts`, lot-expiry logic, membership/join, `drizzle/` migrations 0000–0027 — none appear in the diff. No schema change was needed: `renderedPdfUrl` already existed (finally populated).

## Env vars introduced
- `PUBLIC_APP_URL` — base for the printed/QR verify URL (falls back to `http://localhost:<PORT>`).
- `PDF_SIGN_P12_PATH`, `PDF_SIGN_P12_PASSPHRASE` — optional digital signature.
