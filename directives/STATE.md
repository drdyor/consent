# Aegis Consent + Shop — directive queue state

**Current window:** WINDOW_S0 — `WINDOW_S0_DEMANUS.md` (de-Manus migration — EXISTENTIAL, first)
**On completion:** update this file to point at the next window, then proceed.

Read `HANDOVER_AEGIS_CONSENT.md` and the clinic repo's `STRATEGY.md` first. Decision
(Eva, 2026-08-21): **consent + shop live together in this repo.** This becomes the
distribution/commerce product — consent forms + the B2B shop that sells aesthetics/implants
to clinics + lab bundling — built on Aegis's existing supplier/evidence backbone.

**Queue (ordered for the 3-day Manus free window ending 2026-08-24):**
[WINDOW_C1 done] → WINDOW_S0 (de-Manus migration) → WINDOW_S1 (shop foundation: seller catalog
+ purchase-in + batch/expiry) → WINDOW_S2 (shop transactions: sales orders + shipping to clinics
+ lab marketplace) → WINDOW_C2 (patient entity + self-service signing) → WINDOW_C3
(evidence-freshness monitoring).

**Why this order:** de-Manus is existential — this product DIES on 2026-08-24 unless it's off
the Manus platform, and building shop features on the un-migrated stack is building on sand.
After that, the new revenue layer (S1, S2), then consent polish (C2, C3).

**Labs split:** the COMMERCIAL lab side (marketplace, bundling, partner-lab pricing) is here in
WINDOW_S2; the CLINICAL lab side (order-from-encounter, result capture, interpretation) lives in
the clinic app's decision support (clinic WINDOW_13). They connect by the clinic referencing this
lab catalog.

**Permanent rules:** (a) behaviour, not source greps — extend the existing 22-test suite with
real integration tests; reproduce-before-fix; (b) signed snapshots immutable — append, never
edit; (c) synthetic data only; (d) NO Manus/Forge/MySQL after WINDOW_S0 — portable auth, S3/
MinIO, Postgres; (e) clinical/legal/pricing CONTENT stays with Eva/counsel; (f) selling
medical devices/injectables/labs is a REGULATED distribution business — the software models
the workflow; the wholesale-distribution licensing is an operator/counsel gate, NOT the
builder's; (g) each window: tests green → committed → pushed → STATE.md updated → next.

## Log
- 2026-08-21: queue created (Claude, "max Manus before 08-24"). WINDOW_C1-C4 authored.
- 2026-08-21: WINDOW_C1 completed (Manus). Added append-only hash-chained signed-consent
  withdrawal, retryable Hedera testnet notary adapter and Mirror Node verification, protected
  status controls, migration 0021, report, and behavioral tests. No live Hedera credentials or
  real data used.
- 2026-08-21: reorganised into consent+SHOP product (Eva: "consent and shop together").
  De-Manus moved to current (existential); shop windows S0/S1/S2 added; labs split clinic+shop.
