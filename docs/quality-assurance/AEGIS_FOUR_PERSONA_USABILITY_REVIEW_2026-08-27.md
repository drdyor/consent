# Aegis Consent: Four-Persona Usability Review

**Date:** 27 August 2026  
**Method:** Structured role walkthrough and code/route review; this is **not** research with four real users.  
**Evidence:** The 81-test Vitest suite passed at the reviewed build. The consent creator, review-governance, supplier-governance, and record routes were visually inspected at desktop size. The protected routes correctly refused unauthenticated access. No patient, supplier, or live third-party account was used.

> **Interpretation rule:** “Works” means that an implemented, permissioned workflow exists when the prerequisite configuration and authorised role are present. It does not mean that a clinical, legal, regulatory, commercial, or production-integration outcome has been certified.

## Executive outcome

The product is strongest as a **governed operational workspace**. The core consent, product/lot, source, immutable-signature, supplier-evidence, and reviewer/source-link concepts are implemented with clear safety boundaries. The main risk to day-one usability is that a newly configured clinic can encounter empty states without a guided onboarding sequence that makes the required setup order obvious. The principal production gap remains portable infrastructure and machine-to-machine authentication, not a missing browser screen.

| Persona | Primary goal | Walkthrough result | Current judgement |
|---|---|---|---|
| Practitioner | Assemble and send a traceable aesthetic or dental consent. | **Conditionally complete.** The guided creator supports module, template, primary/supplementary materials, lot/expiry, optional approved external links, review, and electronic signature flow. | Good core flow; configuration and dental-site precision need attention. |
| Clinic governance administrator | Approve sources, assign reviewers, govern link-only educational resources. | **Conditionally complete.** Role-scoped roster, resource registration, immutable reviews, jurisdiction/language/version metadata, and retirement are present. | Robust governance model; setup experience is manual and fragmented. |
| Supplier-operations administrator | Maintain evidence, reconcile purchasing/stock, handle incidents and corrective actions. | **Conditionally complete.** Evidence quarantine, expiry control, PO receipt/reconciliation, performance/incidents, audit packs, and corrective-action capability links are present. | Strong internal control surface; deliberately not a live procurement marketplace. |
| Clinic integration operator | From a locked clinical-plan workflow, obtain governed package/readiness facts and make a non-binding operational request. | **Prototype/internal seam only.** Controlled reference, tenant, evidence, lot, idempotency, location, and draft-request controls exist. | Correctly fail-closed; blocked for production until portable API/auth/outbox work is complete. |

## Persona 1 — practitioner: “Create a defensible dental implant consent”

### Goal

Dr. A needs to choose an approved dental procedure form, record the actual implant-related materials and lot/expiry details, optionally attach a clinician-chosen reviewed external information link, send the package, and preserve the final signed consent.

### What Dr. A can do

The **Create consent** route is a clear three-step flow. It distinguishes aesthetic, dental/implant, and future medical modules; filters templates by module, clinic jurisdiction, and language; requires a primary material plus actual supplementary materials; and asks for lot/expiry traceability. A clinic inventory lot can populate the trace fields, while manually entered exceptional stock remains distinguishable. The review stage explains that approved external information links are optional, clinician-selected, and separate from product disclosures. The review/signing flow maintains mandatory acknowledgement for source-linked disclosures and seals material/lot/source information with signature data.

For a signed record, the printable export retains the immutable consent snapshot and labels external links as **supplementary information**, rather than misrepresenting them as clinical advice or a required risk acknowledgement.

### Where Dr. A is likely to struggle

| Observation | Why it matters | Recommended next change |
|---|---|---|
| The new/empty clinic view has no active template or fully approved source by default. | A clinician can reach the builder but cannot progress until governance setup is complete. | Add a practitioner-safe setup callout that names the exact administrator prerequisite: active template, patient-ready source, and (where relevant) approved link. |
| The dental “treatment site” control is broad (`tooth-site`, maxilla, mandible, sinus, oral soft tissue). | It is useful for consent categorisation but is not a precise tooth/implant-position manifest. | Keep detailed tooth/site provenance in Clinic. Add an optional controlled site-reference handoff only after the portable integration contract is live. |
| The Medical module card is visible despite no usable medical pack being expected. | It signals future scope but may feel like a failed selection. | Disable it with a “No governed packs yet” label, or keep it as a clearly marked roadmap item. |
| Optional external links sit after material selection. | The distinction is correct, but a busy clinician may miss the optional resource section. | Add a compact selected-link count beside the step header and surface it in draft review. |
| The printable output is a signed electronic record. | It is printable, but a paper/wet-signature workflow is not active. | Implement a separately reviewed hash-bound print package and append-only witnessed physical-signature event; do not overwrite an electronic snapshot. |

### Deliberate limits

Dr. A cannot ask Aegis to infer risk from history, medication, symptoms, imaging, CBCT, bone-density, cancer, or treatment-plan prose. Aegis also does not choose an education link for a patient. Those are clinical-app responsibilities and should remain human/clinician led.

## Persona 2 — clinic governance administrator: “Approve a canonical NICE link and accountable reviewers”

### Goal

Alex, a clinic administrator, needs to assign clinical, legal, and source-rights accountability; register a canonical external link with jurisdiction/language/version/rights metadata; collect independent reviews; and make the link eligible for clinician attachment to a consent.

### What Alex can do

The **Review & resource governance** workspace permits an administrator to assign a responsibility to an existing clinic member, register a canonical HTTPS link, choose its intended audience, record a rights basis, and define the required review roles. Reviewers then append a decision and evidence note. A resource becomes `approved_reference_only` only when the required review responsibilities agree; retirement retains historic review evidence. The interface directly states that it stores no copied guidance, patient triggers, symptoms, medicines, clinical rules, or guideline interpretation.

This is a good fit for the link-only approach: it preserves the publisher link and human decision trail without asserting a license to ingest, reproduce, summarise, or scrape the publisher’s content.

### Where Alex is likely to struggle

| Observation | Why it matters | Recommended next change |
|---|---|---|
| Members must already exist before a reviewer can be assigned. | Administrators may expect the screen to invite a reviewer. | Add a clear “manage clinic membership first” route/action and a small roster/onboarding checklist. |
| Multiple responsibilities require repeated assignments. | One reviewer may legitimately cover more than one governed responsibility. | Add a bulk multi-role assignment control and a visible responsibility matrix. |
| The registry uses free-text publisher, version, jurisdiction, and rights reference fields. | Flexible inputs enable varied sources but introduce consistency risk. | Add controlled publisher/jurisdiction suggestions and a lightweight duplicate/version warning without ingesting source content. |
| There is no work queue by overdue review, changed source version, or incomplete role. | A large clinic can lose sight of what blocks patient-ready use. | Add a review-status queue filtered by `under_review`, `changes_requested`, role, jurisdiction, and version currency. |

### Deliberate limits

Alex cannot upload or scrape NICE guidance into Aegis, activate a patient communication, or convert an external link into a clinical protocol. Any future publisher API or licensed-content workflow needs its own rights review and activation decision.

## Persona 3 — supplier-operations administrator: “Reconcile a received lot and control supplier evidence”

### Goal

Morgan needs to store distributor/CE/IFU/appointment evidence, monitor expiry, record a purchase order and receipt, reconcile the received line to an inventory lot, and manage a quality or traceability incident without exposing unscanned documents.

### What Morgan can do

The **Supplier governance** workspace provides the broadest operational tooling: private evidence registration, expiry policy and in-app reminders, controlled manual scan, purchase-order and partial-receipt states, inventory-lot reconciliation, performance reviews, incident management, corrective-action capability links, audit-pack exports, and attachment quarantine. Configuration states explicitly show when external email/webhook delivery or scanning configuration is required rather than silently pretending a notification was sent.

### Where Morgan is likely to struggle

| Observation | Why it matters | Recommended next change |
|---|---|---|
| The space is administrator-only. | This is appropriate for governance, but operations staff may be blocked if roles are not configured. | Add a distinct operations role or carefully scoped delegated permissions after an access-control review. |
| Purchase-order registration is internal recordkeeping, not connected purchasing. | A user could expect a PO action to order from a supplier. | Rename the main action to “Record purchase order” consistently and retain the “no supplier/payment action” banner in procurement surfaces. |
| External email/webhook delivery remains configuration-gated. | Operators cannot assume a reminder leaves the app. | Surface a clear delivery-readiness badge and a tested destination confirmation when future credentials are configured. |
| Per-product/location reorder policy is not configured. | Low-stock cannot reliably be labelled. | Add an explicit, reviewed threshold policy model before any low-stock suggestion or agent proposal is promoted. |

### Deliberate limits

Morgan cannot place supplier orders, send purchase commitments, take payment, mark an invoice paid, promise price/availability, or run automatic procurement. Corrective-action sharing is the only supplier-facing capability, and protected document retrieval remains gated by scan status and clinic administrator access.

## Persona 4 — clinical-app integration operator: “Prepare consent and readiness from a locked Clinic plan”

### Goal

Sam operates the separate Clinic application. After its clinicians lock a controlled materials manifest, Sam needs Clinic to request two independently visible Aegis outcomes: a governed consent-package draft and per-item supply-readiness facts. If supplies are absent, Clinic may create a non-binding Aegis procurement/invoice request for an authorised Aegis address preset.

### What Sam can do today

The internal Aegis contract validates opaque references; maps an origin tenant to the Aegis clinic; checks product/source/lot/expiry/quantity facts; enforces jurisdiction/language/template/module gates; returns item-level readiness; creates idempotent tenant-scoped ledger/audit records; and allows only immutable address presets plus non-binding request states. It blocks raw diagnosis, clinical notes, imaging, medication, plan prose, prediction, and generated consent language. The contract correctly requires Clinic to show consent-package and readiness outcomes separately.

### What is blocked, and why

| Blocker | Current behaviour | Required work before production use |
|---|---|---|
| Portable integration API | The implementation is a protected internal typed procedure. | Versioned HTTP/OpenAPI adapter, public IDs, compatibility fixtures, and contract tests. |
| Machine identity | Managed browser/workspace identity is not a portable cross-product credential. | Scoped service principals, tenant/location/resource grants, secret rotation/revocation, and audit. |
| Events | Ledger state exists; signed durable outbox/webhook delivery is not activated for this contract. | Replay-safe signed events, delivery audits, ordering/sequence rules, and failure handling. |
| Live signing | Returned package status is draft; signing capability is `not_issued`. | A separately reviewed patient-signing capability, consent receipt protocol, and immutable event contract. |
| Commercial action | Requests stop at draft/request-invoice/pending approval. | No change unless authorised supplier integrations, legal operating model, and explicit human approval controls are in place. |

## What is working versus what is not

| Capability area | Works now | Not working / intentionally unavailable |
|---|---|---|
| Governed consent | Templates, product sources, disclosure gates, lot/expiry/material schedule, electronic review/signature, immutable snapshots, PDF, withdrawal/audit foundations. | Country-specific legal sufficiency certification; wet-signature workflow; clinical diagnosis/risk decision. |
| Dental/Aesthetic modules | Separate module fields and source/template matching; dental material schedules. | Precise clinical tooth/implant planning or CBCT workflow inside Aegis. |
| Education links | Human-reviewed, versioned, language/jurisdiction-matched canonical links; optional consent attachments; no copied content. | Scraping, content ingestion, automatic resource choice, clinical guideline engine, patient messaging. |
| Malta/market control | Explicit market/economic-operator/product-evidence gates; fail closed. | Legal/commercial compliance conclusion or automatic regulatory eligibility assertion. |
| Supplier operations | Evidence, quarantine, expiry, reconciliation, incidents, corrective actions, audit exports. | Supplier ordering, payment, marketplace checkout, autonomous procurement. |
| Clinic interoperation | Internal controlled-reference contract, idempotency, inventory facts, address presets, non-binding procurement request. | Portable API, service-principal auth, durable events, live external signing, live supplier calls. |
| Independent recoverability | GitHub sync branch, verified Git bundle/source archives/migrations/checksums, recovery instructions, managed checkpoint. | Self-operating production deployment without a separately provisioned database, storage, auth, secrets, hosting, and data export. |

## Prioritised next improvements

1. **Day-one configuration guide.** Add an explicit admin setup sequence: create clinic profile → member/role setup → approved source/template → inventory lot → reviewer roster → external resource review. This is the greatest usability improvement for a new clinic.
2. **Clinical handoff precision.** Keep structured tooth/site and plan data in Clinic; design the future portable reference-only consent-resource call after service-principal authentication is available.
3. **Resource-governance queue.** Add incomplete-review, stale-version, retired-link, and jurisdiction/language filters so governance scales beyond a small clinic.
4. **Role model review.** Decide whether operations staff should have a carefully limited supplier/reconciliation role rather than requiring full clinic-admin access.
5. **Paper-signature protocol.** Treat it as a discrete legal/clinical design project: hash-bound print package, witnessed append-only event, scan/retention policy, jurisdiction review, and clear non-claim language.

## Validation limits

The role walkthrough did not create or alter real patients, suppliers, orders, payments, external accounts, clinic documents, or regulated content. It also did not substitute for moderated usability research, legal review, clinical governance, security testing, country-specific regulatory analysis, or production disaster-recovery testing. The next evaluation should use a sandbox clinic with authorised non-production test records and named representatives from all four roles.
