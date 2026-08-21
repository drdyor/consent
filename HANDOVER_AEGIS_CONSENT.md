# Handover — Aegis Consent, to the next level

**Date:** 2026-08-21 · **Author:** Claude (for Dr Eva) · **Repo:** github.com/drdyor/consent
**Companion:** the Vitalis clinic handover (`HANDOVER_OPTIMIZED_CLINIC_APP.md` in
github.com/drdyor/clinic). Read that for how consent fits the wider clinic product.

This document: what Aegis is, the hard deadline that forces a decision, a see-beyond pass to
level it up, and a build sequence.

---

## 1. What Aegis is (three sentences)

Aegis Consent is a B2B SaaS that builds, governs, and **legally locks** aesthetic-medicine
treatment-consent records: a consent cannot be signed until the product passes a
**jurisdiction-aware evidence gate** (PL/EU registry, UK MHRA/UKCA, US FDA) and the
practitioner has documented an anatomical **treatment map** + lot/expiry, after which the
whole record is frozen into a **SHA-256 hash-sealed snapshot** with an append-only audit
trail. It is genuinely mature — 18 Drizzle migrations, 22 test files, no stubs — and its
consent model is stronger than Vitalis's in-house consent on every axis. Its one structural
weakness is that it is welded to the Manus platform (OAuth + Forge S3 + MySQL).

Full technical map: `reports/integration/AEGIS_CONSENT_BRIEF.md` in the clinic repo.

## 2. The deadline that forces the decision (2026-08-24)

Manus OAuth is being deleted on **24 Aug 2026**. Aegis runs on Manus OAuth, Forge storage,
and MySQL, so **the running instance and any data in it die that day.** The **GitHub code
survives** (this repo) — and the design is already captured — so nothing about the *model* is
lost. Two urgent, finite actions before the 24th:

1. **Export any real data** from the hosted instance (consent records, signed snapshots,
   uploaded signatures/photos). Likely synthetic — confirm and export what isn't.
2. **Decide the future** (below). The de-platforming work is the same regardless, so it can
   start now.

## 3. The strategic fork (Eva decides)

De-Manus'ing Aegis is required in every path; what differs is where it lands:

- **A — Fold into Vitalis.** Port the consent engine into Vitalis's Python/Postgres stack as
  the aesthetic pack's consent module. One product, unifies the treatment map (duplicated in
  both today). This is the clinic-handover's Phase 2.
- **B — Keep Aegis as a standalone de-Manus'd consent SaaS.** It's a real B2B product on its
  own (supplier governance, evidence gates, multi-market). Replace Manus OAuth → portable
  auth, Forge → S3/MinIO, MySQL → Postgres; keep the Node/tRPC stack.
- **C — Both:** Aegis stays the standalone product *and* Vitalis embeds a shared consent core.

The see-beyond ideas below raise Aegis's ceiling **in every path** — they improve the model,
not the plumbing.

---

## 4. See-beyond — six ways to take Aegis to the next level

Grounded in the actual code; persona: a medico-legal reviewer who has defended aesthetic
clinics in consent disputes. Ranked by value-per-cost. Each is a proposal — Eva chooses.

### 1. Notarize the signed-consent hash (court-grade, and it unifies with the photo system)
- **What:** Aegis already computes a SHA-256 `snapshotHash` at signing (`consentSnapshot.ts:37`).
  Anchor that hash to an immutable public timestamp via **Hedera** — reusing the *same*
  `@glow/hedera` library the Glow Protocol photo notary uses. A signed consent becomes
  independently court-verifiable by anyone, exactly like a certified before/after photo.
- **Why it's better:** today the snapshot is "immutable by convention" — a DB row. Anchoring
  makes it immutable *by proof*: in a dispute, the consent's existence and content at a moment
  are verifiable against the public ledger without trusting Aegis's database. And it puts
  consent + photos under **one integrity story** — a powerful single pitch to clinics and
  insurers.
- **Cost:** small–medium (one notarize call at sign, store `{topicId, seq, txId}`; verify is a
  stateless Mirror-Node GET). **Confidence:** grounded-in-artifact.

### 2. Patient-held, self-service signing on the patient's own device
- **What:** Signing today happens in-clinic on the *practitioner's* session; there is no
  patient entity and no patient invite (`production-considerations.md` flags it "future").
  Add a time-boxed patient link: the patient reviews disclosures and signs on their own phone;
  the signature + snapshot hash bind to them.
- **Why it's better:** "the practitioner clicked sign" is the weakest link in a consent
  dispute. Patient-device signing is what makes the consent *theirs*, and it closes the
  integrity gap that undermines everything downstream.
- **Cost:** medium (needs the patient entity from idea 4). **Confidence:** grounded-in-artifact.

### 3. Withdrawal as a first-class, hash-chained event (not a status flip)
- **What:** `voided` is a valid status and documented policy, but **no code implements
  withdrawal**. Build it — but not as a mutation to the signed record. A withdrawal is a *new*
  signed, timestamped, hash-sealed event appended to the record's audit chain
  (`auditEvents` is already append-only), so the trail reads consent→withdrawal with full
  provenance and the original stays immutable.
- **Why it's better:** GDPR/consent law needs demonstrable withdrawal; doing it as an append
  (never an edit) keeps the "voided-not-edited" policy the docs already demand, and preserves
  the legal snapshot.
- **Cost:** small. **Confidence:** grounded-in-artifact.

### 4. A real patient entity with cross-consent history
- **What:** Today a patient is loose name fields on each `consentRecords` row
  (`schema.ts:258-260`) — no linkage between two consents for the same person. Add a
  `patients` table scoped to clinic; link consents, treatment courses, and photos to it.
- **Why it's better:** a clinic needs a patient's consent history at a glance (prior
  treatments, prior withdrawals, allergy disclosures). It's also the prerequisite for ideas 2
  and for any Vitalis fold-in (Vitalis has real patient IDs; Aegis has none).
- **Cost:** medium (migration + backfill of existing name fields). **Confidence:** grounded.

### 5. Evidence-freshness re-verification on signed consents
- **What:** `productSources` carry a review status (pending/approved/**superseded**), and the
  supplier module already runs scheduled evidence-expiry reminders. Extend that discipline to
  product sources: a scheduled re-check that flags any consent signed against a source that has
  since been superseded or whose registry status changed.
- **Why it's better:** a consent's legal weight depends on the evidence being current *at
  signing* — and on the clinic being able to show they noticed when it changed. This turns
  Aegis from "correct at signing" into "actively monitored", a real compliance differentiator.
- **Cost:** small–medium (reuse the reminder scheduler). **Confidence:** grounded-in-artifact.

### 6. De-Manus as a feature: self-hostable, EU-data-resident
- **What:** Replacing Manus OAuth → portable auth (e.g. Lucia/Auth.js), Forge → S3/MinIO,
  MySQL → Postgres is forced by the deadline — but package it as a capability: a clinic can
  self-host with its data in its own jurisdiction.
- **Why it's better:** EU aesthetic clinics care about data residency (the same regulatory
  wind that Glow Protocol rides). "Your consent data never leaves your control" is a selling
  point, not just a migration chore.
- **Cost:** medium–large (the migration itself). **Confidence:** grounded-in-artifact.

**Cheapest high-value first:** ideas 3 (withdrawal) and 1 (notarize) are small and turn Aegis
from "good consent form" into "court-grade, monitored consent of record". Ideas 4→2 are the
patient-identity spine. Idea 6 is forced by the 24th regardless.

---

## 5. Build sequence
1. **Before the 24th:** export any real data; start the de-Manus migration (idea 6) since it's
   required in every path.
2. **Court-grade core:** ideas 3 (withdrawal) + 1 (Hedera notarize) — small, high-value.
3. **Patient spine:** idea 4 (patient entity) → idea 2 (self-service signing).
4. **Monitoring:** idea 5 (evidence freshness).
5. **Reconcile with Vitalis** per the strategic fork (§3) — shared consent core or standalone.

## 6. What only Eva owns
- The strategic fork (§3): fold into Vitalis, standalone, or both.
- Any real data in the hosted instance to export before the 24th.
- Clinical/legal content: disclosure text, consent wording, jurisdiction rules — counsel/
  clinician, never the builder.
