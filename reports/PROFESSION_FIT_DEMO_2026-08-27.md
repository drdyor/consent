# Aegis Consent — Profession-Fit Demo (three professionals, one working day)

**Date:** 2026-08-27 · **Mode:** PRODUCT-FIT DEMO, not a security audit · **Repo:** `C:\Users\Forre\consent` (current main)
**All data synthetic** (SYNTH- prefix throughout). Nothing outside `reports/` was modified.
⏱ Reading time: ~18 min (persona stories ~10 min; scenario matrix ~8 min).

**Boot:** exactly per `reports/QA_PERSONA_AUDIT_2026-08-27.md` — throwaway `aegis-fit-mysql` (MySQL 8, port 33112), schema via `drizzle-kit push --force` (again died at the >64-char FK name after creating the 34 tables — **fresh-DB provisioning is still broken, FINDING #2 reconfirmed on a second clean DB**), dev server `npx tsx server/_core/index.ts` (auto-moved to port 3116 — 3113 was taken by the `events` app), personas authenticated through the session-JWT seam (`JWT_SECRET`-signed `app_session_id`; user rows pre-seeded because without Manus OAuth the first-login sync path cannot run).
**Drivers & screenshots:** `reports/qa_scripts/profession_fit_demo.ts`, `fit_followup_probe.ts`, `fit_screenshots.mjs`, `fit_*.png` (9 screenshots).

---

## PERSONA A — Dr SYNTH-Marta, implant dentist (Malta) — **verdict: PARTIAL (borderline UNFIT for implantology)**

### The day, as she experiences it

1. **First login.** No registration form — her account materialises with a clinic called "New clinic" (`workspace.overview` auto-provisions clinic + admin membership + practitioner profile). Fine for a solo owner; there was never a moment where she chose to create a practice.
2. **Clinic setup — the first wall.** Clinic profile offers a compliance market of **Poland/EU, Great Britain, or USA. Malta does not exist.** She picks Poland/EU; the app then silently stores her clinic's jurisdiction as **"PL"** (`updateClinic` hard-codes `pl_eu → "PL"`). Her Valletta clinic is now, on every consent it will ever seal, a Polish-jurisdiction clinic. Screenshot: `fit_marta_home.png`.
3. **Adding her implant system — the second wall.** Product category options: *neuromodulator, HA filler, biostimulator, other*. **There is no implant, no medical-device category** — she files a bone-anchored titanium fixture as "other". Good news: `documentKind: ifu` exists, so the Instructions-For-Use is at least the right canonical document type, and the disclosure model (contraindication: untreated periodontitis; warning: smoking) works well for implants.
4. **Evidence gate — honest, but Malta-blind.** She entered the source honestly as jurisdiction **MT / Malta Medicines Authority**. Canonical IFU attestation passed, but approval was refused: *"This source is not governed for the clinic's Poland/EU market profile."* (`sourceMatchesMarket` accepts only literally `PL` or `EU`.) The only way through was to **relabel the source as jurisdiction "EU" / EUDAMED** — a workaround, and a mislabel she is forced into. After that, approval succeeded. Note what the pl_eu gate did **not** ask for: no UDI, no CE certificate, no notified body — device evidence is only enforced on the UK/USA paths and the market-catalogue promotion path, not on the direct `createProductSource` path she used.
5. **Lot + expiry — genuinely good.** `addInventoryLot` LOT-IMP-4110-77 / 2029-06-30 worked; the consent bound the registered lot, and the review page shows product/lot/expiry/practitioner. This is the strongest implantology-relevant feature in the product.
6. **Treatment map for tooth 36 — the map is a FACE.** The page is literally titled **"Facial treatment map"**; the diagram is an aesthetic-medicine face (glabella, crow's feet, lips, jawline…). The API accepted her free-text `areaKey: "tooth-36"`, and the UI then dutifully rendered **"1. Tooth 36 · 1.00 other · front" pinned to the chin of a cosmetic face drawing** — see `fit_marta_treatment_map_tooth36.png`. There is no odontogram, no FDI tooth chart, no mesial/distal, nothing periapical. The quantity model (units/mL) is injectable-shaped; an implant is "1.00 other". In the UI dropdown she couldn't even pick a tooth — only facial aesthetic zones (`fit_marta_create_consent.png` shows the "Anatomical area: Glabella…" selector).
7. **Consent + signing — works.** Evidence-gated consent creation, mandatory acknowledgement of both IFU disclosures, typed signature, sealed snapshot (`snapshotHash 820716…`, `notary_pending`). The flow itself is solid and fast.
8. **Second consent, same patient — cross-consent history EXISTS and is good.** Creating the second-stage-surgery consent for the same name+email silently reused **the same encrypted patient entity (patientId 1)**, and `/patients/1` shows a real cross-consent history: *"SYNTH-Pawlu Borg — 4 linked consent records"*, each with product, tooth, status, acknowledgement count (`fit_marta_patient_history.png`). Switching to her second patient (SYNTH-Maria Vella, patientId 2) shows only Maria's records. This surprised us positively — it is newer than the handover narrative.
9. **Implant passport — does not exist.** Nothing in UI, API, or schema (`grep -ri passport` over server/client/shared/schema: zero hits). The patient walks out with **nothing in hand**: no take-home artifact, no card, no PDF (server-side PDF is entirely missing — `renderedPdfUrl` never populated; PDF is a browser-only jspdf render on the Records page). The architecture docs plan a `POST /v1/passport-artifacts` endpoint (HANDOVER_CLINIC_CLINICAL_COMPLETENESS_2026-08-27.md P2) — **planned, not built**.
10. **Expired-lot probe (bonus).** She registered a lot that expired 2025-01-01: accepted without comment. Created a consent **on the expired lot**: accepted. Sent and **sealed/signed it: accepted** (`snapshotHash c7a6ce…`). No warning at any step, and the lot list has no status/expiry flag at all. For a medical-device workflow whose selling point is lot/expiry traceability, **the system happily notarises the use of an expired implant**.

### Verdict: **PARTIAL** — she can produce a legally-sealed, product-and-lot-bound consent for an implant, but the product does not know what a tooth is, does not know where Malta is, and gives her patient nothing to take home.

### Top 3 missing things (ranked)
1. **Dental anatomy model** — an odontogram/FDI tooth chart as an alternative treatment map, a `medical_device`/implant product category on the clinic path, and device-appropriate quantity semantics (fixture dimensions, not "1.00 other" on a face's chin).
2. **Implant passport / take-home artifact** — the planned passport-artifact endpoint plus a server-side PDF; today the patient leaves with nothing and even the clinic has no server-authoritative document.
3. **Jurisdiction coverage beyond PL/UK/US** — Malta (and any other EU state) needs to exist without mislabeling sources as "EU"; expired-lot blocking (or at least a loud warning) belongs in the same traceability story.

---

## PERSONA B — SYNTH-Karolina, dental hygienist at Marta's clinic — **verdict: UNFIT (cannot even enter the clinic)**

### What actually happens when a second professional tries to join

1. Karolina logs in, intending to join **SYNTH Valletta Implant Clinic**. There is no invite link to accept, no join-clinic screen, no pending-approval state. Instead the app **instantly auto-creates "New clinic" (id 2) with Karolina as its admin/owner** — a parallel one-person practice she never asked for. `sameClinic: false`.
2. From her auto-clinic she sees none of Marta's data (consent.list → 0; Marta's record → "Consent record not found"). Tenant isolation is correct — but that is precisely the problem: **the tenant boundary is drawn around the person, not the practice.** `clinicMembers` has a `practitioner` role in the schema and every member is created as `admin`; there is exactly one code path that ever inserts a member — self-provision (FINDING #3 reconfirmed on current main).
3. **The workaround a real clinic is forced into:** Karolina works **under Marta's login** on a shared front-desk device. The legal implications are serious for a consent-of-record product: every consent taken by the hygienist is attributed to `practitionerUserId = Marta` and sealed into the snapshot as *"Practitioner: Dr SYNTH-Marta"*; the audit trail's `actorUserId` is Marta for actions Marta never performed; the sealed snapshot — the product's court-grade artifact — **permanently misattributes who obtained consent**, which in a dispute cuts against the clinic rather than for it. The product's core promise (provable, attributable consent) is inverted by its own account model the moment a clinic has two staff.
4. **Perio-maintenance consent (scaling/root planing):** No starter templates exist at all on a fresh clinic (templates list: 0 — every template is build-your-own). She *can* author a "perio-srp" template (free-text `procedureKey`), but she **cannot create a consent from it**: `consent.create` hard-requires `productId`, `lotNumber`, and `expiryDate`. SRP uses no lot-tracked product — the API rejects the attempt with three validation errors (`productId … expected number, received undefined`, etc.). **Aegis structurally cannot express a procedure-only consent.** Her only options are a fake "product" with a fake lot number — poisoning the very traceability record the product exists to protect — or paper.

### Verdict: **UNFIT** — no second login per clinic, and no product-less consent. The two failures compound: even if she borrowed Marta's identity, the commonest hygienist procedure has no representable consent.

### Top 3 missing things (ranked)
1. **Invite/join flow with role separation** — admin invites member, member accepts, `practitioner` role actually used, consents attribute the real signer-in-attendance. (Without it there is no multi-practitioner clinic — the primary B2B unit.)
2. **Procedure-only consent** — make product/lot optional per template ("no device/medicinal product used in this procedure"), so SRP, extractions, exams, and hygiene recalls can be consented at all.
3. **Starter template library** — a fresh clinic is empty; a hygienist should find perio maintenance, and a dentist implant placement, on day one rather than authoring legal text from scratch.

---

## PERSONA C — Dr SYNTH-Amira, aesthetic medicine (PL) — **verdict: FIT (with two integrity caveats)**

This is visibly the persona the product was built for — everything is shaped like her practice.

1. **Setup:** clinic → Poland/EU is a real, native choice; Polish language default; done in one screen.
2. **Botulinum toxin as a medicinal product:** category `neuromodulator` exists first-class; ChPL (`spc`) is a native document kind; URPL / PL-URPL-2026-777 registry evidence is exactly what the PL gate wants. **The jurisdiction-aware gate behaved differently from Marta's device in three observable ways:** (a) her honest jurisdiction ("PL") is *accepted*, Marta's honest one ("MT") is *rejected*; (b) the pl_eu gate asks only for verified registry evidence — for her medicinal product that is the correct shape, whereas the same single check applied to Marta's device means **device-specific evidence (UDI/CE/notified body) is never demanded on this path**; (c) the classification-specific logic (`medicinal_product` vs `medical_device`) only ever fires on UK/USA market profiles and in the separate market-catalogue promotion flow. So: jurisdiction-aware — yes; classification-aware in her market — no, it simply doesn't need to be for her.
3. **Evidence gate blocks the unapproved product** (scenario 22): consent creation before approval → *"The selected product source requires clinic-administrator approval before it can be included in a consent."* Canonical ChPL attestation + approval opened it. Clean.
4. **Facial map is native:** glabella point, 12 units, front view — the exact diagram that was an absurdity for Marta is a well-designed documentation tool for Amira (`fit_amira_facial_map.png`). Vial lot/expiry (BTX-VIAL-2026-09 / 2027-09-30) bound to the consent and shown on the review page.
5. **Patient signs on her own device:** single-use link minted (`/patient-sign/<token>`, DB stores only the SHA-256 token hash), anonymous lookup renders the consent with disclosures, patient signed from an unauthenticated client, reuse correctly rejected (*"Patient signing link has already been used"*), and the used-link page fails gracefully (`fit_patient_sign_used_link.png`). This flow is genuinely production-shaped.
6. **The withdrawal phone call:** Patient rings the next morning. In the UI, Amira opens the signed record → "Record consent withdrawal" → types the reason (≥10 chars enforced) → the record flips to **UNIEWAŻNIONO / "Consent withdrawn — this signed record is preserved for audit, but it no longer authorizes treatment. Its original snapshot and sealed hash have not been edited"** (`fit_amira_review_withdrawn.png`). Verified over the API: status `voided`, `snapshotHash` byte-identical to pre-withdrawal, a new `withdrawalEventHash` chained to the snapshot hash, and a `consent.withdrawn` audit event. Append-only and honest. Two limits: **the patient cannot self-withdraw** (anonymous withdraw → "Please login"; there is no patient portal — clinic-mediated only, which for GDPR Art. 7(3) "as easy to withdraw as to give" is shaky given the patient *signed* self-service), and nothing prompts any follow-up (no notification, no patient copy of the voided state).
7. **Integrity caveats she can't see:** (a) recomputing SHA-256 over the stored snapshot **does not reproduce the sealed hash** (stored `eb1236…` vs recomputed `23a0f7…` — MySQL JSON key-reorder; FINDING #1 reconfirmed live on current main; with a notary reference present the product's own verifier calls untampered records "modified"). (b) her before/after photos **cannot upload at all off-Manus** (*"Storage config missing: set BUILT_IN_FORGE_API_URL and BUILT_IN_FORGE_API_KEY"*) and photos carry no content hash even when storage works.

### Verdict: **FIT** — a PL aesthetic-medicine doctor can run her actual consent day end-to-end (product → gate → map → own-device signing → withdrawal). The caveats are trust-infrastructure, not workflow.

### Top 3 missing things (ranked)
1. **Reproducible seal** — canonicalized hashing so an auditor (or her lawyer) can independently verify the snapshot; today the core court-grade claim doesn't survive its own database.
2. **Patient-side self-service** — the patient can sign remotely but cannot view or withdraw remotely; a one-way street that undermines the GDPR story.
3. **Photo evidence integrity + portable storage** — photos need non-Manus storage and a content hash inside the sealed record if before/after images are to be evidence.

---

## 30-scenario matrix

Boundary rule applied (per `HANDOVER_CLINIC_CLINICAL_COMPLETENESS_2026-08-27.md`): *Clinic owns the encounter, patient chart, clinician measurements, symptoms/differentials, prescriptions, clinical pathways; Aegis owns consent governance, source/evidence, product/lot/expiry, signatures, audit provenance.* **N/A-CLINIC** = belongs to the drdyor/clinic app by that agreement.

| # | Scenario | Verdict | Evidence (live unless marked static) |
|---|---|---|---|
| 1 | New patient registration + demographics | **PARTIAL** | No registration screen; a patient entity (encrypted identity, name/email/DOB only) is created as a side-effect of `consent.create`. No address, phone, ID number, medical demographics. Identity dedupe by name+email hash works (same patient reused across consents). |
| 2 | **Switch between two patients, view each history** ⭐ | **PASS** | `/patients/1` (Pawlu, 4 records) vs `/patients/2` (Maria, 4 records incl. the expired-lot probe) — each shows only its own consents with product/status/acknowledgements. Screenshot `fit_marta_patient_history.png`. Caveat: no patient *list/search* page was found — you reach a patient via a consent record, not a patient index. |
| 3 | Dental chart entry (caries tooth 36 / odontogram) | **N/A-CLINIC** (and NOT-BUILT here) | Patient chart is Clinic-owned. Aegis's only anatomy surface is the facial aesthetic map — tooth 36 renders as a pin on a face's chin (`fit_marta_treatment_map_tooth36.png`). |
| 4 | Chart history across two visits | **N/A-CLINIC** | Chart is Clinic-owned. (Aegis's `treatmentCourseEntries` can hold per-consent session notes, but that is a consent log, not a chart.) |
| 5 | **Upload an x-ray/radiograph to a patient record** ⭐ | **FAIL** | Nearest capability is consent-scoped clinical photos (before/after/other, PNG/JPEG only — DICOM impossible). Live attempt: `"Storage config missing: set BUILT_IN_FORGE_API_URL and BUILT_IN_FORGE_API_KEY"` — off-Manus, no image of any kind can be stored. Also photos attach to a consent, not to the patient. |
| 6 | Re-open/annotate that image at follow-up | **NOT-BUILT** | No annotation surface anywhere; photos render as thumbnails/links only (static). |
| 7 | Perio charting (pocket depths) | **N/A-CLINIC** | Clinician measurements are Clinic-owned. Nothing in Aegis could hold them anyway. |
| 8 | Recall / 6-month reminder | **N/A-CLINIC** (nothing here either) | No scheduling/reminder machinery in Aegis; its only scheduled jobs are evidence-freshness/supplier scans on Manus cron (inert locally). |
| 9 | Day view → start encounter | **N/A-CLINIC** | Encounters are Clinic-owned. Aegis Home is a consent dashboard (sent/signed metrics), not a day list. |
| 10 | Intake feeds the consult | **N/A-CLINIC** | Explicitly forbidden to Aegis ("must not inspect medication/symptom/medical-history data"). |
| 11 | Symptom → sourced differential | **N/A-CLINIC** | Explicitly forbidden to Aegis (no clinical scores/risk inference). |
| 12 | Note provenance survives edits | **N/A-CLINIC** for chart notes | For Aegis's own records: signed snapshots are immutable-by-convention and withdrawal is append-only (PASS within its domain), but see #30 on hash reproducibility. |
| 13 | Controlled-drug prescription ack gate | **N/A-CLINIC** | Prescribing is Clinic-owned. Aegis's analogous ack gate (disclosure acknowledgements before signing) works — see #18. |
| 14 | Print prescription honestly labelled | **N/A-CLINIC** | No prescription concept in Aegis. |
| 15 | Record implant brand/lot/expiry at surgery | **PASS (with a taxonomy hole)** | `addInventoryLot` + consent binding of LOT-IMP-4110-77 / 2029-06-30 worked; review page shows product/lot/expiry/practitioner. Hole: no implant/device category on the clinic path — the fixture is filed as "other", and no UDI is captured on this path. |
| 16 | Implant passport take-home artifact | **NOT-BUILT** | Zero code hits for "passport"; planned as `POST /v1/passport-artifacts` (P2, design-only). No server PDF either — patient leaves with nothing. |
| 17 | Expired-lot warning | **FAIL** | Lot expired 2025-01-01 accepted; consent on it created, sent, **and sealed/signed** with zero warning (`snapshotHash c7a6ce…`). Lot list exposes no expiry status. The traceability data is captured but never acted on. |
| 18 | Consent template → jurisdiction gate → seal → sign | **PASS** | Full chain live: template → market-profile gate (blocked MT source; demanded canonical attestation + registry evidence) → mandatory disclosure acks (sign without acks fails) → sealed snapshot + hash + notary_pending. The single strongest flow in the product. |
| 19 | Patient signs on own device | **PASS** | Single-use hashed token link; anon lookup + sign OK; reuse rejected; graceful used-link page (`fit_patient_sign_used_link.png`). |
| 20 | Withdrawal + record integrity after | **PASS** | `voided`, snapshot hash byte-identical, chained `withdrawalEventHash`, `consent.withdrawn` audit event, UI states it plainly (`fit_amira_review_withdrawn.png`). Patient cannot self-withdraw (clinic-mediated only). |
| 21 | **Second consent same patient (cross-consent history)** ⭐ | **PASS** | Same name+email → same encrypted patient entity; `/patients/:id` lists all linked consents with statuses and acknowledgement counts. Better than the handover narrative suggested. |
| 22 | Evidence gate blocks unapproved product | **PASS** | `"The selected product source requires clinic-administrator approval before it can be included in a consent"`; also blocks approval itself pre-attestation and pre-registry. Jurisdiction-aware (PL vs MT demonstrated); classification-aware only on UK/US paths. |
| 23 | Approved education leaflet to patient | **NOT-BUILT** | Planned (`POST /v1/education-deliveries`, P2 design-only). Nothing deliverable to a patient today — not even the consent PDF (client-render only). |
| 24 | BP+saliva research observation, longitudinal | **N/A-CLINIC** | Explicitly Clinic-owned with a `research_not_for_clinical_decision` constraint; Aegis may only ever hold kit/lot logistics (not built either). |
| 25 | Before/after photo integrity hash + verify | **FAIL** | Upload impossible off-Manus (#5); schema stores `storageKey/photoUrl/caption` — **no content hash column**, so even on Manus the photos are not integrity-protected and are outside the sealed snapshot. |
| 26 | Invoice from encounter, plan gating, price config | **N/A-CLINIC** (billing) — and nothing in Aegis | No invoice/billing table or route anywhere in Aegis (static grep). |
| 27 | GDPR export + erasure incl. invoices | **NOT-BUILT** | No export or erasure endpoint in any router (static). Patient identity is at least encrypted at rest with a dedupe hash, but there is no data-subject tooling at all. |
| 28 | Hygienist/staff role separation | **FAIL** | `clinicMembers.role` enum (`admin`/`practitioner`) exists but every member is created `admin` via the sole self-provision path; no UI or API assigns `practitioner`; `requireAdmin` gates exist but in practice everyone is admin of their own solo clinic. |
| 29 | Second practitioner joins the same clinic, shared patients | **FAIL** | Live: Karolina's login auto-created clinic 2; no invite/join/add-member mutation exists (FINDING #3, current main). Real-world workaround = shared login → sealed snapshots misattribute the consent-taker. |
| 30 | Owner verifies the audit chain/hash of a record | **PARTIAL→FAIL** | Audit trail exists and is complete (created → map point → sent → link issued → patient_signed → notary_pending → withdrawn). But only the withdrawal event carries `eventHash`/`previousEventHash` — every other event is unhashed (a "chain" with one link). And the seal itself is not reproducible: stored `eb1236…` vs recomputed `23a0f7…` (FINDING #1 live again); `verifyNotary` without creds honestly says `unknown`, but per the QA audit it reports **"modified" on untampered records** once a notary reference exists. |

⭐ = operator-priority scenarios.

---

## Cross-persona synthesis

- **The product is an aesthetic-injectables consent studio, and a good one.** For Persona C the workflow density is high: registry-gated products, curated SPC disclosures, facial mapping, vial lot binding, remote signing, honest withdrawal. Polish/English bilingual copy is real, not decorative.
- **"Dental" is currently a costume.** The moment the procedure is anatomical (a tooth) rather than topological (a face zone), or product-less (hygiene), or multi-staff, the model breaks: face-only map, product-mandatory consent, one-clinic-per-user, no passport, no starter templates, Malta unmappable.
- **The trust spine has two cracks that affect every persona:** the non-reproducible snapshot hash (the flagship claim), and the mostly-unhashed audit trail. Fixing hashing canonicalization (and hashing every audit event, not just withdrawal) would upgrade three personas at once.
- **Off-Manus, anything involving a file is dead:** photos, signatures-as-drawn images, supplier docs — all Forge-bound. The demo's drawn-signature and photo paths fail with the same `BUILT_IN_FORGE_API_URL` error.

## Artifacts

`reports/qa_scripts/`: `profession_fit_demo.ts` (main driver), `fit_followup_probe.ts`, `fit_screenshots.mjs`, and screenshots `fit_marta_home.png`, `fit_marta_create_consent.png`, `fit_marta_treatment_map_tooth36.png`, `fit_marta_review_signed.png`, `fit_marta_patient_history.png`, `fit_marta_records.png`, `fit_amira_review_withdrawn.png`, `fit_amira_facial_map.png`, `fit_patient_sign_used_link.png`.

## Teardown

Dev server (port 3116) stopped and `aegis-fit-mysql` container removed with all synthetic data at the end of the demo session. No product code, schema, or config was modified; the only writes were under `reports/`.
