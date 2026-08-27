# OSS "actually helps" scan — verdicts + build routing (2026-08-28)

Method: three parallel code-read sweeps (commerce/infra · clinical · documents/trust).
Rule enforced throughout: **no repo ranked "helps" without its code read**; every license
from the LICENSE file in a shallow clone (GitHub API lied 4 times: pdfmake, OpenSign,
Medusa, OSPOS). Full agent reports in session transcripts; clones in session scratchpad.
⏱ ~6 min.

## BUILT TONIGHT (already on branches, from these verdicts)
| Item | Source repo (license) | Branch |
|---|---|---|
| Odontogram (32-FDI) | ZoliQua react-advanced-odontogram (MIT) | vitalis oss-adoption |
| Symptom→drug data rebuild | openFDA API (CC0) | vitalis oss-adoption |
| Signature capture + blank-sig bug + signing-link UI | signature_pad (MIT) + documenso ceremony PATTERN (AGPL — zero code) | consent signing-ux |
| Server sealed-PDF + consent passport + /verify | @cantoo/pdf-lib, @signpdf, qrcode (all MIT, file-verified) | consent server-pdf-passport |
| Radiograph imaging module | @cornerstonejs/core+tools 5.8.x (MIT; webLoader example copy-and-own) | vitalis imaging |
| Forms engine (opt-in) | survey-core/survey-react-ui (MIT; Creator BANNED-commercial) | consent surveyjs-forms |
| Shop S1 (+S2A) | patterns only: OpenBoxes lot model (EPL), Medusa order-action ledger (MIT), Vendure state machines (GPL-dual ⚠) | consent shop-foundation |

## ADOPT — QUEUED (not tonight, with reasons)
1. **better-auth + drizzle-adapter (MIT, mysql-native)** — replaces the whole ~6-file Manus
   OAuth surface behind the D2 seam. Queued: the seam's local scrypt provider was live-proven
   tonight; swapping auth twice in one night = merge noise. First post-merge upgrade.
   (Minimal-diff fallback: panva/openid-client inside sdk.ts.)
2. **A2 audit-chain fix with RFC6962 discipline** — transparency-dev/merkle (Apache, port
   ~100 lines w/ 0x00/0x01 domain separation) + OpenZeppelin merkle-tree `core.ts` (MIT,
   swap SHA-256 leaves) for sealable manifest roots. Queued: touches ~30 audit insert sites
   — too wide while 5 branches + the Manus B-pass are open. FIRST item after merge.
   Reference impl: vitalis backend/audit_chain.py.
3. **croner (MIT, zero-dep)** — cleaner replacement for the seams' interval scheduler. Post-merge.
4. **node-microinvoice (MIT, PDFKit, offline)** — S2 invoice PDFs; routed to the shop
   builder as approved if it reaches S2A.
5. **@medplum/fhirtypes (Apache, zero-runtime devDep)** + **@aehrc/sdc-template-extract**
   (Apache, React-19-ready family) — FHIR typing + QR→resource extraction; next clinic window.
6. **SageRx load-SQL patterns (Apache)** for the W20 RxNorm spine; **wardle/dmd design**
   (EPL, pattern) for the dm+d OGL ingester.
7. **dcmjs anonymizer (MIT)** for GDPR-safe DICOM export — when DICOM stage arrives.
8. **c2pa-node (MIT)** — shelf until photo-notary UX is scheduled.
9. **@libpdf/core** — npm says MIT but GitHub LICENSE file 404s; upgrade path for PAdES
   B-T/TSA signing ONLY after its LICENSE file resolves.

## REJECTED / NO-HELP (recorded so they're not re-litigated)
- **AGPL — never a dependency, never copy code:** documenso, docuseal, OpenSign, ever-gauzy,
  easy-invoice-pdf, LibreSign. (Pattern reading allowed, zero code crossing.)
- **GPL/BSL — patterns only:** OpenEMR, dwv, Vendure (GPL-dual — benchmark corrected),
  DentalPin (BSL).
- **No license = unusable:** jSignature, OHDSI Usagi, DDInter wrappers (MIT code around
  NC data — data poisons them).
- **Dead/deprecated:** lucia (deprecated by author), fhir.js, apexo (dormant), pdf-lib
  original (use @cantoo fork), opentimestamps-js (LGPL + stale + hours-latency — wrong
  shape for patient-present sealing).
- **Whole-platform absorption traps (license fine, architecture no):** OHIF (embed
  extensions' wiring patterns only), Medplum server, Medusa engine (no batch/expiry at
  all — verified by grep; our lot model is ahead), immudb, gotenberg.
- **THIRD independent confirmation: no adoptable OSS DDI engine exists** — every candidate
  wraps NC data or dead APIs. The hand-curated pair table (W20) is the moat. Same for
  e-consent: the field is 2018 relics; sealed consent remains ours alone.

## Corrections to earlier docs
- OSS_BENCHMARK v2: Vendure must not be cited as adoptable (GPL-dual). OSPOS license is
  NOASSERTION at the API — file-verify before S1 cites it again.
