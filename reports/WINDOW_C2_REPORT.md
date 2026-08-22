# WINDOW C2 Report — Patient Entity and Self-Service Signing

**Completed:** 21 August 2026  
**Scope:** Synthetic-data implementation only. No real patient identity, signature, or patient capability was created during this window.

## Delivered behavior

| Control | Implemented behavior |
|---|---|
| **Patient entity** | Clinics now have a clinic-scoped `patients` record with AES-256-GCM encrypted first name, last name, optional email, and optional date of birth. A deterministic SHA-256 identity key deduplicates the same normalized synthetic identity only within its clinic. |
| **Record linkage** | New consents create or reuse a patient entity and store `patientId`. Clinical photos and treatment-course entries inherit that link. An administrator-only backfill action attaches pre-existing consent records, photos, and course entries without changing their signed snapshots. |
| **Patient history** | The protected `/patients/:id` view lists linked treatment consent records, withdrawal status, source references, and acknowledgement counts. Readable names are decrypted only server-side for the authorized clinic workspace. |
| **Patient-held signing** | A clinic user can issue an opaque, time-boxed, one-use capability for one sent, patient-linked consent. The database stores only the SHA-256 token hash. The public `/patient-sign/:token` route runs outside the clinic shell and authorizes only that consent review/signature flow. |
| **Signing controls** | Expired, used, invalid, non-patient-linked, and no-longer-sent capabilities are rejected. Required disclosures must be acknowledged. A successful signature marks the capability used, seals the ordinary immutable consent snapshot, binds `{ patient.id, patient.identityHash }` into that snapshot, and enters the existing retryable notarization flow. |

> **Integrity boundary:** The patient capability is not an account and does not grant clinic access. It authorizes a single time-limited signing interaction for its linked consent only. The signed snapshot remains immutable after completion; a later withdrawal remains the separate append-only workflow delivered in WINDOW_C1.

## Validation

The full suite passed with **32 test files and 77 tests**, followed by a clean TypeScript check. Added behavior tests demonstrate encrypted readable identity values, expired-capability rejection, used-capability rejection, acknowledgement-gate enforcement, and successful patient-held signing that consumes the capability and seals a snapshot containing the patient-entity binding.

## Migration

`drizzle/0022_strong_beyonder.sql` creates `patients` and `patientSigningLinks`, adds nullable patient foreign keys to consent records, photos, and treatment-course entries, and leaves existing clinical/signed records intact for controlled runtime backfill.
