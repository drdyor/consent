# WINDOW C2 — Real patient entity + patient-held self-service signing

See `HANDOVER_AEGIS_CONSENT.md` §4 ideas 4 & 2. Stack: Node/tRPC/Drizzle. Synthetic only.

## Part A — Patient entity
- Today a patient is loose name fields per `consentRecords` row (`schema.ts:258-260`) with no
  cross-consent linkage. Add a `patients` table scoped to clinic (encrypted name/DOB, like the
  Glow model); link `consentRecords`, `treatmentCourseEntries`, and `consentPhotos` to it via
  `patientId`; backfill existing records by name.
- Give clinics a patient view with consent history (prior treatments, prior withdrawals,
  disclosures acknowledged). Tests: two consents for the same patient link; history renders.

## Part B — Patient-held self-service signing
- Signing today is in-clinic on the practitioner session. Add a time-boxed, single-use patient
  signing link: the patient opens it on their own device, reviews disclosures (must acknowledge
  each `requiredAcknowledgement`), and signs; the signature + snapshot hash bind to the patient
  entity. Link expires; one use; no auth escalation (the token authorises only that one consent).
- Tests (reproduce-before-fix): an expired or reused link is rejected; signing without all
  required acknowledgements is blocked; a completed patient-signed consent seals identically to
  an in-clinic one (same snapshot/hash discipline, now bound to the patient).

## Definition of done
Integration tests green; patient entity + history + self-service signing on synthetic data;
committed + pushed; `reports/WINDOW_C2_REPORT.md`. Update STATE.md →
`WINDOW_C3_EVIDENCE_FRESHNESS.md`.
