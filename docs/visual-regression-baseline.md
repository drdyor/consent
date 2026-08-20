# Premium Data-Surface Visual Baseline

**Purpose:** This document records the intended visual baseline for the premium data surfaces introduced on 20 August 2026. It is a design-regression reference, not clinical or regulatory evidence. The accompanying automated contracts live in `client/src/visualSurfaces.test.ts` and `client/src/pages/MarketCatalogue.render.test.tsx`.

| Surface | Verified viewport | Required visual hierarchy | Evidence boundary that must remain visible |
|---|---:|---|---|
| `/catalogue` | Desktop 1280 × 720; mobile 375 × 812 | Deep emerald editorial hero; warm-cream metrics; evidence-ledger rows; state chips; source-hierarchy side panel | The “Clinical boundary preserved” callout and the statement that catalogue records cannot enter consent, inventory, or source workflows without separate review. |
| `/templates` | Desktop 1280 × 720; mobile 375 × 812 | Editorial governance header; gold provenance rules; controlled-structure ledger; evidence-register panel; traceability ledger | Canonical-document, registry, and administrator-approval states must remain distinct before patient-form use. |
| Shared application shell | Desktop and mobile | Layered emerald sidebar; warm glass top bar; shield/evidence-boundary motif | Sidebar wording must continue to state that only approved SPC, PI, and IFU records can enter patient-ready consents. |

> The intended aesthetic is **quiet-luxury clinical governance**: deep emerald, warm cream, restrained gold, editorial serif display typography, and document/registry-inspired hierarchy. Surfaces should signal authority and restraint rather than a generic SaaS dashboard.

## Capture record

The catalogue, template library, and dashboard were visually reviewed at the viewports listed above after the premium treatment was applied. The responsive catalogue stacks its hero, metrics, evidence rows, hierarchy panel, and conversion boundary without clipping. The source library retains readable action controls and provenance states at mobile width.

## Checked-in image baselines

| Artifact | Route | Viewport | Role |
|---|---|---:|---|
| `docs/visual-baselines/images/catalogue-desktop.png` | `/catalogue` | 1280 × 720 | Desktop reference for the evidence-led catalogue. |
| `docs/visual-baselines/images/source-library-desktop.png` | `/templates` | 1280 × 720 | Desktop reference for templates, canonical sources, and inventory ledger. |
| `docs/visual-baselines/images/catalogue-mobile.png` | `/catalogue` | 375 × 812 | Mobile reference for the stacked catalogue experience. |
| `docs/visual-baselines/images/source-library-mobile.png` | `/templates` | 375 × 812 | Mobile reference for governed source controls and traceability data. |

The SHA-256 digests are retained in `docs/visual-baselines/images/SHA256SUMS`. The automated baseline contract checks that every listed image and digest remains present alongside the required layout, copy, and component surface hooks.

## Controlled update workflow

When an intentional visual change is approved, capture the catalogue and source-library routes again at the two baseline viewports, replace the corresponding files, regenerate `SHA256SUMS`, update the baseline manifest only if the target hierarchy changes, and run the complete test suite. A reviewer should inspect the changed image artifacts before accepting the checkpoint. The baseline must **not** be refreshed merely to conceal an unintended layout or hierarchy regression.
