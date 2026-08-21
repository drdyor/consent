# Production Considerations

## Clinical and legal governance

This application is a consent-workflow tool, not a substitute for clinical judgement, manufacturer instructions, or jurisdiction-specific legal advice. Each clinic should have its governing clinician and qualified local counsel review every template, product document, disclosure excerpt, signature process, record-retention period, and patient-facing wording before use.

Only canonical manufacturer SPC, prescribing information, IFU, or DFU documents should be registered. The administrator must retain document title, URL, version or date, retrieval date, and the exact reviewed disclosure text. Source records should be re-reviewed whenever the manufacturer issues a new document version.

## Security and privacy

Before production use, configure role onboarding/offboarding, clinic membership administration, data-retention and deletion policies, backups, incident response, encryption-key management, and region-appropriate privacy controls. Patient invitation links, if enabled in a future release, must be high-entropy, single-purpose, expiring, and revocable. The clinic should also verify appropriate contracts and data-processing terms for its jurisdiction.

## Poland-aware hosted-web decision

The current product is a **hosted web application**, not local-first or desktop software. Clinic data, uploaded logos, signature images, and signed-document references are processed through the managed application database and object-storage services; the application must not represent these records as remaining only on a clinic device. A clinic considering a local-first or desktop deployment should treat that as a separate architecture project requiring a new threat model, offline-conflict design, encrypted local storage, secure device management, backup/recovery procedures, support process, and migration plan.

For Poland-oriented clinics, the product therefore provides configurable evidence and workflow controls rather than legal certification. These controls include a clinic jurisdiction and default language, template jurisdiction and language, practitioner registration authority and verification date, product registry authority and identifier, registry-verification date, canonical document metadata, source approval history, and a patient-ready gate for Poland-configured product records without verified registry evidence. The clinic remains responsible for confirming the appropriate authority, verifying the evidence it enters, maintaining lawful data-processing arrangements, defining retention periods, responding to data-subject requests, and obtaining qualified legal and clinical review of patient-facing templates.

## Document integrity and operations

Signed snapshots contain the selected template revision, clinic and practitioner identity, logo reference, source data, applicable disclosures, acknowledgements, signature method, timestamp, and hash. Clinics should establish a policy for voiding—not editing—signed records. Prior to rollout, validate PDF layout across target printers, test audit log exports, and establish an escalation process for source-review and product-recall events.
