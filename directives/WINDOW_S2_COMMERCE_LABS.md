# WINDOW S2 — Shop transactions + lab marketplace (outbound)

Single controlling document. Runs on the migrated stack. This is the OUTBOUND side — clinics
buy from Eva, and the lab-bundling marketplace. Synthetic only; behaviour-first.

## A — Sales orders + fulfilment to clinics
- A clinic (a tenant, reusing the existing clinic model) places a sales order against the
  seller catalog (WINDOW_S1). Order → confirm → ship → deliver status; each line draws down a
  specific stock lot (so the buyer gets a traceable lot + expiry — critical for devices).
- Invoicing reuses the immutable, hash-backed invoice pattern. **Nothing charges** — payment is
  an operator/seam decision (no payment provider integrated); orders end at
  `invoice-issued-not-collected`. Shipping is a status + address, not a carrier integration.

## B — Lab marketplace (the COMMERCIAL lab side; clinical lab side lives in the clinic app)
- A catalog of lab tests/panels Eva resells, with her negotiated/bundled pricing and the
  partner lab per test. Clinics order labs through this catalog (an order type alongside product
  sales). This is the marketplace/pricing layer ONLY — ordering-from-the-encounter, result
  capture, and interpretation live in the CLINIC app's decision-support (clinic WINDOW_13); the
  two connect by the clinic referencing this lab catalog.
- Bundles: group tests into a priced panel; partner-lab and cost-vs-sell recorded per test.

## Gates (+ traps)
- `order_lot_traceability`: every shipped product line references a specific lot with expiry;
  a shipped line with no lot FAILS.
- `no_charge`: no payment/charge code path exists; orders end at issued-not-collected. Trap: a
  wired payment call FAILS.
- `lab_catalog_priced`: every lab/bundle resolves partner-lab + cost + sell price (or explicit
  placeholder); a price literal in code FAILS (pricing is operator content).

## Definition of done
Integration tests green; sales orders + fulfilment + lab marketplace on synthetic data;
committed + pushed; `reports/WINDOW_S2_REPORT.md`. Update STATE.md →
`WINDOW_C2_PATIENT_SIGNING.md`. Regulated-distribution licensing + real pricing = operator/counsel.
