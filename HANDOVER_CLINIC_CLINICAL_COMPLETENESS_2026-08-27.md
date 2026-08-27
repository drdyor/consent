# Handover: Clinic Clinical Completeness, Source Governance, and Research Kit Operations

**From:** Clinic workstream  
**To:** Aegis Consent + Shop workstream  
**Date:** 2026-08-27  
**Status:** Required design and portability work; no portable network integration exists yet.

## Decision to preserve

> **Clinic determines and records patient-specific clinical context and clinician decisions. Aegis fulfils governed operational consequences.**

Clinic owns the encounter, patient chart, clinician-entered measurements, symptom/history review, clinical pathway applicability, referral decision, and clinician-selected education/consent trigger. Aegis owns reviewer identity, source rights/version governance, approved external-resource records, governed consent templates/packages/signatures, product/lot/expiry operations, delivery receipts, document artifacts, research-kit logistics, and audit provenance.

Aegis must **not** create a patient-facing symptom dashboard, inspect medication/symptom/medical-history data, determine that a care pathway applies, calculate a clinical score, infer clinical risk, originate a referral, or dynamically write patient-specific legal/clinical content.

## Clinic capability delivered now

Clinic has implemented a synthetic-only, tenant-scoped foundation:

| Clinic record | Current boundary | Aegis implication |
|---|---|---|
| Clinical completeness review | Bounded domain and explicit human status (`history_incomplete`, `documented`, `not_applicable`, `review_deferred`) with immutable source/version snapshot. | Aegis may distribute source/baseline metadata but never calculate or own the review result. |
| Oral-systemic observation | BP/pulse and selected saliva data keys, with literal value/unit/time and `research_not_for_clinical_decision` database constraint. | Aegis may record kit/lot logistics. It must not receive/derive clinical interpretation from values. |
| Research gate | Observation creation requires an active Clinic `research_registry` consent tied to that subject/tenant. | Future Aegis research-consent receipt must be separately versioned and reconciled; it does not create a shared patient chart. |

The current models use internal integer IDs. **Do not expose them in the future cross-service contract.** Portable Aegis APIs must use opaque public IDs and origin-scoped subject/case references.

## Work requested from Aegis

### P0 — Finish portable service foundations before a live Clinic connection

Complete the already-gated transition from platform-bound authentication/storage/MySQL to portable app authentication/service principals, PostgreSQL, portable object storage, durable outbox/event delivery, and external HTTPS API deployment. The current internal tRPC seam and mock-first Clinic adapter remain useful contract tests but are not a network integration.

### P1 — Governed source and baseline-release registry

Build a **non-clinical source registry**, not a guideline decision engine. Each approved release must have opaque IDs and retain at least:

| Field | Requirement |
|---|---|
| `baseline_key`, `jurisdiction`, `source_ref`, `source_version` | Controlled identifiers. Clinic stores the exact source/version used. |
| `rights_status`, `source_url`, `retrieved_at`, `source_hash` | Establish permitted source usage and immutable provenance. No scraping/reproduction without rights review. |
| `review_status`, `reviewed_by_ref`, `reviewed_at`, `review_due_at` | A named human reviewer approves every release. |
| `distribution_state` | `draft`, `approved`, `retired`; only `approved` is visible to Clinic. |
| `safe_display_summary` | An approved, non-patient-specific label/link; never a dynamic patient recommendation. |

For example, Aegis may publish a record identified as `xerostomia-review-uk-v1`, but it must not say that a patient’s medicine caused dry mouth. Clinic matches its own coded data, surfaces a review prompt, and waits for clinician action.

### P2 — Versioned API surfaces to design, not implement prematurely

After P0, jointly contract-test these machine-authenticated, tenant-scoped, idempotent endpoints:

| Capability | Aegis command / response boundary |
|---|---|
| Source metadata | `GET /v1/governance/baseline-releases?jurisdiction=uk_gb`; response carries only approved versioned source metadata and safe link/label. |
| Approved education delivery | `POST /v1/education-deliveries`; accepts opaque recipient/case refs, approved content ID/version, valid channel preference and idempotency key. Returns a delivery/preference receipt, never a clinical trigger. |
| Consent package | Existing v1 consent contract remains: controlled procedure/context codes selected by Clinic, no raw clinical prose, no Aegis risk inference. |
| Passport artifact | `POST /v1/passport-artifacts`; accepts a scoped, clinician-verified export manifest/hash. Returns a versioned artifact/share/verification receipt. No raw patient chart, images or public patient QR payload. |
| Research kit logistics | `POST /v1/research-kit-events`; accepts opaque study/case refs, kit/lot/location event and idempotency key. It must reject observation values and clinical interpretation. |
| Receipt reconciliation | `GET /v1/receipts/{opaque_id}` and signed outbox events with correlation IDs. Clinic projects `complete`, `pending`, `unavailable`, `unknown` or `review required`; no silent success. |

### P3 — Durable operational events

Source metadata refreshes, delivery retries, inventory/lot receipt events and webhook reconciliation must run as durable application jobs/outbox handlers after portable deployment. They may create human review tasks, but must not automatically publish a changed clinical rule, send chart-driven marketing, issue a consent, place an order, take payment, reserve stock, or modify a patient clinical record.

| Option | Trade-offs | Cost | Setup complexity |
|---|---|---|---|
| Curated source release | Slowest but offers clearest rights and named clinical/counsel approval. Best initial route. | Low operational cost. | Low. |
| Source-change monitor → review queue | Faster notice of permitted-source changes, but needs durable jobs, retention rules and reviewer evidence. | Moderate engineering/governance cost. | Medium. |

## Contract test matrix before a live connection

1. Different Clinic tenants cannot fetch source releases, education receipts, kit events or artifacts across scope.
2. Unknown, retired, unapproved or rights-unconfirmed source releases fail closed.
3. Repeating a command with the same idempotency key returns the canonical receipt only.
4. Aegis rejects raw medical history, medication names, symptom text, diagnoses, measurements, free-text clinical notes, image/scan bytes and sequential Clinic IDs where opaque references are required.
5. A source release cannot independently create a Clinic prompt, referral, consent package, patient message or clinical decision.
6. Clinic records `unknown` on response timeout and reconciles from a signed receipt/event; it never assumes delivery/signing/stock status.
7. A withdrawn research consent blocks new research-kit linkage and Clinic research-observation commands without altering historical immutable records.
8. A delivery command without an approved content version and valid preference is rejected.
9. Procurement remains assisted request/invoice/pro-forma only; no supplier-order/payment/substitution operation is permitted in this integration.

## Do not build from this handover

Do not build an AI patient chat, generated patient education, automatic menopause/cancer/MRONJ/NO risk scores, dynamic clinical/legal prose, a guideline scraper that self-publishes patient-facing rules, nitrate/nitrite diagnostic claims, product recommendation, supplier auto-order, payment, or a shared cross-product patient database.

## Collaboration sequence

1. Clinic maintains synthetic bounded records and mock contract tests.
2. Aegis completes P0 portability and proves tenant/idempotency/outbox behaviour.
3. Teams review the P1 payload schemas and source rights with clinical/counsel owners.
4. Teams implement only source-release retrieval and receipt reconciliation in staging.
5. Education delivery, passport artifacts and research-kit logistics follow only after the relevant governance gates and end-to-end fail-closed tests are green.

**Signed by the Clinic workstream:** Manus AI  
**Handover version:** `1.0`
