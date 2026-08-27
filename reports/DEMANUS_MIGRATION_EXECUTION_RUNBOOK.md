# Aegis portability migration execution runbook

## Status and release boundary

**Status: planning and contract preparation only. No production portability migration has been performed.** The newly added `clinicIntegration` router is an internal, synthetic contract seam that still inherits the current Manus-authenticated tRPC runtime and MySQL schema. It is not an internet-facing service-to-service API and must not be connected to a clinical product outside synthetic test work.

The target architecture is a standalone **Aegis Consent + Shop operations service**. It owns the governed product catalogue, template revisions, consent package generation, immutable signing/archive, evidence status, lot/expiry, procurement, and B2B commerce. Clinical applications use its versioned API but keep their own patient records and encounter workflows.

> Do not cut over on the basis of a successful build. Cut over only after a rehearseable PostgreSQL migration, independently recomputed signed snapshot hashes, object checksum reconciliation, tenant-isolation tests, portable-session tests, and a rollback rehearsal all pass.

## Current platform dependencies to remove

| Current dependency | Concrete replacement | Completion test |
|---|---|---|
| Manus OAuth, `openId`, `_core/sdk.ts`, `_core/oauth.ts`, `authenticateRequest`, runtime cookie helpers | Application-owned identity with an OIDC-compatible provider or equivalent portable provider; app-owned signed `HttpOnly`, `Secure`, `SameSite=Strict` session cookie; a locally generated immutable `users.id`. | A new login, logout, session expiry, revoked session, and cross-clinic authorization suite passes without an OAuth portal or `openId`. |
| MySQL/TiDB and `drizzle-orm/mysql2` / `mysql-core` | PostgreSQL 16+ with `postgres-js` and `drizzle-orm/postgres-js`; dedicated migration runner. | Empty database migration applies from zero, synthetic data rehearsal imports, and full suite runs against Postgres only. |
| Forge storage proxy and `BUILT_IN_FORGE_*` | A small `ObjectStore` interface backed by AWS S3 or self-hosted MinIO using the existing AWS SDK. | Put → signed GET → byte-for-byte SHA-256 round trip; unauthorised object access is rejected. |
| Heartbeat / Manus scheduled endpoints | Provider-native scheduled HTTP invocation or a durable queue/scheduler service, authenticated with a rotated schedule secret. | Evidence-freshness/reminder/escalation jobs are idempotent on duplicate delivery and record run/audit status. |
| Manus build/runtime deployment and Vite plugins | Containerized Node service; environment-managed secrets; independent CI/CD. | Build runs without a Manus package/plugin/environment marker and a fresh container starts after migrations. |

## Exact migration order

### 0. Freeze scope and establish a protected migration inventory

1. Confirm the target is standalone Aegis Consent + Shop and name the production data controller, region, hosting operator, object-store provider, identity provider, RPO/RTO, and authorized migration owner.
2. Set a release freeze for schema changes other than explicitly tagged portability commits. Preserve existing consent, withdrawal, evidence, supplier, inventory, and audit lifecycle behavior as non-negotiable acceptance criteria.
3. Export a **manifest only** from the source: schema version, table row counts, primary-key ranges, record status counts, SHA-256 snapshot hashes, audit event hashes, withdrawal event hashes, object keys, object size, content type, and source-object checksum when available. Store the manifest encrypted; do not commit data or object URLs with personal information to Git.
4. Start with synthetic records in a separate environment. Do not put real data, credentials, authentication cookies, session tokens, or signing capabilities in sandbox files or test fixtures.

### 1. Create portable interfaces before migrating data

1. Add `server/platform/auth.ts` with a narrow `AuthenticatedPrincipal` and `requireWorkspace()` contract. Refactor tRPC context and workspace checks to depend on it rather than a Manus user or `openId`.
2. Add `server/platform/objectStore.ts` with `put`, `getSignedUrl`, `delete`, and `head` methods. Preserve logical object keys; never use client-supplied keys directly.
3. Add `server/platform/scheduler.ts` with a `schedule` and authenticated `dispatch` abstraction. No in-process timers.
4. Keep an explicit `legacy/` adapter only long enough to complete synthetic rehearsal. New domain/router code imports the portable interfaces only.
5. Add behavior gates that fail if source/application runtime imports `manus`, `forge`, `OWNER_OPEN`, `authenticateRequest`, `mysql2`, or a MySQL Drizzle dialect after the final portable cutover.

### 2. Port the schema to PostgreSQL in a new migration history

1. Do **not** run the existing MySQL migrations against Postgres. Create `drizzle-pg/` and a new ordered PostgreSQL migration history with a checked-in migration journal.
2. Convert `mysqlTable` to `pgTable`; `int(...).autoincrement()` to `integer(...).generatedByDefaultAsIdentity()`; `mysqlEnum` to named `pgEnum`; JSON fields to `jsonb`; and decimal precision/scale unchanged.
3. Replace every MySQL `ON UPDATE CURRENT_TIMESTAMP` behavior with a PostgreSQL `set_updated_at()` trigger. Make each trigger migration explicit and test it.
4. Create all primary keys, unique constraints, foreign keys, and tenant/status/date indexes before importing data. Preserve consent/audit relationship keys and source-to-product/lot/template links.
5. Add an immutable external reference to all public bridge entities before exposing the API: UUID/opaque `public_id` on product, lot, template, and `clinicConsentPackages`; do not expose sequential database IDs to clinical applications in production.
6. Recreate `clinicConsentPackages` in the new PostgreSQL history as a **draft-package projection**, with `clinic_id + origin_app + idempotency_key` unique. It must remain distinct from the authoritative signed `consentRecords` lifecycle.

### 3. Build portable identity and service-to-service access

1. Retire `users.openId` as an authentication assumption. Retain a legacy external-subject mapping only for historic account migration where necessary.
2. Create application-owned user and session tables; hash passwords or use the chosen provider’s compliant credential flow; store only hashed session tokens; enforce explicit expiry, revocation, rotation, and `HttpOnly` secure session cookies.
3. Preserve `clinicMembers` roles and test that an administrator, practitioner, patient capability, and service principal cannot cross clinic boundaries.
4. Add a registered `client_applications`/service-principals model with a public key or hashed secret, scopes, origin app, tenant mapping, expiry, rotation timestamp, and revocation timestamp. Never reuse browser user sessions for clinic-to-Aegis requests.
5. Authenticate clinical API calls with a signed short-lived client assertion or a rotateable secret over TLS. Bind the principal to an allow-listed `origin_app` and origin tenant reference; reject caller-supplied tenant identity that does not map to the credential.

### 4. Replace Forge with S3/MinIO without changing record integrity

1. Configure `OBJECT_STORE_ENDPOINT`, `OBJECT_STORE_REGION`, `OBJECT_STORE_BUCKET`, `OBJECT_STORE_ACCESS_KEY_ID`, `OBJECT_STORE_SECRET_ACCESS_KEY`, and optional path-style mode for MinIO. Keep these as deployment secrets, never database fields.
2. Implement server-side upload and signed-download issuance through `ObjectStore`. Validate content type and size before upload; include server-generated object keys and store the object’s SHA-256 in metadata.
3. Copy objects from a manifest with a dedicated migration process: read source → stream destination → compare byte count and SHA-256 → mark the item migrated. Retain source read access until acceptance completes.
4. Reissue temporary, authenticated download URLs; do not preserve a Forge URL as a permanent record locator. Keep logical object key, content hash, content type, and creation metadata in Postgres.
5. Test signature images, consent photos, PDFs, supplier evidence, corrective-action documents, and every signed-consent archive path. An unauthenticated retrieval attempt must fail.

### 5. Rehearse data and integrity migration

1. Provision an empty Postgres staging database and empty S3/MinIO bucket. Run the new migrations from zero and record the migration hash/version.
2. Import a synthetic source export in dependency order: users/clinics/members → patients/profiles → catalogue/source/products/templates → lots/supplier objects → drafts/consents/acknowledgements/maps/photos/course entries → signing capabilities → audits/withdrawals/notary/freshness/escalation records.
3. Preserve JSON snapshot byte representation before hashing. For every signed consent, independently calculate SHA-256 from the canonical stored snapshot bytes and compare it with the imported `snapshotHash`. Any mismatch blocks migration.
4. Recompute and compare the withdrawal-event/audit-chain hashes under the documented historical algorithm; do not “repair” mismatches by overwriting history.
5. Compare source and target row counts, tenant counts, signed/voided/draft states, active signing-capability states, product-source review states, lot quantities/expiry states, object manifest counts, and object checksums.
6. Run integration tests on Postgres: tenant isolation, source/evidence gate, expiry gate, signing, withdrawal append-only behavior, notary status, patient signing capability, supplier escalation, object authorisation, and clinic bridge package idempotency.

### 6. Make the clinic bridge a portable public API

1. Preserve the current `clinicIntegration` procedures as a synthetic contract reference only. Replace their protected browser-session dependency with the portable service principal described above.
2. Publish `v1` OpenAPI/JSON schemas generated from the service contract for:
   - `GET /v1/governed-products` and a specific product/lot snapshot.
   - `POST /v1/consent-packages` with correlation and idempotency keys.
   - `GET /v1/consent-packages/{public_id}` and `GET /v1/consent-receipts/{public_id}`.
   - A controlled signing/capability flow and signed webhook/outbox events for withdrawal, freshness, and final signature.
3. In every command, check service principal → origin app → origin tenant mapping before processing payload fields. All input must use opaque public IDs; no product or lot numeric primary keys cross the boundary.
4. Require the product source to be approved, market evidence eligible, lot usable/not expired, template active, exact procedure/market/language match, and a non-replayed idempotency key before creating a draft package.
5. Return `draft`/`sent` packages only. A signed receipt can be returned only by the immutable signing lifecycle. The clinical product must reconcile `unknown` results by correlation/idempotency key and never infer success.
6. Implement signed event delivery with an outbox, HMAC/signature, replay detection, delivery attempts, and a clinic-side review/blocked state on withdrawal/freshness failures.

### 7. Replace scheduled work and deploy safely

1. Migrate each Heartbeat task to provider-native scheduled HTTPS calls or durable queue jobs. Use authenticated requests, stable job IDs, idempotency keys, and a run ledger.
2. Containerize Node with an unprivileged runtime user and environment-only secrets. CI must run PostgreSQL migrations against an ephemeral database, full test suite, lint/typecheck, SBOM/license scan, and secret scan.
3. Deploy a staging environment with separate database/bucket/identity credentials. Run synthetic smoke tests, object access checks, and signed-event replay tests.
4. Define observability: structured audit logs, migration metrics, failed-job alerts, error tracking without personal data, object-copy failure queue, and routine encrypted backups with restore rehearsal.

### 8. Controlled cutover and rollback

1. Announce a measured write freeze, capture a final delta manifest, and migrate final object/database deltas. Avoid uncontrolled dual-write unless its reconciliation rules have been independently tested.
2. Place the portable version behind internal users first, then run canonical signed snapshot verification, object checks, session/auth tests, clinic bridge package creation, and retrieval authorization checks.
3. Only after written acceptance should DNS/traffic change. Keep the source read-only for a defined rollback window.
4. Roll back traffic—not history—if verification fails. Never copy a target signed snapshot back into the original or mutate a sealed record to force parity.
5. Retire Manus secrets and source access after the acceptance/rollback window, archive the encrypted export manifest under the agreed retention policy, and remove all remaining Manus/Forge/MySQL packages and source markers.

## Required secrets and operator decisions

| Item | Owner | Required before |
|---|---|---|
| Hosting, region, data controller, backup/retention policy | Operator + counsel/privacy lead | Provisioning production infrastructure. |
| Portable identity provider and historic-user re-authentication policy | Operator + security lead | Building portable login/session migration. |
| PostgreSQL endpoint and restricted migration credential | Platform operator | Staging rehearsal. |
| S3/MinIO endpoint, bucket, KMS/encryption policy, access keys | Platform operator | Object-copy rehearsal. |
| Scheduler/queue provider and outbound webhook policy | Platform operator | Replacing freshness/escalation jobs. |
| Client-app registration, service credential rotation policy, integration tenant map | Aegis + each clinical product owner | Enabling service-to-service API access. |
| Legal template text, market classification, product evidence, pricing, distribution authority | Clinician/counsel/operator | Any real record, product listing, sale, or patient-facing output. |

## Definition of portable API readiness

Aegis is ready for a **real** clinic connection only when the complete service runs on portable auth, PostgreSQL, and S3/MinIO; uses opaque external identifiers and service principals; exposes versioned documented APIs; passes the full Postgres integration suite plus the synthetic clinic-to-Aegis contract suite; has a successful migration/restore rehearsal; and has written operator approval. Until then, the API endpoints and their test data are synthetic pre-portability seams only.
