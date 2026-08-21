# Ideas — proposals from the coalface (Aegis Consent)

## 2026-08-21 · Claude · see-beyond pass (handover)
- **[status: proposed]** Hedera-notarize the signed-consent SHA-256 snapshot hash (reuse
  @glow/hedera) → court-verifiable consent of record; unifies consent + photo integrity.
- **[status: proposed]** Patient-held self-service signing on the patient's own device
  (closes "practitioner clicked sign" gap; needs the patient entity).
- **[status: proposed]** Withdrawal as a first-class hash-chained append event (voided status
  exists, no impl; keep "voided-not-edited" policy, original stays immutable).
- **[status: proposed]** Real patient entity + cross-consent history (today patient = loose
  names per record; prerequisite for self-service signing and the Vitalis fold-in).
- **[status: proposed]** Evidence-freshness re-verification: flag consents signed against a
  now-superseded productSource (reuse the supplier expiry-reminder scheduler).
- **[status: proposed]** De-Manus as a feature: portable auth + S3/MinIO + Postgres →
  self-hostable, EU-data-resident (forced by the 2026-08-24 Manus cutoff).
See full rationale in HANDOVER_AEGIS_CONSENT.md.
