# Aegis Consent — directive queue state

**Current window:** WINDOW_C1 — `WINDOW_C1_WITHDRAWAL_NOTARY.md`
**On completion:** update this file to point at the next window, then proceed.

Read `HANDOVER_AEGIS_CONSENT.md` first. This queue exists to use the Manus free window
(ends **2026-08-24**) to push Aegis to the next level. It prioritises model improvements that
are valuable in EVERY future (fold into Vitalis, standalone, or both) and defers plumbing that
a strategic decision might discard.

**Queue:** WINDOW_C1 (withdrawal + Hedera notarize) → WINDOW_C2 (patient entity + self-service
signing) → WINDOW_C3 (evidence-freshness monitoring) → ⛔ WINDOW_C4 (de-Manus migration —
GATED on Eva's fold-vs-standalone decision; do NOT start without it).

**Permanent rules:** (a) behaviour, not source greps — extend the existing test suite (22
files) with real integration tests per change; reproduce-before-fix; (b) the signed snapshot
is immutable — never edit a signed record, only append; (c) synthetic data only; (d) clinical/
legal CONTENT (disclosures, consent wording, jurisdiction rules) stays with clinician/counsel;
(e) each window: tests green → committed → pushed → STATE.md updated → next window, no operator
wait except at ⛔.

**Overlap note (conscious):** the Vitalis clinic queue WINDOW_15 ports this consent design into
Vitalis's Python/Postgres stack. Work here advances the model/design that port consumes; it is
not wasted even if Eva later folds Aegis into Vitalis.

## Log
- 2026-08-21: queue created (Claude, operator "max Manus before 08-24"). WINDOW_C1 handed over.
