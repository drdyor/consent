# Signing-UX build report — 2026-08-28

Branch `signing-ux-2026-08-28` (worktree `consent-signing`), base `5e49ef3`.
Scope: signature_pad adoption + blank-signature bug fix, B1 patient-signing-link UI,
ceremony audit events (documenso pattern, own code), B3 orphan-route nav.
All test data synthetic; throwaway infra torn down after the run.

## BUILT

### 1. signature_pad adoption + blank-canvas seal bug FIXED
- New `client/src/components/SignaturePadField.tsx` — signature_pad@5 (MIT) wrapper
  (devicePixelRatio-aware resize, endStroke → empty-state callback, imperative
  `isEmpty()/toPngDataUrl()/toStrokeJson()/clear()`). Replaces the hand-rolled
  2d-context pointer code in `ReviewConsent.tsx`; `PatientSign.tsx` (previously
  typed-only) gains a drawn option using the same component.
- **Bug fix (QA-verified defect)**: ReviewConsent's gate was
  `Boolean(canvas.toDataURL())` — truthy for a BLANK canvas, so an empty drawn
  signature could be sealed. New shared pure gate `client/src/lib/signingGate.ts`
  (`canSignConsent`) requires `SignaturePad.isEmpty() === false` for the drawn
  method; used by both pages.
- Stroke evidence: `toData()` JSON is sent as new optional `signatureStrokeData`
  on `consent.sign` / `consent.patientSign` and stored via the existing
  `storagePut` path as `consents/<id>/signature-strokes.json` (or
  `patient-signature-strokes.json`). The PNG remains the sealed artifact
  referenced by the snapshot; **no snapshot-builder or schema change**. Because
  `storagePut` appends a random key suffix, the stroke file URL is pinned in an
  `auditEvents` row (`consent.signature_strokes_archived`) so it stays findable
  without a schema column. Malformed stroke JSON is rejected loudly BEFORE any
  sealing side effect.

### 2. B1 — patient-signing-link issuer UI
- New `client/src/components/PatientSigningLinkCard.tsx`, rendered on `sent`
  consents in ReviewConsent (bilingual pl/en like the page): expiry picker
  (1 h / 4 h / 24 h / 3 d / 7 d — inside the backend 5 min–10 080 min bounds),
  calls the existing `consents.createPatientSigningLink`, shows the URL, a QR
  code (qrcode, MIT), a copy button, and a "token shown only once" note.
- New server query `consent.activePatientSigningLink` (clinic-scoped) reports the
  newest un-used, un-expired link so the card can show active-link state (the
  token itself is unrecoverable by design — only its SHA-256 hash is stored).

### 3. Ceremony audit events (documenso pattern — our own code, no AGPL code)
On the public patient path, `auditEvents` rows now record, with best-effort
ip (x-forwarded-for aware) + user-agent in the summary:
- `consent.patient_link_opened` — when `patientSigningLink` resolves;
- `consent.patient_viewed` — new public `patientSigningLinkViewed` mutation,
  pinged once by the patient page after the disclosures render;
- `consent.patient_signing_rejected` — new public `patientRejectSigning`
  mutation behind a patient "I do not wish to sign" flow with optional reason;
  it consumes the single-use link (record stays `sent`, clinic may re-issue).
Hash-chain columns are left NULL exactly like every other non-withdrawal audit
insert — chaining all events remains backlog **A2** (fenced/Manus-adjacent), and
a test asserts the ceremony rows do NOT populate those columns.

### 4. B3 — orphan-route nav wiring
- `AppShell.tsx`: "Evidence freshness" admin sidebar entry → `/evidence-freshness`.
- `Records.tsx`: patient names link to `/patients/:id` (cross-consent history)
  when the record has a linked patient entity.

## VERIFIED
- `pnpm check` — clean (tsc).
- `pnpm test` — **42 files / 135 tests green**, including 15 new:
  - `signingGate.test.ts` (5): blank-drawn REFUSED even with name+acks; drawn-with-stroke
    allowed; typed unaffected; acks/name still required.
  - `patientSigningCeremony.integration.test.ts` (10): expiry bounds (<5 min and
    >7 d refused pre-DB); issuance stores only the token hash and never the raw
    token, expiry honoured ±1 min, issuance audit row written; active-link query
    (row / null); link_opened + consent_viewed + signing_rejected rows carry
    ip + user-agent (and reason); reject consumes the link; ceremony rows leave
    hash-chain columns NULL; drawn patientSign archives stroke JSON to storage
    beside the PNG with an audit-pinned URL; malformed stroke JSON rejected with
    zero side effects.
- **LIVE smoke (actually run)** — `reports/qa_scripts/signing_ux_smoke.ts` against a
  throwaway stack: `aegis-signing-mysql` (MySQL 8, :33121) + `aegis-signing-minio`
  (MinIO S3, :9121), schema via the QA FINDING #2 workaround (`push --force`; 36
  tables; expected `ER_TOO_LONG_IDENT` on the long FK — pre-existing defect, in
  C4 scope, not touched here), dev server `:3132` with `STORAGE_PROVIDER=s3`.
  Live-run results, all as expected:
  - workspace auto-provision → starter template import + activate → procedure-only
    consent created + sent;
  - `createPatientSigningLink` 3 min → refused (bound); 60 min → token + path;
    `activePatientSigningLink` → the link;
  - anonymous open (`link_opened` row with ip 198.51.100.42 + SYNTH UA), viewed
    (`patient_viewed` row), then **drawn `patientSign` with a real signature_pad
    stroke payload + PNG → sealed** (`snapshotHash eb36307…`, `signingMethod
    drawn`, `signatureUrl` populated); consumed-link reuse refused;
  - stroke JSON **fetched back from MinIO through the storage proxy** (HTTP 200,
    both stroke groups intact) and the PNG (HTTP 200, image/png);
  - flow 2: patient reject with reason → `patient_signing_rejected` audit row with
    reason + ip + UA, link consumed, record still `sent`, active-link query → null.
- **Screenshots** (Playwright headless Chromium, committed under `reports/qa_scripts/`):
  `signing_ux_review_link_card.png`, `signing_ux_review_link_created_qr.png`
  (card + QR + copy + valid-until on the sent review page; Evidence-freshness nav
  entry visible), `signing_ux_patient_sign_typed.png`,
  `signing_ux_patient_sign_drawn.png` (real stroke rendered in the pad; sign
  button still disabled because the name field is empty — the gate working).
- Throwaway containers and dev server torn down after the run.

## NOT DONE / flags
- **Server-side re-validation of emptiness is pixel-level impossible** for a PNG
  without image decoding; server still accepts `signingMethod: "drawn"` without
  image data (pre-existing contract, unchanged). The isEmpty gate is client-side
  (as specified); the stroke JSON now gives auditors point-level evidence.
- `link_opened` logs every successful open (multiple rows if reopened before
  signing). The patient page pins its query (`staleTime: Infinity`,
  no refetch-on-focus) so a normal visit logs once.
- Older still-valid links are NOT revoked when a new one is issued (backend
  behaviour unchanged); the card says so.
- Hash-chaining ceremony events = backlog A2, deliberately untouched (fence).
- FINDING #2 (fresh-DB migrate/push defects) reconfirmed, untouched (C4 scope).
- No dedupe of `consent.patient_viewed` server-side (client pings once per load).

## FILES TOUCHED (fence proof)
`git diff --stat 5e49ef3..HEAD -- server client shared drizzle`:
- client: `components/SignaturePadField.tsx` (new), `components/PatientSigningLinkCard.tsx`
  (new), `lib/signingGate.ts` + test (new), `pages/ReviewConsent.tsx`,
  `pages/PatientSign.tsx`, `pages/Records.tsx`, `components/AppShell.tsx`
- server: `routers/consents.ts`, `routers/patientSigningCeremony.integration.test.ts` (new)
- plus `package.json`/`pnpm-lock.yaml` (signature_pad, qrcode, @types/qrcode) and
  `reports/qa_scripts/signing_ux_*` evidence.
- **NOT touched (fenced):** `server/services/consentSnapshot.ts`,
  `server/services/consentNotary.ts`, `server/services/marketCompliance.ts`,
  lot-expiry validation, clinic membership/join, `drizzle/` (migrations 0000–0027
  and schema — zero schema change).
