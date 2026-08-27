# SurveyJS license audit — surveyjs-forms-2026-08-28

Audited 2026-08-27 against the **installed** packages in `node_modules` (not the registry page).

## Installed packages

| Package | Installed version | License (package.json `license` field) | Runtime deps | Peer deps |
|---|---|---|---|---|
| `survey-core` | **3.0.2** | **MIT** | none | none |
| `survey-react-ui` | **3.0.2** | **MIT** | none | `survey-core@3.0.2`, `react`, `react-dom` |

- Verified by reading `node_modules/survey-core/package.json` and `node_modules/survey-react-ui/package.json` directly (`license: "MIT"` in both).
- Neither package ships a `LICENSE` file inside the npm tarball; the MIT declaration is the package.json field. Upstream repo (surveyjs/survey-library) is MIT-licensed.
- **Zero runtime dependencies** — nothing commercial can ride in transitively.

## Banned-commercial check

- `survey-creator*`, `survey-pdf`, `survey-analytics` (SurveyJS **commercial** products) — **NOT installed**: `ls node_modules | grep -i "survey\|creator"` returns only `survey-core` and `survey-react-ui`.
- `grep -c "survey-creator" pnpm-lock.yaml` → **0**.
- No code imports anything beyond `survey-core` / `survey-react-ui` / `survey-core/survey-core.css` (client `SurveyConsentFormInner.tsx` and the shared test file are the only importers).

## Import surface

| File | Imports |
|---|---|
| `client/src/components/SurveyConsentFormInner.tsx` | `survey-core` (Model), `survey-react-ui` (Survey), `survey-core/survey-core.css` — lazy-loaded chunk only |
| `shared/templateToSurvey.ts` | **none** (plain JSON derivation; no SurveyJS import, usable server-side) |
| `shared/templateToSurvey.test.ts` | `survey-core` (Model, test-only, to exercise the real visibleIf engine) |

Verdict: **MIT-only. No commercial SurveyJS product present or reachable.**
