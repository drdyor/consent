# Aegis governed education and guideline-source architecture

**Status:** Scope and design decision. This is not an activation plan, clinical protocol, legal opinion, medical-device classification, or licence approval.

## Direct answer

**Yes—Aegis should provide the governed education/source component, but not a clinical recommendation engine.** Aegis can hold reviewed resource metadata, source provenance, rights/permission status, jurisdiction/language versions, and immutable delivery/acknowledgement evidence. The Clinic application decides whether a particular patient should see a resource and records clinician authorisation; an approved future Aegis delivery service may then perform the exact authorised operational action and return an auditable receipt.

In the consent experience, Aegis may present an approved **patient-information addendum** or a stable resource link that is bound to the consent snapshot. It must remain a separate, versioned information artefact—not automatically generated medical advice and not a hidden basis for treatment/referral decisions.

> **Clinic decides what is medically relevant. Aegis makes only the approved operational consequence happen—and proves the governed resource, consent, device, lot, delivery, and audit record.**

## Three viable delivery options

| Approach | What it provides | Trade-offs | Cost | Setup complexity |
|---|---|---|---|---|
| **A. Review-and-link registry** | Aegis stores only source metadata, summary written by an authorised editor, attribution, jurisdiction/language, review status, and a canonical publisher link. Clinic opens the resource and records its clinician-approved selection. | Fastest and lowest rights risk; no offline/full-text experience; less structured than a licensed feed. | Lowest ongoing cost. | Low–medium. |
| **B. Licensed syndication registry** | Aegis ingests approved publisher content through a signed licence/API, tracks exact source/version/territory, creates a human review queue, and exposes a constrained resource API to Clinic. | Better user experience and change detection; needs cyber-certification, publisher agreement, secrets, territorial controls, attribution, clinical reviewers, and a content-operations process. | Licence/compliance and operating cost. | Medium–high. |
| **C. Clinical policy and decision-support service** | The clinical product maps approved policy rules to encounter data and clinician review; it may reference Aegis source/resource versions. | Highest clinical, regulatory, safety, privacy, and validation burden; should be a separate programme, not a consent/shop extension. | Highest cost. | High. |

The immediate product decision is between **A** and **B**. **C** stays outside Aegis Consent + Shop unless a separately governed clinical-decision-support programme is approved.

## Source access: why “scrape the yearly guidelines” is not the right requirement

The correct requirement is **“monitor legitimate publisher sources for changes and route them through a human review workflow.”** The acquisition method depends on the source’s rights and technical interface.

| Source type | Aegis position | Required control before use |
|---|---|---|
| NICE published guidance | A licensed syndication route is available. NICE states that access is subject to agreement/licence and that end-user AI use must use the API. [1] | Signed licence, required cybersecurity assurance, approved API use case, server-side secret, territory controls, attribution, source/version tracking, and clinical review. |
| NICE Clinical Knowledge Summaries | NICE says CKS content is supplied by Agilio Software rather than the NICE API. [1] | Direct rights/API agreement with the relevant provider; no scraping or derivative use first. |
| Government material explicitly published under OGL | Potentially reusable subject to the licence conditions, attribution, and exclusions. [2] | Confirm the individual item is actually offered under OGL; retain attribution/licence and source-version evidence. |
| SDCEP | The programme’s stated position is that commercial use needs written permission. [3] | Written permission, scope check, and a reviewed no-modification/no-out-of-context workflow. |
| BSP | Its publication page restricts amendments/hosting and asks for written permission for reproduction in a publication. [4] | Written permission or link-only use; do not copy, transform, or host the content without cleared rights. |
| Other professional bodies, manufacturers, or regulators | Rights/format vary. | A source-access record must show permission/API terms, territory, permitted output, attribution, expiry, and owner before ingestion. |

Neither a language model nor a scheduled collector may convert acquired material into an active alert, policy, consent clause, referral text, course, patient education item, or recommendation automatically. The system should surface **“possible source change—human review required”** only.

## Aegis data model: governed resource registry

The following is a **future additive model**. It does not authorise any new clinical content or collect patient data.

| Entity | Key fields | Purpose and constraint |
|---|---|---|
| `educationSource` | publisher, canonical URL, jurisdiction, source type, rights basis, licence/permission reference, allowed territory, access method, attribution, expiry, status | Establishes whether Aegis may reference, ingest, transform, or merely link a source. |
| `educationResource` | stable resource key, source ID, language, audience, content classification, source version/effective date, review state, patient-safe summary ID, full-text pointer where licensed | One governed resource version. No inferred patient state or recommendations. |
| `resourceReview` | source/resource revision, reviewer role, clinical owner, jurisdiction owner, decision, rationale, timestamp | Human governance and change control; two-person review for patient-facing material. |
| `consentResourceAttachment` | consent ID, resource key/version/hash, relation (`pre_procedure_information`, `aftercare_information`, `external_reference`), display state | Binds an approved resource to an exact consent snapshot without altering the signed consent later. |
| `resourceSelectionReceipt` | origin app/tenant, opaque subject/case reference, resource version, clinician authorisation, optional delivery-capability reference, sent/viewed/failed events, correlation ID | A cross-product evidence trail that retains opaque references only. Clinic owns underlying clinical facts and determines communication appropriateness. |
| `sourceChangeCandidate` | source ID, detected metadata/version, retrieval timestamp, diff reference, proposed status, reviewer queue state | Review queue; never an automatically active care rule. |

All identifiers are immutable. A correction/new version creates a new record; historical resource/consent associations stay visible. Rights/licence data is operational data, not patient data. No external provider secret belongs in the database; it must be managed separately as a server-side secret.

## Consent-to-education interface

Aegis must not inspect the clinical chart to decide which education a patient needs. The safe interface is an explicit clinician selection from Clinic, using only controlled identifiers.

### Request: attach an approved resource

| Field | Example | Aegis validation |
|---|---|---|
| `contract_version` | `education-v1` | Reject unknown versions. |
| `origin_app`, `origin_tenant_ref` | `dental`, opaque tenant reference | Authenticated and tenant-mapped; no display names. |
| `correlation_id`, `idempotency_key` | UUIDs | Replayed request returns the original receipt. |
| `aegis_consent_id` | opaque Aegis ID | Must be a valid draft/sent package in the same tenant. |
| `resource_key`, `resource_revision` | `implant-aftercare-uk-en`, `7` | Must be approved, in date, language/jurisdiction eligible, and rights-permitted. |
| `relation` | `pre_procedure_information` | Enumerated; template must permit it. |
| `clinician_selected_at` | ISO timestamp | Must be supplied by Clinic and audit-bound. |
| `origin_case_ref`, `subject_ref` | opaque references | Optional reference-only correlation; no patient chart content. |

**Rejected input:** diagnosis, medications, GLP-1 status, menopause/HRT status, bone density, imaging, lesion/photo data, clinical scores, treatment plan narrative, referral body, generated patient text, or any unbounded free text. A future Aegis delivery service may receive a purpose-bound, encrypted delivery capability only after the Clinic has recorded a clinician authorisation and independently validated the relevant communications authority; it must never receive unrestricted chart data to decide whether to send.

### Response: deterministic receipt

`resource_attachment_id`, `resource_key`, `resource_revision`, `resource_hash`, `review_state`, `display_url_or_embedded_document_reference`, `attribution`, `expires_at` (where applicable), and `correlation_id`.

The clinical app displays the exact resource or explicitly instructs an approved Aegis delivery service to deliver it. Aegis seals the resource version/hash into the consent snapshot only when the consent is subsequently signed. Later resource updates do not rewrite the historical signed snapshot. Delivery is disabled by default and cannot alter a consent, create a referral decision, or substitute a clinical review.

## Human review and language controls

Patient-visible education must be more controlled than an internal source link. Each resource should have separate clinical-content approval, legal/regional approval where needed, language review, and rights/attribution approval. Machine translation may prepare a draft only; it cannot become patient-visible until a qualified human reviewer approves that language/version.

The resource selector defaults to the consent’s jurisdiction and language. It must show a clear **unavailable** state rather than silently substituting English, another country’s advice, or a newer unreviewed edition. The default fallback is a canonical external link where rights allow—not generated summary text.

## What Aegis should explicitly not implement in this programme

1. No system that assesses a patient’s medication, sex, age, symptoms, medical history, imaging, lesion, bone level, or saliva result to infer health status.
2. No algorithmic risk score, survival prediction, cancer-screening/triage classification, referral prompt, recommended recall interval, procedure change, HRT/DXA suggestion, or patient-specific medical advice.
3. No automatic patient email/SMS/push message. Clinic must classify the purpose, validate communications authority, and require clinician approval before any Aegis delivery request; Aegis cannot make this choice itself.
4. No unlicensed copying, scraping, transformation, or model training using NICE, SDCEP, BSP, or any other restricted source.
5. No diagnostic or IVD product listing, white-labelling, test-result interpretation, medical claim, research-data collection, or purchase flow for saliva/nitrite products under the education/consent/shop workstream.

The final point is important: an analytical saliva device and its supporting software are a separate regulated-product and research programme. EU IVDR is the EU in-vitro diagnostic medical-device regulation. [5] MHRA’s Great Britain guidance covers IVD sale/supply, assessment, and in-house manufacture, and identifies IVDs as medical devices in the UK regime. [6] [7] This must not be represented as an ordinary shop consumable or embedded in a consent rule without an intended-purpose/classification, quality, evidence, clinical-evaluation, data-protection, market, and intellectual-property review.

## Approval gates before any build is switched on

| Gate | Evidence required | Owner |
|---|---|---|
| Source rights | API/permission/licence, allowed territory, permitted transformations, attribution wording, renewal date | Content operations + legal counsel |
| Clinical validity | Named clinician/editorial board, use purpose, patient audience, source-to-summary review | Clinical governance |
| Consent use | Template revision, jurisdiction/language eligibility, resource relation, legal/clinical approval | Aegis consent governance |
| Privacy | Data-flow map, minimisation, special-category basis where relevant, preference/purpose separation, DPIA trigger assessment | Privacy lead/DPO |
| Security | Service identity, scoped machine credential, secret storage, tenant isolation, audit/replay tests | Security/engineering |
| Operational readiness | Review SLA, expired/revoked content state, incident/rollback path, named reviewers | Operations owner |
| Patient communication | Clinical approval workflow, care/marketing classification, preferences, no sensitive subject-line policy, delivery audit | Clinic communications owner |

## Implementation sequence

1. **Decide A or B.** Do not begin an agentic guideline collector until the rights route is chosen.
2. Build the **Aegis source/resource metadata registry** and manual review queue using only source links and approved internal summaries.
3. Implement the `education-v1` reference-only contract and immutable attachment receipt; add contract tests proving it rejects clinical data and free text.
4. Add controlled consent attachment/display, source-version/hash snapshotting, and export evidence.
5. Obtain source-specific rights. If NICE applies, apply for an appropriate test licence and document the intended end-user/AI use exactly as NICE requires. [1]
6. Only after review/SLA/rights controls are working, add a licensed source connector or permitted metadata monitor. It emits a review task—not a clinical rule update.
7. Treat patient communications, Clinic clinical-policy logic, a patient passport, diagnostic/IVD research, and any agent with external effects as **separate approvals and workstreams**.

## References

[1] [NICE, *NICE syndication API*](https://www.nice.org.uk/reusing-our-content/nice-syndication-api)

[2] [The National Archives, *Open Government Licence v3.0*](https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/)

[3] [SDCEP, *Copyright*](https://www.psm.sdcep.org.uk/about/copyright/)

[4] [British Society of Periodontology and Implant Dentistry, *Publications*](https://www.bsperio.org.uk/professionals/publications)

[5] [Regulation (EU) 2017/746, *In vitro diagnostic medical devices*, EUR-Lex](https://eur-lex.europa.eu/eli/reg/2017/746/oj/eng)

[6] [MHRA, *In vitro diagnostic medical devices: guidance on legislation*](https://www.gov.uk/government/publications/in-vitro-diagnostic-medical-devices-guidance-on-legislation)

[7] [MHRA, *Regulating medical devices in the UK*](https://www.gov.uk/guidance/regulating-medical-devices-in-the-uk)
