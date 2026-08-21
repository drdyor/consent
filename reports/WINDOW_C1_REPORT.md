# WINDOW C1 Report — Withdrawal and Hedera Notarization

**Completed:** 21 August 2026  
**Scope:** Synthetic-data implementation only. No live patient record, Hedera operator key, or testnet transaction was created during this window.

## Delivered behavior

| Control | Implemented behavior |
|---|---|
| **Withdrawal** | `consent.withdraw` accepts only a signed clinic-scoped record, changes its authorization status to `voided`, and appends a new `consent.withdrawn` audit event. The update deliberately excludes `signedSnapshot` and `snapshotHash`, preserving the signed record. |
| **Hash chain** | Each withdrawal event stores both the preceding audit/snapshot hash reference and a deterministic SHA-256 event hash over the consent, actor, timestamp, reason, and sealed snapshot hash. |
| **Notary configuration** | Administrators can enable a clinic-specific Hedera **testnet** topic. Operator account and private-key material are read only from deployment environment variables; they are never persisted in application records. |
| **Notary submission** | Signing commits the immutable snapshot first, then attempts an HCS submission. A success stores topic, sequence number, transaction ID, and consensus timestamp. Any unavailable configuration or submission error is recorded as `notary_pending` with an auditable retry path. |
| **Verification** | `consent.verifyNotary` first recalculates the signed-snapshot SHA-256 value, then compares the sealed value to the base64 HCS message returned from the configured Mirror Node. It reports `certified`, `modified`, or `unknown`; it never infers certification from local metadata alone. |
| **Operational UI** | The signed-consent view exposes notary state, verification, administrator-gated retry, and a controlled withdrawal action. A voided record explicitly states that the snapshot remains preserved but does not authorize treatment. |

> **Important operational boundary:** This release provides a real testnet-capable adapter, but no clinic topic or operator credentials were supplied. Consequently, a newly signed consent will correctly record `notary_pending` until an administrator enables a topic and secure deployment credentials are configured. It is not represented as Hedera-certified before that occurs.

## Validation

The complete suite passed with **30 test files and 72 tests**. The added behavioral coverage verifies that withdrawal appends an event without rewriting sealed snapshot fields; an unavailable notary enters a retryable pending state; retry stores a Hedera reference without snapshot mutation; a matching Mirror Node message verifies as `certified`; and altered snapshot bytes verify as `modified`.

## Configuration required for live testnet notarization

The deployed server must provide `HEDERA_OPERATOR_ID` and `HEDERA_OPERATOR_KEY`, and a clinic administrator must enable a valid `0.0.x` testnet topic through the protected setting. The optional `HEDERA_MIRROR_NODE_URL` defaults to Hedera testnet Mirror Node. The SDK submits a compact JSON message containing only the sealed hash, keeping the HCS message well below the documented 1 KB topic-message limit. HCS supplies ordered consensus messages, while Mirror Nodes expose topic messages and per-message sequence numbers for verification. [1] [2] [3]

## References

[1]: https://docs.hedera.com/native/tutorials/consensus/submit-first-message "Hedera: Submit Your First Message"
[2]: https://docs.hedera.com/native/tutorials/consensus/query-mirror-node "Hedera: Query Messages with Mirror Node"
[3]: https://docs.hedera.com/native/consensus/submit-message "Hedera: Submit a Message"
