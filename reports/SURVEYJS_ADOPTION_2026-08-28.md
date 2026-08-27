# SurveyJS adoption — surveyjs-forms-2026-08-28

Resumed and finished 2026-08-27 after the prior run was killed mid-smoke by a rate limit.
Branch: `surveyjs-forms-2026-08-28` (worktree `C:\Users\Forre\consent-surveyjs`), based on the
OSS-adoption branch tip `db2b08f`.

## What was built (commits on this branch)

| Commit | Content |
|---|---|
| `2d52810` | schema: optional `renderEngine` ('sections'\|'surveyjs') on `consentTemplates`, `NOT NULL DEFAULT 'sections'`; hand-written migration `drizzle/0027_surveyjs_render_engine.sql` (no FKs); MIT `survey-core@3.0.2` + `survey-react-ui@3.0.2` added |
| `9e0f9a0` | shared: `templateToSurvey.ts` — survey JSON **derived from stored sections at render time, never stored**; answer capture maps back to the exact `acknowledgedDisclosureIds` payload; round-trip/parity/visibility/default-off tests |
| `801b676` | server: `catalog.createTemplate` accepts `renderEngine` (default 'sections') + optional per-section `condition` (max 500 chars); default-off integration tests incl. rejection of `renderEngine: "creator"` |
| `cf9605b` | client: opt-in lazy-loaded `SurveyConsentForm` in ReviewConsent / PatientSign / CreateConsent preview; template engine picker in Templates; survey acknowledgements feed the SAME `consent.sign` / `consent.patientSign` payload |
| (this run) | live smoke driver + canonical-JSON assert fix, screenshot driver, screenshots, this report, license audit |

## Verified this run (all green)

1. **Critical read of the two rate-limit-orphaned commits** — no fence violations found. `consents.ts` is untouched by this branch; `buildSignedSnapshot` receives an explicit `{ name, revision, sections }` pick, so `renderEngine` can never enter the sealed snapshot or its hash.
2. **`pnpm check`** — clean (tsc --noEmit, zero errors).
3. **`pnpm test`** — **38 files / 103 tests, all pass**, including:
   - round-trip: sections → survey JSON → sections lossless (id, title, body, required, condition);
   - parity: survey answers → identical `acknowledgedDisclosureIds` payload and identical derived `consentAcknowledgements` rows vs the classic checkbox path;
   - conditional visibility in the **real survey-core engine** (hidden until `visibleIf` satisfied; hidden required section does not block, revealed one does);
   - default-off: legacy row (no renderEngine) and 'sections' row never select the survey renderer.
4. **Live smoke** (`reports/qa_scripts/surveyjs_smoke.ts`): throwaway `mysql:8` container `aegis-surveyjs-mysql` on 33114 (reused the prior run's leftover container — schema incl. `renderEngine` already pushed via the known `drizzle-kit push --force` FK-name workaround; all tables truncated and the smoke user re-seeded for a clean run), server `npx tsx server/_core/index.ts` on 3118. All 8 asserts OK:
   - template without renderEngine stored as **'sections'** (default off); opt-in stored as **'surveyjs'**; `condition` persisted on sections (single source of truth);
   - two identical procedure-only consents signed, one per engine — classic `snapshotHash d0505fc38e250a4687d6fb3385efc287c8ee4fc4a9b4987dbdfa8794cc7a5e92`, surveyjs `snapshotHash f0db3afd15d8ec87cfcced8bce7f6f6421dd89d42df5340f41cf588e6a22572e` (hashes differ only because record ids/patients/timestamps differ — the point is the pipeline ran identically);
   - **sealed `snapshot.template` byte-identical across engines**; `renderEngine` appears **nowhere** in either snapshot; snapshot carries the raw sections (incl. `condition`), no `visibleIf`/`panel` survey schema leaked;
   - `verifyNotary` runs on the surveyjs-rendered record (status `unknown` — no Hedera config in smoke, expected).
   - Container and server torn down after; smoke output preserved above.
   - Smoke-script fix made this run: template/snapshot section comparisons now use key-sorted canonical JSON — MySQL JSON columns reorder object keys, so raw `JSON.stringify` equality false-fails while the data is identical.
5. **Bundle-size delta** (vite build of HEAD vs base `db2b08f`, same node_modules):
   | Chunk | Base | HEAD | Delta |
   |---|---|---|---|
   | main `index-*.js` | 1,165.70 kB (gzip 322.09) | 1,169.31 kB (gzip 323.14) | **+3.61 kB raw / +1.05 kB gzip** (picker + lazy wrapper + shared converter) |
   | `SurveyConsentFormInner-*.js` (lazy) | — | 1,609.92 kB (gzip **360.36 kB**) | loaded ONLY when a surveyjs template renders |
   | `SurveyConsentFormInner-*.css` (lazy) | — | 344.28 kB (gzip 39.99 kB) | same |
   `grep -c "SurveyModel" main-chunk` → **0** — survey-core is fully outside the default path.
6. **Screenshots** (Playwright via the promptfoo-bundled chromium, as prior agents): `reports/qa_scripts/surveyjs_patient_sign_light.png`, `..._conditional_revealed.png` (Pregnancy-warning panel appears only after the opening section is acknowledged; sign button stays disabled), `..._dark.png`. Light and dark PNGs are **byte-identical** — the patient-sign page is a fixed light "paper" palette by design, so dark-scheme emulation changes nothing.

## NOT done / flagged

- **Journal gap (pre-existing, base branch)**: `drizzle/0025_*.sql` and `0026_*.sql` exist as files but were never registered in `drizzle/meta/_journal.json`; this branch's 0027 was registered as idx 25 directly after 0024. A fresh `drizzle-kit migrate` would apply 0027 but skip 0025/0026. Live smokes use `drizzle-kit push` so this doesn't bite locally, but it must be reconciled before any hosted migrate run (de-Manus scope, not this branch's fence).
- **Fresh-DB `drizzle-kit push` still dies** at the pre-existing >64-char FK name (`consentEvidenceFreshnessFlags_..._fk`, QA FINDING #2) after creating all tables — unchanged, not worsened (0027 adds no FK).
- **No dark theme exists on the patient page** — screenshots prove absence of a dark variant, not the presence of one.
- **`patientSign` server-side gate is disclosure-based only** (unchanged classic behavior): required *section* acknowledgements are enforced in the survey UI (isRequired + sign-button gating), not re-validated server-side — identical to the classic path, which never sent section acks either. The sealed snapshot never contained per-section ack state on either engine.
- **Migration 0027 not applied to any live/hosted DB** — file on this branch only.
- Templates created via the picker only get `condition` through the API; no visual condition-builder UI (creator products are banned-commercial, deliberately out).

## Fence proof (sealed snapshot pipeline untouched)

`git diff db2b08f HEAD --name-only` — full list, nothing else:

```
client/src/components/SurveyConsentForm.tsx        (new)
client/src/components/SurveyConsentFormInner.tsx   (new)
client/src/components/surveyConsentForm.css        (new)
client/src/pages/CreateConsent.tsx
client/src/pages/PatientSign.tsx
client/src/pages/ReviewConsent.tsx
client/src/pages/Templates.tsx
drizzle/0027_surveyjs_render_engine.sql            (new, no FKs)
drizzle/meta/_journal.json
drizzle/schema.ts
package.json / pnpm-lock.yaml
server/routers/catalog.ts
server/routers/surveyjsRenderEngine.integration.test.ts (new)
shared/templateToSurvey.ts / .test.ts              (new)
vitest.config.ts                                   (adds shared/**/*.test.ts to include)
```

**NOT touched**: `consentSnapshot.ts`, `consentNotary.ts`, `marketCompliance.ts`, lot-expiry, membership/join, `consents.ts`, migrations 0000–0026. Verified by empty diff on each.

## Licenses

See `reports/audits/SURVEYJS_LICENSES.md`: `survey-core@3.0.2` MIT, `survey-react-ui@3.0.2` MIT, zero runtime deps, no `survey-creator*`/commercial package installed or in the lockfile.
