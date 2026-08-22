# De-Manus Migration Plan — Decision-Gated

**Status:** Planning only. No authentication, storage, database, deployment, or live-data migration has been started. This plan is for operator review at **WINDOW_C4**.

## Objective

Replace platform-specific dependencies while preserving the Aegis consent model: clinic isolation, immutable signed snapshots, append-only withdrawal events, patient capability signing, evidence governance, supplier controls, and audit history.

| Current dependency | Portable target | Key preservation requirement |
|---|---|---|
| Manus OAuth | Portable application authentication such as Auth.js or an equivalent OIDC-compatible provider | Preserve clinic membership, admin/practitioner roles, and explicit public capability boundaries; do not migrate opaque session cookies. |
| Forge storage | S3-compatible object storage, with MinIO suitable for self-hosted deployments | Preserve object keys, media metadata, access controls, and authenticated signed-download behavior. |
| MySQL/TiDB via Drizzle | PostgreSQL via Drizzle’s PostgreSQL dialect | Preserve IDs or maintain deterministic ID mapping; retain JSON snapshot bytes and SHA-256 hashes exactly. |
| Heartbeat scheduled endpoints | Provider-native scheduled HTTP jobs or a durable application scheduler | Preserve task ownership, idempotency, retry-safe jobs, and audit evidence; avoid in-process timers. |
| Built-in deployment | Containerized Node service with environment-managed secrets | Run schema migrations before traffic cutover and use a reversible, staged release. |

## Migration sequence

1. **Operator decision and scope:** choose fold into Vitalis, standalone Aegis, or a shared consent core. Confirm the production data controller, target region, support model, and allowed downtime.
2. **Inventory and export:** enumerate database tables, all object keys, scheduled jobs, environment variables, and any real records. Export data and object manifests under controlled access; do not place patient data in Git.
3. **Portable foundations:** introduce portable auth, S3/MinIO abstraction, PostgreSQL schema/dialect, and environment configuration behind tested interfaces before removing the existing path.
4. **Data migration rehearsal:** migrate synthetic data first, validate foreign keys, compare row counts, sample object checksums, and independently recompute signed snapshot hashes. Any hash mismatch is a blocking failure.
5. **Dual-read or controlled cutover:** choose a brief write freeze or a bounded dual-write period. Re-run hash and capability-expiry validation immediately before cutover.
6. **Job replacement:** recreate evidence/reminder/escalation jobs on the new scheduler, proving idempotency with retry tests and monitoring the first scheduled execution.
7. **Acceptance and rollback window:** obtain operator sign-off on auth, clinic isolation, signed-record hash verification, download authorization, and schedule health before retiring the original environment.

## Decisions required before implementation

| Decision | Why it is required |
|---|---|
| **Fold / standalone / both** | Determines whether the Node/tRPC app remains independently hosted or the consent core is extracted for Vitalis. |
| **Target hosting and data region** | Determines the runtime, storage endpoint, backup, observability, and data-residency controls. |
| **Authentication provider and user migration policy** | Determines invite/login flow, role mapping, and whether historic users must re-authenticate. |
| **Object migration cutover method** | Determines expected downtime and how signed PDFs, photos, signatures, and evidence files remain available. |
| **Schedule provider** | Determines how deterministic recurring rechecks and reminders run without platform-specific services. |

## Non-negotiable integrity checks

The migration must never rewrite a signed snapshot to accommodate the new system. For every migrated signed consent, compare the original stored snapshot bytes and its SHA-256 hash with the target record. Preserve withdrawal/audit events as appends, preserve capability token hashes rather than plaintext tokens, and validate that tenant-scoped access controls deny cross-clinic reads in the target environment.

> **No action requested is taken by this plan.** Implementation begins only after the operator makes the strategic decision above.
