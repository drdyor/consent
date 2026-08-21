# Hosted Web to Local-First Migration Assessment

## Current decision

**Aegis Consent remains a hosted web application.** The current implementation uses managed application authentication, a managed relational database, and object storage for logo and signature assets. This model is appropriate for the present product scope, provided each clinic completes its own legal, clinical, information-security, and data-processing review. It must not be described as local-only, offline-first, or desktop software.

## When a local-first deployment should be considered

A separate local-first programme may be appropriate only when a clinic has a documented requirement for prolonged offline operation, clinic-controlled storage, a restricted network boundary, or a deployment model that cannot be met by the hosted service. It is **not** a configuration switch for the current application.

| Decision criterion | Hosted web implication | Local-first implication |
|---|---|---|
| Clinic-controlled data location | Managed provider and processor controls are required | Clinic must operate encrypted local storage, backups, and recovery |
| Offline use | Browser availability and service connectivity are required | Conflict resolution, local queues, and secure synchronization must be designed |
| Multi-clinic collaboration | Shared, role-gated records are available centrally | Cross-site replication and identity federation must be engineered |
| Security operations | Provider and application controls are shared responsibilities | Clinic assumes endpoint, patching, key-management, and monitoring responsibilities |
| Evidence integrity | Signed snapshots and audit records are persisted centrally | Local signing, tamper evidence, export, and immutable backup controls are required |

## Phased migration path

| Phase | Scope | Required deliverable | Key blocker |
|---|---|---|---|
| 0. Feasibility | Confirm legal, clinical, operational, and offline requirements | Approved architecture decision record and threat model | No evidence of a genuine local-first requirement |
| 1. Data mapping | Inventory consent records, snapshots, acknowledgements, treatment-map points, audit events, clinic profiles, users, and asset references | Versioned export contract and data-classification matrix | Ambiguous ownership or retention rules |
| 2. Local platform | Build encrypted local database, device-bound key strategy, secure local asset vault, and desktop authentication | Tested local storage and recovery prototype | No secure key custody or supported-device policy |
| 3. Integrity | Recreate immutable snapshot hashes, signatures, audit sequencing, PDF output, and source-version retention | Signed-record parity and tamper-evidence tests | Inability to preserve cryptographic verification across export/import |
| 4. Migration | Export hosted records and assets, validate checksums, import to local stores, reconcile identities, and retain migration audit evidence | Rehearsed migration runbook with rollback | Missing backup, migration freeze, or reconciliation policy |
| 5. Operations | Establish updates, patching, encrypted backups, monitoring, support, and incident response | Clinic operating procedure and recovery drill | Clinic cannot sustain operational ownership |

## Data and asset migration requirements

Consent records should migrate with their original identifiers, template revision, selected product and source version, disclosures, acknowledgements, signer identity, signature method, signing timestamp, immutable snapshot, snapshot hash, treatment-map entries, and all audit events. Each asset reference must be resolved to a verified copy of the associated logo or drawn-signature object, with checksums captured before and after transfer. User identities and role memberships must be re-established through a clinic-controlled identity model; existing managed sessions must not be copied.

## Explicit non-goals

This assessment does not authorize a local deployment, determine data-residency obligations, replace a data-protection impact assessment, or certify compliance with Polish, EU, or other jurisdictional law. It does not migrate the live application automatically. A clinic electing this path requires a separate delivery plan, security review, clinical-governance approval, test migration, and documented rollback strategy.
