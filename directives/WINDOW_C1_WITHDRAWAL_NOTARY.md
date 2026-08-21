# WINDOW C1 — Withdrawal + Hedera notarization (court-grade consent of record)

Single controlling document. See `HANDOVER_AEGIS_CONSENT.md` §4 ideas 1 & 3. Stack: Node/tRPC/
Drizzle. Synthetic data only. Extend the existing test suite with real integration tests.

## Part A — Withdrawal as a first-class hash-chained event
- `voided` status exists (`schema.ts:263`) but nothing sets it. Build `consent.withdraw`:
  a withdrawal is a NEW signed, timestamped event appended to `auditEvents` (already
  append-only) and the record's status → `voided`; the original `signedSnapshot` + hash are
  NEVER edited. A withdrawn consent no longer authorises treatment.
- Tests (reproduce-before-fix): withdrawing a signed record appends an event, leaves the
  snapshot bytes/hash unchanged, and flips authorisation off; attempting to edit a signed
  record in place is rejected.

## Part B — Notarize the signed-consent hash on Hedera
- At `sign`, after `snapshotHash` is computed (`consentSnapshot.ts:37`), submit the hash to a
  per-clinic Hedera Consensus Service topic (reuse the Glow Protocol approach / `@glow/hedera`
  logic; testnet; operator key from env/secure config, NEVER committed). Store
  `{topicId, sequenceNumber, transactionId, consensusTimestamp}` on the consent record.
- Add `consent.verify`: re-fetch the Hedera Mirror-Node message and compare to the stored
  `snapshotHash` → `certified | modified | unknown`. This makes a signed consent independently
  court-verifiable, mirroring the photo notary.
- Tests: a signed consent stores a Hedera reference and verifies `certified`; a record whose
  snapshot is altered verifies `modified`. Notarization failure must not silently pass sign —
  it records `notary_pending` and is retryable, never faked.

## Definition of done
New integration tests green; signed-snapshot immutability preserved; withdrawal + notarize +
verify working on synthetic data; committed + pushed; `reports/WINDOW_C1_REPORT.md`. Update
STATE.md → `WINDOW_C2_PATIENT_SIGNING.md`.
