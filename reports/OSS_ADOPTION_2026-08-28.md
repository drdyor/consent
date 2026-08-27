# OSS Adoption — product-fit fixes 2026-08-28

**Branch:** `oss-adoption-2026-08-28` (worktree `C:\Users\Forre\consent-oss`, base `ff5918e` on main). Not pushed, not merged.
**Scope source:** verified defects in `reports/PROFESSION_FIT_DEMO_2026-08-27.md` and `reports/QA_PERSONA_AUDIT_2026-08-27.md`, strategy in `docs/RESEARCH_OSS_DENTAL_PLATFORM_AND_VERDICT_2026-08-27.md`.
**Boundary:** disjoint from the concurrent Manus remediation (seal-hash canonicalization, expired-lot blocking, practitioner invite/join, Malta jurisdiction). See "Files touched" at the end.
⏱ Reading time: ~6 min.

---

## Fixed

### 1. Procedure-only consent (was: "Aegis structurally cannot express a procedure-only consent")
Commits `3973121` (schema), `5bf861f` (server), `a7d7eca` + `53bf454` (client), `e7510a6` (tests), `9633ce9` (live smoke driver).

- `consentTemplates.requiresProduct` (boolean, **default true** — full back-compat) lets a template declare "no medicinal product or medical device is used".
- `consentRecords.productId / sourceId / lotNumber / expiryDate` are now nullable. Migration `drizzle/0026_oss_adoption_procedure_only.sql` follows the hand-written 0025 pattern and **adds no foreign keys** (so it does not touch the pre-existing >64-char FK-name failure, FINDING #2).
- `consent.create` branches on the template:
  - product-linked template: identical gate chain as before (approval, market gate, language, lot/expiry) with explicit errors when product/lot/expiry are missing;
  - procedure-only template: product/lot/expiry are **refused** if supplied (no fake-lot poisoning), stored as NULL otherwise.
- The sealed snapshot's `product` and `source` slots carry an explicit declaration instead of nulls: `{ procedureOnly: true, statement: "No product or lot applies. This is a procedure-only consent. …" }` (`shared/procedureOnlyConsent.ts`). Only the DATA handed to `buildSignedSnapshot` changed; `server/services/consentSnapshot.ts` and the hash algorithm are untouched.
- Treatment-map, disclosure, and inventory queries are skipped for product-less records; `addMapEntry` states plainly that the map does not apply. Create/review/records/patient-sign/patient-history/PDF all render "No product or lot. Procedure-only consent." (Polish variant included on the review page).
- Latent real-DB bug fixed on the way: `sign`/`patientSign` attempted `INSERT … VALUES ()` when zero disclosures required acknowledgement (impossible before, guaranteed for procedure-only; hidden by DB-mocked tests).

### 2. Starter template library (was: fresh clinic has 0 templates)
Commits `3973121` (content), `5bf861f` (server), `53bf454` (UI), `e7510a6` (tests).

- Five dental templates as CONTENT in `shared/starterTemplateLibrary.ts`: implant placement (product-linked), implant second-stage (product-linked), perio maintenance/SRP (procedure-only), extraction (procedure-only), hygiene recall (procedure-only). Plain language, short sentences, no idioms.
- `catalog.templateLibrary` lists them; `catalog.importTemplateFromLibrary` (admin) copies one into the clinic as a **DRAFT** owned by that clinic (`libraryKey` recorded, duplicate import refused). Nothing is auto-injected anywhere.
- Every import carries the notice: *"Starter draft. A practitioner must review this text. An administrator must activate it before use. It is not legally approved wording."* `consent.create` refuses draft templates; `catalog.activateTemplate` (admin) is the review gate, audit-logged.
- Templates page: "Add a starter template" panel + "Activate after review" action on clinic drafts.

### 3. Dental treatment-map keys (was: tooth 36 pinned to the chin of a cosmetic face)
Commits `3973121` (shared), `a7d7eca` + `53bf454` (client).

- `shared/dentalAreas.ts`: FDI area keys `tooth-11…tooth-48` (permanent dentition, all four quadrants) + `formatTreatmentAreaKey`.
- Create-consent area selector gains a "Dental (FDI tooth numbers)" optgroup (labels like "Tooth 36 — lower left (FDI)") plus an explicit free-text option; free-text `areaKey` keeps working end-to-end (API unchanged).
- Review, patient signing, patient history, and the signed PDF render dental areas as **"Tooth 36 (FDI)"** as labeled text — no face diagram, no odontogram (charting stays Clinic-owned per the D1 ruling). The facial map page refuses procedure-only records with a plain notice and is not offered for them.

### 4. medical_device product category (was: implant filed as "other")
Commits `3973121` (schema), `5bf861f` (server), `53bf454` (UI).

- `medical_device` added to the `products` and `marketCatalogueProducts` category enums, the `createProductSource` and catalogue-filter zod enums, and the UI labels (SourceImportForm: "Medical device (implant, device)"; MarketCatalogue: "Medical devices").
- Category/labels only. The market/evidence gating logic (`marketCompliance.ts`, `productClassification`, UDI/CE/promotion rules) was **not touched** — that is Manus scope.

---

## Verification

| Check | Result |
|---|---|
| `pnpm install` | exit 0 |
| `pnpm check` (tsc) | clean |
| `pnpm test` | **36 files / 90 tests pass** (was 34/81; +2 files, +9 tests) |
| New tests | `procedureOnlyConsent.integration.test.ts` (product-less create stores NULLs; product-linked template still hard-requires product/lot/expiry; sealed snapshot carries the explicit statement; empty-acknowledgements insert never attempted; map refusal) · `templateLibrary.integration.test.ts` (listing, DRAFT import with notice, duplicate guard, activation) |
| **Live smoke** | **DONE** — throwaway `mysql:8` container (port 33113), `drizzle-kit push --force`, `npx tsx server/_core/index.ts` (port 3117), driver `reports/qa_scripts/oss_smoke_procedure_only.ts`, users pre-seeded per the audit's session-JWT seam. Container and server torn down after. |

Live-smoke evidence (all observed over tRPC against real MySQL):
- fresh clinic auto-provisioned; starter library visible; `dental-perio-srp` imported as DRAFT (id 1); duplicate import refused;
- create from DRAFT template refused: *"The selected template is a draft…"*; activation succeeded;
- implant template without product refused: *"…select the product used"*; perio template with smuggled lot refused: *"…no product, lot, or expiry may be attached"*;
- **procedure-only SRP consent for `tooth-36` created (id 1) → sent → signed**, `snapshotHash 670267df…`, `notary_pending`;
- sealed snapshot `product` and `source` slots both read `{ procedureOnly: true, statement: "No product or lot applies. This is a procedure-only consent. …" }`; `record.lotNumber`/`expiryDate` NULL;
- map entry on the procedure-only draft refused; `consent.list` returns the record with `product: null`.

Known reproduction during smoke: fresh-DB `drizzle-kit push` still dies at the pre-existing >64-char FK name `consentEvidenceFreshnessFlags_consentRecordId_consentRecords_id_fk` (QA FINDING #2, Manus/de-Manus scope). All 35 tables including the new columns were created before the failure; migration 0026 adds no FK and cannot fix or worsen this.

---

## NOT done (honest list)

- **Migration 0026 not applied to any live/hosted DB** — it is a file on this branch only; fresh-DB provisioning overall remains broken by the FK-name defect (FINDING #2, not mine to fix).
- **No odontogram / tooth chart** — deliberately out of scope (Clinic-owned per D1); dental areas are labeled keys only.
- **Starter templates are English-only** (`language: "en"`). A Polish clinic defaulting to `pl` will see them only after switching the consent language to English. Polish translations = follow-up content work.
- **Second-stage template is product-linked** (healing abutment is a lot-traceable device); if Eva wants it procedure-only, it is a one-line content change in `shared/starterTemplateLibrary.ts`.
- Deciduous-dentition FDI numbers (51–85), surface/mesial-distal qualifiers: not included.
- Nothing done about: seal-hash reproducibility, expired-lot blocking, invite/join, Malta, implant passport, server PDF, photo storage — all Manus scope or separate work.
- `clinicConsentPackages` (external integration table) still hard-requires productId — untouched; procedure-only applies to the in-app consent flow only.

---

## Commits

| Hash | Subject |
|---|---|
| `3973121` | schema: procedure-only consents, starter-template flags, medical_device category |
| `5bf861f` | server: procedure-only consent path, starter template library import, medical_device category |
| `a7d7eca` | client: render procedure-only consents and FDI dental areas across review, records, history, signing |
| `53bf454` | client: procedure-only create flow, dental FDI area selector, starter-library UI, medical_device category |
| `e7510a6` | tests: procedure-only create/sign regression + template library import/activate; fix empty-acknowledgements insert |
| `9633ce9` | smoke: live procedure-only driver against throwaway MySQL (audit-only script) |

## Files touched (Manus-scope proof)

```
client/src/components/SourceImportForm.tsx      (category label)
client/src/pages/CreateConsent.tsx              (create flow + FDI selector)
client/src/pages/Home.tsx                       (null-product render)
client/src/pages/MarketCatalogue.tsx            (category label/filter)
client/src/pages/PatientHistory.tsx             (null-product render, FDI)
client/src/pages/PatientSign.tsx                (null-product render, FDI)
client/src/pages/Records.tsx                    (null-product render, FDI, PDF line)
client/src/pages/ReviewConsent.tsx              (procedure-only cells, FDI, map link)
client/src/pages/Templates.tsx                  (library panel, activate action)
client/src/pages/TreatmentMap.tsx               (procedure-only guard)
drizzle/0026_oss_adoption_procedure_only.sql    (new, no FKs)
drizzle/schema.ts                               (columns/enums listed above)
reports/qa_scripts/oss_smoke_procedure_only.ts  (audit-only driver)
server/routers/catalog.ts                       (library/activate, category enum)
server/routers/consents.ts                      (create branch, left joins, snapshot data, ack guard)
server/routers/inventory.integration.test.ts    (mock order updated)
server/routers/marketCatalogue.ts               (filter enum only)
server/routers/procedureOnlyConsent.integration.test.ts (new)
server/routers/templateLibrary.integration.test.ts      (new)
server/routers/workspace.ts                     (ONE WORD: recent-records innerJoin→leftJoin; jurisdiction/updateClinic untouched)
shared/dentalAreas.ts                           (new)
shared/procedureOnlyConsent.ts                  (new)
shared/starterTemplateLibrary.ts                (new)
```

**Not touched:** `server/services/consentSnapshot.ts`, `server/services/consentNotary.ts`, `server/services/marketCompliance.ts`, `server/services/workspace.ts` (membership/self-provision), `server/services/treatmentMapSnapshot.ts`, lot-expiry validation (none added, none altered), jurisdiction/market-gating logic, `workspace.updateClinic`, all `_core` auth/storage/heartbeat files, migrations 0000–0025.

One flag for merge coordination: migration 0026 makes `consentRecords.lotNumber/expiryDate` nullable. Manus's expired-lot blocking should treat NULL expiry as "procedure-only, no check", not as an error — worth one line in their directive.
