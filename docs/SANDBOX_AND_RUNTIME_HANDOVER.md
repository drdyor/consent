# Aegis Sandbox and Dynamic Runtime Handover

This handover explains what can be recovered from the repository and portable archive, and what must be provisioned to operate Aegis as a dynamic product without a temporary development session.

## What is committed and recoverable

| Asset | Recovery location | Purpose |
|---|---|---|
| Full application source and Git history | `https://github.com/drdyor/consent` | Primary durable source-code record |
| Portable Git history | `drdyor-consent-all-refs.bundle` in the preservation package | Cloneable offline copy of every reachable repository ref |
| Source archive | `drdyor-consent-source-history.tar.gz` | Portable source and repository-state archive |
| Managed project archive | `aegis-consent-managed-project.tar.gz` | Current managed Aegis project source and history archive |
| Integrity file | `SHA256SUMS.txt` | SHA-256 verification for each recovery package |
| Managed checkpoint | `manus-webdev://c5c10ed5` | Recoverable managed-project point-in-time snapshot |

## What a source archive does not run by itself

A dynamic product needs a live database, private file storage, user authentication, server secrets, scheduled jobs, network delivery, monitoring, backups, and an operator who owns incident response. Git and an archive preserve the application; they do not preserve a running service process or secret credentials by themselves.

The current implementation uses managed runtime capabilities. To remove that dependency, follow the decision-gated migration in `reports/DEMANUS_MIGRATION_PLAN.md`: export and verify the database and private object manifest, independently recompute signed-consent hashes, map clinic accounts/roles, recreate jobs idempotently, and test the full authorization/signing/document-download flow before cutover.

## Recovering the source on another machine

From GitHub:

```bash
git clone https://github.com/drdyor/consent.git
cd consent
pnpm install --frozen-lockfile
pnpm test -- --run
pnpm exec tsc --noEmit
```

From the bundle, without network access:

```bash
git clone drdyor-consent-all-refs.bundle consent
cd consent
pnpm install --frozen-lockfile
pnpm test -- --run
```

The bundle and archive must be checked before use:

```bash
sha256sum -c SHA256SUMS.txt
git -C consent fsck --no-dangling
```

## Required independent deployment decisions

| Decision | Why it is necessary before a live independent service |
|---|---|
| Hosting and data region | Determines where the dynamic API, database, object storage, logs, and backups live. |
| Database and migration owner | Determines how tenant, consent, audit, supplier, and inventory data is migrated and restored. |
| Private object storage | Protects signatures, clinical files, PDFs, supplier evidence, and scan-quarantined documents. |
| Identity provider | Replaces managed authentication while preserving clinic-scoped roles and public capability-token boundaries. |
| Secret management | Stores integration keys and encryption/session secrets outside code and outside Git. |
| Scheduler / worker | Runs evidence freshness, expiry, escalation, and scanning follow-up safely with idempotency. |
| Backup and incident owner | Ensures a named team validates restores, monitors the service, and rotates credentials. |

## Operating boundaries

The sandbox was suitable for development, testing, source packaging, and validation; it is not a permanent production environment. A temporary development session may hibernate or reset, so the durable handover is the pushed repository plus the verified archives and a properly provisioned independent runtime. The planned external runtime must preserve tenant isolation, encrypted storage, immutable signed snapshots, hash verification, append-only withdrawal/audit events, clean-scan-only downloads, and role-based access checks.
