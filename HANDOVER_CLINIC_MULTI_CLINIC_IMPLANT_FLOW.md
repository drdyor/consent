# Handover — multi-clinic implant workflow: clinical dashboard to Aegis operations

**Audience:** the team building `drdyor/consent` (Aegis Consent + Shop) and the team building the separate clinical products, starting with Dental Telemed.

**Decision:** Dental, Aesthetics, and MD remain independently shippable clinical products. Aegis is their governed consent and operations hub. Each clinical product owns its patient record and encounter; Aegis owns template/product/lot governance, consent of record, stock/procurement, and the future B2B shop.

> This handover maps operational software behavior. It does not define clinical indications, implant size, placement, anatomy interpretation, consent wording, pricing, payment collection, or regulated-distribution authorization. Those remain clinician/counsel/operator decisions.

## 1. The one screen an implant dentist and staff should understand

The clinical dashboard owns the **case journey**. It should render an implant case as a calm, explicit series of states; it must never show an assumed signature, stock reservation, supplier order, or shipment as fact until Aegis returns the corresponding receipt.

| Dashboard card | What the dentist/staff sees | Clinic backend responsibility | Aegis response required |
|---|---|---|---|
| Case header | Patient within this clinical product, location selector, case reference, appointment state, assigned clinician/staff. | Load clinical patient/case/appointment from the clinic’s own tenant-scoped database. | None. Aegis never needs the full clinical patient chart. |
| Consent | `Not requested`, `Generating`, `Draft ready`, `Sent for signature`, `Signed`, `Outcome unknown`, `Withdrawn/review`. | Render the exact Aegis package natively and store only its immutable receipt projection. | Package ID, template revision, document hash, status, capability expiry, signed receipt, and withdrawal/freshness events. |
| Materials readiness | `Not checked`, `Ready`, `Attention required`, `Blocked`, `Reserved`, `Consumed/confirmed by staff`. | Render only results for a clinician-authored **materials manifest**; link alert to this case but do not decrement stock locally. | Per-item product/lot state, operational warning/block reason, source revision, optional reservation reference. |
| Procurement | `No action`, `Draft request`, `Awaiting approval`, `Invoice requested`, `Invoice issued—not collected`, `Supplier order accepted`, `In transit`, `Received`, `Exception`. | Show selected delivery clinic/preset, staff requester, and case link. Do not expose supplier credentials. | Purchase/invoice request reference, selected operator-managed supplier, item snapshot, address preset, status history, and receiving record. |
| Surgical readiness | Consent result, materials result, staff checklist, visit status. | Enforce workflow gates selected by clinic policy; preserve clinician decision and history. | Exact consent receipt and confirmed/allocated operational material record, if policy requires it. |

The clinical user sees **operational facts**, not inferred medical advice. For example, Aegis may say “selected lot is expired/unavailable” or “stock level is below the office’s defined threshold.” It may not say an implant is clinically unsuitable, calculate nerve proximity, infer medication risk, or auto-write new risk content from clinical values.

## 2. Start-to-finish implant workflow

### Scenario A — single implant, materials available

| Step | Frontend behavior | Backend/data behavior | Resulting state |
|---:|---|---|---|
| 1 | Dentist opens a synthetic or authorized clinical implant case and picks **Prepare consent and materials**. | Clinic has a clinician-authored, versioned **case material manifest** containing controlled procedure/site/product/option references. It does not send clinical narrative, scan/image bytes, anatomy measurements, diagnosis, or medication data to Aegis. | `case.materials_manifest_ready` in clinic. |
| 2 | Consent card shows `Generating`; materials card shows `Checking`. | Clinic generates one correlation ID and submits the same controlled material references to Aegis. Aegis authenticates service principal → origin app → tenant; rejects a caller-chosen tenant mapping. | Aegis accepts or rejects independently auditable commands. |
| 3 | Consent card displays Aegis-governed procedure name, approved static sections, required acknowledgements, template revision, and `Draft ready`. | Aegis validates template + procedure + jurisdiction + human-approved language + product source/evidence + lot state; persists `clinicConsentPackage` as `draft` with document hash/idempotency key. | No signature claim. |
| 4 | Materials card shows `Ready`, each linked product/lot status, and a `Reserve for case` option when that Aegis policy exists. | Aegis returns current product/lot snapshot and case-supply readiness. It does not choose components; it verifies availability of what a clinician/staff member selected. | Staff can proceed to signing without an order. |
| 5 | Staff reviews then sends to the patient from the clinic-native view. | Clinic submits Aegis package reference; Aegis creates a single-use/time-boxed signing capability and transitions package/record per consent policy. | `Sent for signature`. |
| 6 | Patient signs in the native clinical experience; dashboard refreshes after receipt. | Aegis checks exact document hash, capability expiry/single use, required acknowledgements, and signing input. It seals the authoritative snapshot and emits receipt/event. | `Signed` only after authoritative receipt. |
| 7 | On treatment day, staff scans/selects the actual lot and records operational confirmation. | Aegis records an auditable reservation/consumption movement only under its stock policy. Clinic records clinician-authored procedure-performance note separately. | Traceable operational and clinical records; no local stock shadow ledger. |

### Scenario B — multi-unit/full-arch case, missing material

The clinical material manifest may list all component references that the clinician/staff has intentionally selected. Aegis evaluates **each named item** under tenant-specific inventory rules. It returns a structured case-supply result, which may include `ready`, `attention_required`, or `blocked`. The classification is an operational rule determined by office policy—not a medical judgement—and must display its reason and policy version.

| Step | What changes in dashboard | What Aegis does | Safety rule |
|---:|---|---|---|
| 1 | Materials card marks the missing component `Blocked` with “quantity unavailable” or “expired lot; replacement required.” | Generates no local product substitute; returns availability, source version, and permitted supplier catalogue choices if enabled. | Never recommend a clinical substitution. The clinician chooses a permitted alternative, then restarts governed checks. |
| 2 | Staff selects **Create procurement request**. The address picker shows only active stored delivery presets for clinics they are authorized to operate. | Aegis creates an auditable draft linked to `origin_case_ref`, not to a patient name. | Default delivery address comes from the selected Aegis clinic preset; client-side free-text shipping data is not the source of truth. |
| 3 | Staff selects either `Request invoice` or `Prepare order for approval`. | Aegis locks the supplier/item/lot/catalogue snapshot and creates a request. | **No payment or charge path.** “Mark paid” must not trigger a supplier order in version 1. |
| 4 | Procurement card shows one of `Invoice requested`, `Invoice issued—not collected`, or `Awaiting internal approval`; consent can stay `Draft ready` or `Sent` but surgical workflow remains blocked by the office’s supply-readiness policy. | Aegis produces a pro-forma/invoice-request artefact only if operator-approved commercial data exists; it does not take a payment or assume supplier acceptance. | Do not promise delivery date, price, contract entitlement, or supplier availability as a fact unless returned by an authorized integration. |
| 5 | When staff receives goods, they use **Scan and receive**. | Aegis validates received line, quantity, lot, expiry, evidence/lot state, and records a new stock lot/movement. It resolves or updates the case alert. | A scan/receipt is a stock event; it is not proof that a clinical item was used. |

## 3. What happens in code: dashboard → backend → data

```mermaid
sequenceDiagram
    participant UI as Clinical dashboard
    participant C as Clinic backend
    participant A as Aegis API / operations hub
    participant D as Aegis Postgres + object store

    UI->>C: clinician locks controlled material manifest
    par governed consent package
        C->>A: POST /v1/consent-packages (opaque refs + idempotency key)
        A->>D: validate source/lot/template; persist draft package
        A-->>C: draft ID, template revision, document hash, expiry
    and availability snapshot
        C->>A: GET /v1/governed-products + case material refs
        A->>D: validate tenant, evidence, lot expiry, quantity
        A-->>C: operational readiness result + revision
    end
    C-->>UI: native consent + materials dashboard cards
    UI->>C: send/sign or create invoice request
    C->>A: controlled signing / procurement command
    A->>D: append audit/status/receipt or request record
    A-->>C: signed receipt, event, or request status
    C-->>UI: reconciled dashboard state
```

The current pre-portability Aegis code introduces a `clinicIntegration` tRPC router with `syncGovernedProducts` and `createConsentPackage`. Its new `clinicConsentPackages` table records a draft package and enforces unique `clinicId + originApp + idempotencyKey`. It is a **synthetic bridge seam**, not a production network API: it is still inside Manus-authenticated tRPC and MySQL. The portable v1 REST/OpenAPI equivalent is described in the migration runbook.

## 4. API responsibilities and exact payload boundaries

### 4.1 Clinic → Aegis: package generation

The request must be data-minimized and typed. The `subjectRef` is a per-clinical-app, per-tenant opaque reference; it is not a cross-product global patient identifier. The authenticated Aegis service principal determines the actual Aegis clinic/tenant mapping.

```json
{
  "contractVersion": "v1",
  "originApp": "dental",
  "originTenantRef": "opaque-origin-tenant-ref",
  "correlationId": "opaque-correlation-ref",
  "idempotencyKey": "opaque-idempotency-ref",
  "originCaseRef": "opaque-implant-case-ref",
  "subjectRef": "opaque-dental-subject-ref",
  "procedureKey": "controlled-implant-procedure-key",
  "jurisdiction": "MT",
  "language": "en",
  "catalogueItemRef": "opaque-aegis-product-ref",
  "lotRef": "opaque-aegis-lot-ref",
  "treatmentSiteRefs": ["fdi-11"],
  "disclosureChoiceIds": ["controlled-option-ref"]
}
```

**Do not send:** a patient chart, clinician note, image/CBCT/IOS file, diagnosis, measurements from image interpretation, medication list, automated clinical risk decision, supplier pricing, or text that asks Aegis to generate legal/clinical language. Where a consent needs a specific clinician/counsel-approved disclosure selection, represent it as a controlled choice ID mapped to a governed template block.

### 4.2 Aegis → Clinic: draft package and receipt

| Response field | Meaning | Dashboard rule |
|---|---|---|
| `aegisConsentId` | Opaque public package/record reference. | Store with correlation ID; never replace with a client-generated ID. |
| `status` | `draft`, `sent`, `signed`, `voided`, or `unknown`. | Only `signed` plus verified receipt satisfies an exact consent gate. |
| `templateRevision`, `productRevision`, `renderedDocumentHash` | Immutable provenance for the rendered package. | Show revision to authorized staff; signing fails if document hash changes. |
| `expiresAt`, signing capability metadata | Signing time-box. | Show expired/reissue state; never reuse a patient capability. |
| `signedAt`, `snapshotHash`, `notaryStatus`, archive reference | Authoritative signing receipt. | Display only after Aegis sealing succeeds; clinic stores receipt projection not a mutable copy. |
| `eventId`, event type, event signature | Withdrawal/freshness/signing event. | Deduplicate by event ID; move affected case to review/block state according to local policy. |

### 4.3 Clinic → Aegis: supply readiness and procurement

The clinic sends a **materials manifest** selected by human users against governed Aegis catalogue references. Aegis returns operational state and optional reorder/request choices. This can happen in the same user action as package generation, but it should remain two independently idempotent commands or an Aegis orchestration endpoint with two explicit sub-results. Do not hide one result behind a vague single “success.”

| Command | Aegis owns | Clinic owns |
|---|---|---|
| `GET /v1/governed-products` / readiness check | Evidence eligibility, source revision, available usable lot count, expiry state, threshold/rule version, tenant scope. | Display, clinician/staff-selected manifest, case link, and local workflow gate. |
| `POST /v1/procurement-requests` | Supplier/product/catalogue snapshot, pre-set destination selection, operator approval state, invoice request, audit. | Staff intent, selected authorized clinic location, case correlation reference. |
| `POST /v1/invoice-requests` | Invoice/pro-forma request lifecycle; status `invoice-issued-not-collected`; document/archive. | Present and export request. No payment collection or “paid” trigger in version 1. |
| `POST /v1/receipts` / receiving confirmation | Purchase-order-line reconciliation, received quantity, lot/expiry, movement ledger, alert update. | Staff scanner action and discrepancy capture. |

## 5. Multi-clinic: address presets, permissions, and product scope

Every clinically visible location needs a corresponding Aegis operational clinic/location record. **Do not derive shipping address from browser fields at checkout.** Store controlled presets in Aegis and return only locations authorized for the service principal and selected business tenant.

| Required Aegis field | Purpose | Control |
|---|---|---|
| `clinic_public_id` / `location_public_id` | Opaque external references used in API and dashboard. | Never expose MySQL/PostgreSQL numeric IDs to clinical apps in production. |
| `shipping_address_revision` + structured address | Immutable selected-destination snapshot on a procurement request. | Address changes create a new revision; old request continues to show original revision. |
| `billing_contact_ref`, `default_supplier_ref`, `allowed_supplier_refs` | Operator-managed commercial routing. | Staff may select only enabled options; no supplier credential reaches the frontend. |
| `delivery_instructions`, `receiving_hours`, `legal_entity_ref` | Operational fulfilment data. | Changes are role-gated and audited. |
| `approval_policy_ref` | Defines whether a request is draft, approval-required, or (future) eligible for controlled submission. | Rules are operational, not clinical or payment rules. |

Current Aegis `clinics` data holds a name, address line, contact fields, jurisdiction, and compliance market. The Aegis team must extend it with structured address presets, location/clinic relationship, revisioned operational settings, roles, and an explicit approval policy in **shop foundation**, not as arbitrary fields supplied by the clinical application.

## 6. Automation: use “assisted operations” before agentic buying

The word *agentic* must not hide a supplier purchase, medical-device distribution decision, price promise, or stock substitution. The safe version 1 is an **assisted operations agent** that prepares an explainable request and stops at an authorization boundary.

| Mode | Allowed v1 behavior | Required human/contract boundary | Not allowed |
|---|---|---|---|
| Assisted reorder draft | Detects an Aegis-defined threshold; proposes a governed catalogue item, quantity, destination preset, and supplier option; links a case correlation reference. | Staff/authorized manager reviews and creates a request. | Supplier order transmission, payment, selecting a clinical substitution, or price comparison based on scraped/unverified data. |
| Invoice request | Creates a request for an operator-approved invoice/pro-forma and records `invoice-issued-not-collected`. | Supplier confirmation and commercial payment occur outside the v1 software payment path. | “Mark paid” button, card/bank collection, or auto-sending an order because a model inferred payment. |
| Controlled future submission | Only after regulated-distribution, supplier contract, approval, security, and auditable service-principal gates are approved. | Named operator policy, spend/quantity/supplier/location limits, review threshold, immutable decision log, and kill switch. | Autonomous supplier account action, buyer impersonation, or bypass of a required approval. |

For stock alerts and delivery updates, use the operations-hub outbox. After portability, expose signed webhooks or server-sent/polled status updates. The clinic dashboard should reconcile by correlation/reference and tolerate duplicate or out-of-order messages. Do not make browser WebSocket state the authoritative record.

## 7. Team hand-off: what Aegis must implement

### P0 — portability blocker (must complete before live integration)

1. Execute the existing de-Manus path: portable auth/service principals, PostgreSQL, S3/MinIO object store, scheduler, container deployment, migration rehearsal, and restoration rehearsal.
2. Introduce opaque public IDs and service-to-service scopes for origin application, tenant/location, and permission set.
3. Publish OpenAPI/JSON-schema from implementation and run the existing consent/supplier tests against PostgreSQL—not MySQL.

### P1 — govern the integration

1. Replace the pre-portability tRPC bridge with portable product/lot snapshot, package generation, status/receipt, signing-capability, and signed-event endpoints.
2. Keep the `clinicConsentPackages` draft projection separate from the immutable `consentRecords` signing lifecycle; establish idempotency/conflict behavior.
3. Add a structured `caseSupplyReadiness` projection that accepts only controlled item/lot references and returns per-item operational status plus policy/source revisions.
4. Add `client_applications`/service principal registration, `clinic_locations`/address preset revisions, and authorization mappings.

### P2 — shop foundation and invoice request

1. Build vendor/operator-curated catalogue, purchase-in, stock movement ledger, per-batch lot/expiry, threshold rules, and source/evidence gates.
2. Add procurement request and invoice/pro-forma request records. Use `invoice-issued-not-collected`, with no payment endpoint.
3. Add receiving/reconciliation by scan and staff discrepancy workflow, then signed status events to clinical apps.

### P3 — prove it

The Aegis test suite must include cross-tenant/location denial, expired/unapproved lot, exact template match, idempotency retry/conflict, document-hash mismatch, expired/reused signing capability, event replay, address-preset authorization, invoice request without charge path, and receiving/stock reconciliation. This is in addition to signed snapshot, withdrawal, evidence freshness, and existing supplier tests.

## 8. What the Clinic team must implement

1. Build the implant case-control-tower dashboard and clinician-authored material manifest. Keep full clinical details and raw imaging in the clinic product.
2. Replace the current local mock adapter with a portable `AegisConsentClient` HTTP implementation only after Aegis staging is contract-ready. Keep mock and unavailable clients for deterministic development/fail-closed experience.
3. Render packages/signing natively but exactly as returned by Aegis; project only immutable Aegis receipts into the clinical case.
4. Build the materials/readiness/procurement cards as read models of Aegis operational responses. Do not persist shadow stock, pricing, supplier, or consent-template truth in the clinic product.
5. Enforce consent and operational readiness gates selected by office policy. A “blocked” supply status prevents the workflow action that policy defines; it does not make a diagnosis or override a dentist.
6. Test every exact status transition and negative response with an Aegis contract fixture before enabling staging traffic.

## 9. Acceptance walkthrough for both teams

1. An authorized dental app service principal requests locations and selects an allowed address preset.
2. It loads governed product/lot snapshots. A pending/evidence-ineligible/expired/zero-quantity lot cannot be packaged.
3. A staff member prepares a clinician-authored materials manifest and requests an implant consent package using opaque case/subject/product/lot/site references.
4. Aegis returns persisted `draft` with template/product revisions, document hash, expiry, and correlation ID. Repeating the exact request returns the original package.
5. The clinic renders exact Aegis content and the patient signs. Aegis returns a sealed receipt; only then does the consent card say `Signed`.
6. The readiness card returns `attention_required` for a low operational stock item. Staff creates an invoice request to an authorized preset address. Aegis issues a request with no payment/charge path.
7. Staff receives goods by scan; Aegis records lot/expiry/quantity and updates the readiness response. The clinic displays the result after reconciliation.
8. A withdrawal/freshness event moves the clinical case to review while retaining the immutable receipt projection and all historic notes.

## 10. Questions for operator/counsel before live activation

| Decision | Needed from |
|---|---|
| Exact consent templates, approved languages, procedure keys, and disclosure blocks | Clinician/counsel. Do not use generated Maltese or generated legal/clinical wording. |
| Clinical workflow gate matrix: which supply/consent states block which operational step | Medical director/clinic operator. |
| Each clinic/location’s legal entity, address presets, authorized requesters, supplier contracts, and approval/spend policies | Operator/procurement owner. |
| Data controller, country/region, retention, real-data export/cutover authorization, and patient/signing privacy notices | Operator/privacy/counsel. |
| Whether regulated distribution, payment collection, or supplier submission is in scope | Operator/counsel. No code path should assume it is. |

**Bottom line for the Aegis team:** build the portable governed operations API and auditable request/stock/lifecycle records. **Bottom line for the Clinic team:** build the high-trust encounter and case dashboard that invokes Aegis and displays its receipts. The join is narrow, typed, idempotent, tenant-scoped, and failure-safe.
