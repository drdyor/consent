# Aegis Consent + Shop — directive queue state

**Current window:** ⛔ WINDOW_C4 — standalone Aegis portability implementation (GATED: product direction is standalone; wait for target-hosting and runtime-owner decisions before migration code or data transfer)
**On completion:** update this file to point at the next window, then proceed.

Read `HANDOVER_AEGIS_CONSENT.md` and the clinic repo's `STRATEGY.md` first. Decision
(Eva, 2026-08-21): **consent + shop live together in this repo.** This becomes the
distribution/commerce product — consent forms + the B2B shop that sells aesthetics/implants
to clinics + lab bundling — built on Aegis's existing supplier/evidence backbone.

**Active task queue (operator instruction):** [WINDOW_C1 done] → [WINDOW_C2 done] → WINDOW_C3
(evidence-freshness monitoring) → ⛔ WINDOW_C4. Do **not** begin de-Manus work at WINDOW_C4;
pause for the user’s explicit decision.

**Recorded future plan (not activated in this task):** the upstream Consent+Shop handover proposes
WINDOW_S0 (de-Manus), WINDOW_S1 (shop foundation), and WINDOW_S2 (commerce/labs). That plan is
preserved in its directive files, but the active task follows the user’s stated C1→C3 sequence and
must stop before de-Manus work.

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
- 2026-08-21: WINDOW_C2 completed (Manus). Added encrypted clinic-scoped patient entities, controlled legacy linkage, patient history, time-boxed one-use public signing capabilities, immutable patient-bound snapshots, migration 0022, report, and behavioral tests. Synthetic data only. WINDOW_C3 handed over.
- 2026-08-21: WINDOW_C3 completed (Manus). Added immutable signed-consent evidence-freshness flags, administrator review queue, deterministic manual recheck, task-UID-bound daily endpoint/configuration, migrations 0023/0024, report, and behavior tests. WINDOW_C4 is now paused pending the user’s explicit de-Manus decision.
- 2026-08-26: Working product direction recorded: Aegis remains the standalone Operations Hub for consent, stock, procurement, and a future shop/search API. Dental, aesthetics, and MD clinical products use Aegis through a native workflow and a governed consent API. Architecture and sandbox/runtime handovers are committed; no de-Manus runtime migration, data transfer, secret export, or hosting cutover has started.
