# Aegis scope decision: clinical guidelines, referrals, and implant passports

**Status:** Product-boundary decision and implementation plan. **Not** medical, legal, regulatory, or commercial approval.

**Audience:** Aegis Consent + Shop, Dental Telemed, Aesthetics, and MD product teams.

## Decision in one sentence

> **Aegis is the governed consent, evidence, device-traceability, inventory, procurement, and future B2B supply service—not the system that diagnoses, interprets clinical data, sets care pathways, or makes referral decisions.**

The separate clinical application owns the encounter, patient chart, imaging, clinical judgment, referrals, recall decisions, and patient-specific communication approval. Aegis contributes only provenance-bound operational records and pre-approved consent content selected by an authorised clinician.

## Why this boundary is necessary

The proposed features include several fundamentally different kinds of work. Implant item/lot provenance, consent versioning, and controlled document verification fit Aegis. Bone-density assessment, cancer-screening reasoning, treatment/review intervals, clinical referral, and patient-specific educational selection depend on medical history, imaging, clinician assessment, and local care pathways; they therefore belong in the clinical product.

This split also protects against a misleading simplification of the AI Act. The Act is risk-based and high-risk status depends on the specific system and intended purpose; it is not correct to state that every health-related or personalised message is automatically high-risk. The legal text separately distinguishes inference-capable AI from systems based solely on rules set by humans. That distinction does **not** remove privacy, clinical-governance, medical-device, consumer, or professional-practice obligations. [1] [2]

## Ownership matrix

| Capability | Clinical application owns | Aegis owns | Explicitly excluded from Aegis |
|---|---|---|---|
| **Clinical guidelines** | Determines which guideline is applicable to a patient, interprets it, and records a clinician’s decision. | A future **evidence registry** may retain provenance, licence status, review status, jurisdiction, version, and approved references. | Live clinical rules, recall interval calculation, diagnosis, decision support, or treatment recommendation. |
| **Bone health / menopause** | History intake, clinician discussion, unknown-status recording, imaging/measurement, and any decision to refer. | Only a clinician-selected, template-defined acknowledgement/context field where a legally/clinically approved consent pack explicitly permits it. | Inferring menopause/osteoporosis, calculating a risk score, suggesting HRT, advising on DXA, or changing a treatment plan. |
| **Oral/facial/skin cancer** | Examination, image custody, assessment, urgent-pathway choice, referral letter, and clinical follow-up. | Generic source and training-document provenance only, if separately licensed and reviewed. | Image analysis, cancer screening, triage, urgency score, diagnosis, or autonomous referral. |
| **Patient education** | Maintains patient portal, selects an approved item for the individual, records the clinician’s review where required, and sends care communication. | May eventually host a neutral, versioned library of reviewed generic resources and delivery/audit metadata. | Generating patient-specific clinical advice, inferring a condition, sending communications autonomously, or cross-selling from health context. |
| **Newsletters / marketing** | None by default; a future dedicated communications service needs separate ownership and compliance design. | None in the current scope. Aegis can expose a generic resource catalogue only. | Combining health data with marketing segmentation, one-click clinical-to-marketing conversion, or automatic email/SMS. |
| **Implant passport** | Authoritative clinical timeline, procedure details, clinician-authored entries, clinical attachments, patient release/share choice, and interoperability import. | Immutable consent receipt, governed device/product/lot/expiry provenance, cryptographic document-hash verification, and stable evidence references. | Implant “health” score, survival prediction, clinical interpretation, diagnosis, or a shared patient master record. |
| **Referrals** | Clinician initiates, authors/reviews the letter, chooses recipient/pathway, sends, and tracks clinical outcome. | Optional immutable proof that a referral was clinician-authorised and a generic reviewed resource/template identifier—not the referral body—if a future integration requires it. | Referral recommendation, recipient selection, letter generation from health data, transmission, or patient-data retention beyond a minimal reference. |
| **Guideline-refresh automation** | Clinical advisory board reviews changes and authorises a policy version for use. | May run a source-monitoring and review-queue service after licensing is established. | Unlicensed scraping, automatic rule deployment, model training on licensed guideline content, or automated update of consent/referral text. |

## The Aegis role, by product area

### 1. Consent

Aegis remains the **single authority** for consent template versioning, source/disclosure provenance, material/lot evidence, market/language eligibility, acknowledgements, signing, immutable snapshots, withdrawals, and PDF/archive verification. The clinical application presents the consent in its own workflow but must render the Aegis-issued package rather than recreating its own parallel legal/clinical wording library.

For future clinical context, the client may submit only a controlled `approved_context` code selected by a clinician from a schema bound to a particular Aegis template revision. It cannot transmit diagnosis, medication list, image/radiograph, numerical measurement, free-text plan, risk score, generated text, or unreviewed recommendation. Examples of permitted *future* codes might be `discussion_recorded` or `external_referral_considered`; they are evidence of a clinician’s selected process state, not conclusions about a patient.

### 2. Evidence and guideline registry

Aegis should **not** become a clinical-decision engine. It may eventually operate a shared, versioned *evidence registry* to support human review across Dental, Aesthetics, and MD. Each source record must retain publisher, canonical URL, jurisdiction, licence/permission state, version/effective date, retrieval time, review history, permitted use, and an explicit status such as `discovery`, `under_review`, `approved_reference_only`, or `retired`.

The registry’s initial output should be a clinician-facing source link and change-review queue—not a “recommended care plan,” risk flag, referral prompt, or patient-facing summary. A clinical advisory board must approve any conversion from a source record into a controlled rule, consent clause, training module, or referral template. The resulting artefact must be independently versioned and traceable back to the approved source.

NICE provides a syndication API and says that end-user AI use of NICE content must use that API under an approved licence; it also prohibits using NICE content to train, fine-tune, or weight generative models. [5] SDCEP says commercial reuse needs written permission and prohibits misleading modification or use out of context. [6] This means the proposed “twice-yearly agentic scraper” is **not** an approved Aegis feature. A future source-monitor may check publisher-declared metadata and flag potential changes for review, but it must not copy, transform, or operationalise content until licensing, permission, and clinical governance are in place.

### 3. Referrals and clinical communication

Referrals—including GP, specialist, radiology, oncology, endocrinology, menopause, or bone-health referrals—belong in the clinical application because they arise from a clinical encounter and require professional judgment. The clinical product may provide a clinician-authored template, require mandatory review/edit/authorise steps, log the referral, and track a response. Aegis does not receive the referral narrative or select its recipient.

Patient education should also remain in the clinical app’s patient portal. The safest initial design is deterministic presentation of a clinician-approved, jurisdiction-specific resource selected from a reviewed library. Any personalised generative drafting must be a separate clinical-AI programme with a documented intended-purpose assessment, quality/risk controls, clinician review before sending, user transparency, and immutable action logs. It must not be introduced through the consent or shop feature path.

Health and inferred health-risk information are special-category data under the UK GDPR, including medical history, treatment, device data, and profiling that infers health status. [3] A notification can also be marketing rather than care communication depending on its purpose. The ICO maintains distinct guidance for direct marketing and electronic communications. [4] Therefore, educational care communication, referral communication, and marketing must have separate purpose records, preference states, opt-in/opt-out controls where required, audit logs, and access boundaries. They cannot share a generic “newsletter” switch.

### 4. Implant passport

The **implant passport** is strategically compatible with Aegis if it is built as a deterministic, patient-authorised export with separable components:

| Passport component | System of record | Aegis contribution in a future phase |
|---|---|---|
| Implant/device, manufacturer, REF/UDI where applicable, lot/batch, expiry and material provenance | Aegis product/lot ledger | Supplies a signed provenance slice with source/evidence revision IDs. |
| Placement/restoration history, anatomy/site, clinical measurements, imaging, clinical assessment, clinician identity, and follow-up | Clinical application | No storage, interpretation, or validation by Aegis beyond a reference/hash. |
| Consent receipt | Aegis | Supplies immutable consent ID, template revision, signing timestamp, snapshot hash, and withdrawal/freshness state. |
| Passport document | Clinical application or a jointly specified export service | Combines only cryptographically linked payloads; a versioned manifest shows origin and hashes for each section. |
| QR/verification | Aegis verification service, later | Verifies issuer, document version, expiry/revocation, and hashes. It must not reveal patient data until an authorised, patient-controlled sharing step. |

The first passport must be **record-backed, not prediction-backed**. No survival probability, “healthy” rating, bone-loss interpretation, risk alert, or statement that Aegis clinically verified the implant may appear. The patient controls download and time-limited sharing. A recipient sees no data simply by scanning a QR code; the QR resolves only to a consented, expiring verification capability.

## Approved data boundary for a future v1.1 context extension

The currently implemented `v1` Aegis boundary remains reference-only. Do not change its acceptance rules to carry clinical health data. If and only if a clinically/counsel-approved consent pack requires controlled clinician-selected context, add a **new version** such as `v1.1` after a joint data-protection and security review.

| Field | Example | Rule |
|---|---|---|
| `approved_context[]` | `{ code: "external_referral_discussed", template_field_id: "referral-discussed-v1" }` | Enumerated per template revision; clinician selects it; Aegis validates code/revision match and locks it in the snapshot. |
| `context_attestation` | clinician user reference and timestamp | Records who selected the controlled field and when; not a diagnosis or treatment recommendation. |
| `source_reference_id` | `evidence-ref-…` | Optional approved evidence/resource identifier; must be jurisdiction/language/version eligible. |
| `origin_case_ref` | opaque application-scoped reference | Reference only; no case narrative, image, scan value, diagnosis, medication, medical history, or clinical score. |

The following fields are rejected by design: `menopause_status`, `hrt_status`, `bone_density`, `dxa_result`, `bone_loss_mm`, `cancer_score`, `lesion_photo`, `cbct`, `medical_history`, `medications`, `risk_score`, `recommended_action`, `referral_text`, `generated_advice`, and unrestricted free text. This restriction is purposeful: patient-specific clinical facts must remain in the clinical system.

## Future operational agents: safe uses only

The future agent boundary remains provider-neutral. A language-model provider can propose a draft or classify a source only after a supplier/security assessment; the provider must never become an Aegis system authority.

| Agent activity | Allowed future role | Mandatory human control | Prohibited action |
|---|---|---|---|
| Evidence monitoring | Detect a publisher-declared version/date change or prepare a comparison for review. | Evidence administrator and clinical reviewer approve/reject before the registry changes status. | Scrape/license-bypass content, operationalise a recommendation, change a template, or train a model on restricted content. |
| Procurement assistant | Prepare a non-binding inventory/reorder/RFQ suggestion from Aegis facts. | Authorised user chooses supplier and approves each request; supplier configuration and commercial terms must already be verified. | Choose a clinically suitable product, substitute components, order, pay, mark paid, or contact suppliers autonomously. |
| Consent operations assistant | Explain a template’s source/audit state to staff or draft an internal checklist. | Clinician/admin confirms any workflow action. | Generate patient-specific medical/legal consent clauses, sign/send, alter a sealed record, or decide eligibility beyond encoded gates. |
| Clinical assistant | **Outside Aegis scope.** | Clinical-product governance programme. | Diagnose, interpret images, calculate clinical risk, recommend care/referral, or communicate clinical advice to a patient. |

Every allowed agent proposal needs a durable action record containing its provider/model/version, input-reference manifest (not raw clinical data), output hash, policy version, requested capability, approval/rejection actor/time/reason, execution result, and correlation ID. Agents receive a one-time scoped capability only after approval. There is no standing authority to sign, prescribe, refer, order, pay, or make a clinical determination.

## Sequenced delivery plan

| Priority | Aegis deliverable | Clinical-app deliverable | Gate to proceed |
|---|---|---|---|
| **P0 — now** | Retain the current evidence-gated consent, material/lot traceability, immutable signing, and read-only operational contract. | Keep clinical facts, imaging, plans, referrals, and patient communications in the clinical product. | None beyond existing governance. |
| **P1 — source governance** | Evidence-registry design; source metadata/review workflow; rights/licence register; human change-review queue. | Clinical advisory-board workflow and jurisdiction-to-policy mapping. | Publisher/API/permission review, legal review, named clinical owners. |
| **P2 — controlled consent context** | Versioned `approved_context` schema and snapshot evidence only. | Clinician-selected context UI; no automatic inputs; clinical record retains the underlying facts. | Template/counsel approval, DPIA/privacy review, contract tests. |
| **P3 — implant passport** | Device/lot/consent provenance export and privacy-preserving verification endpoint. | Clinician-authored clinical export, patient portal download/share consent, recipient workflow. | Patient-access design, data-protection review, security/threat model, interoperability test set. |
| **P4 — communications/learning** | Optional resource-library provenance and delivery audit surface. | Deterministic clinician-approval/send queue and separately managed patient preferences. | Clinical-content approval, marketing-vs-care purpose split, communication/privacy review. |
| **P5 — automation** | Human-approval agent ledger and non-binding evidence/procurement assistants. | If desired, a separate clinical-AI safety programme owned by the clinical app. | Model/vendor assessment, change control, security review, escalation/rollback tests. |

## Non-negotiable implementation rules

1. No Aegis component may infer health status from sex, age, medication, imaging, or demographics; unknown data remains unknown.
2. No automated “risk flag,” recall interval, referral, cancer screen, HRT advice, DXA suggestion, treatment-plan change, or patient message may be presented as an Aegis decision.
3. No source monitor, scraper, or model may make a guideline clinically active, alter consent wording, or create patient content without licence/permission and named human clinical approval.
4. No health-derived marketing segmentation. Care education and commercial outreach require separated purposes, access controls, preference records, and audit trails.
5. No passport claims of clinical validation, prognosis, diagnosis, or treatment suitability. Verify only issuer, provenance/hash, document version, authorisation, and revocation status.
6. No supplier ordering, payments, referral transmission, or clinical actions by an agent. All external effects require an authorised human and an immutable approval event.

## References

[1] [European Commission, *Regulatory framework for AI*](https://digital-strategy.ec.europa.eu/en/policies/regulatory-framework-ai)

[2] [Regulation (EU) 2024/1689, *Artificial Intelligence Act*, EUR-Lex](https://eur-lex.europa.eu/eli/reg/2024/1689/oj/eng)

[3] [Information Commissioner’s Office, *What is special category data?*](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/lawful-basis/special-category-data/what-is-special-category-data/)

[4] [Information Commissioner’s Office, *Direct marketing and privacy and electronic communications*](https://ico.org.uk/for-organisations/direct-marketing-and-privacy-and-electronic-communications/)

[5] [NICE, *NICE syndication API*](https://www.nice.org.uk/reusing-our-content/nice-syndication-api)

[6] [SDCEP, *Copyright*](https://www.psm.sdcep.org.uk/about/copyright/)
