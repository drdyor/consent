# WINDOW S1 REPORT — Shop foundation (+ WINDOW S2 section A)

Date: 2026-08-28 (session resumed after a rate-limit kill mid-live-smoke).
Branch: `shop-foundation-2026-08-28` (worktree `C:\Users\Forre\consent-shop`). NOT pushed (explicit instruction for this run; push remains the outstanding DoD step).
Synthetic data only. All refusals fail-closed and logged to `auditEvents`.

## Resume note (honest)
Commits `89f4f6d`, `0f0ec70`, `99a2488` were written by the prior (killed) run. This run did not take them on faith: the router, service, and both test files were **read line by line**, and the full suite re-run, before building further. The prior run's live smoke had also gone further than its handover said — the throwaway DB already contained a received purchase order and three lots, which collided with this run's rerun (unique `(clinicId, purchaseOrderNumber)`). The throwaway DB was truncated and the S1 smoke re-run **fresh end-to-end**; the committed output is that clean run.

## Built

### S1 — inbound (directive WINDOW_S1_SHOP_FOUNDATION.md)
- **Seller catalog** (`shop.sellerCatalog`): sellable-product view over the existing `products`/`productSources`, market evidence via the REAL `getMarketEvidenceGate` (called, never edited), per-lot batch states (ok / near_expiry / expired / no_expiry_recorded; in_stock / low_stock / out_of_stock), honest `saleBlocked`, and an operator price note — the system never invents a price.
- **Purchase-in** (`shop.receivePurchaseLine`): receiving a `supplierPurchaseOrderLines` row creates a `productInventoryLots` lot carrying lotNumber, expiry, quantity, `unitCostBought`, `costCurrency`, `supplierName` (cost_provenance, fail-closed before any write). Already-expired goods may be RECEIVED (they physically arrived) but are flagged in the audit summary and stay sale-blocked.
- **Batch/expiry first-class** (`shop.stockAlerts`): expired / near-expiry (90d) / low-stock (≤5) / missing-expiry queues.
- **Listing + sale** (`shop.listLotForSale`, `shop.recordSale`, `shop.delistLot`, `shop.setSellPriceNote`): evidence + expiry + stock gates re-run at SALE time, not just listing time.
- **UI**: `client/src/pages/SellerCatalog.tsx` + nav entry (evidence-gated listings, batch/expiry badges, operator price placeholder, purchase-in). Committed by the prior run; code-reviewed, not browser-screenshotted this session (flagged below).
- **Schema**: additive columns via hand-written `drizzle/0027_shop_foundation.sql` (journal-registered; adds NO foreign keys — the pre-existing >64-char FK-name push defect is out of scope and untouched).

### S2 section A — outbound (directive WINDOW_S2_COMMERCE_LABS.md §A)
- **Sales orders** (`shopOrders.*`): create → confirm → ship → deliver (+ cancel path in the transition table), buyer = recorded name with optional tenant `buyerClinicId`; shipping is a status + address, not a carrier.
- **Lot allocation**: order lines start lot-less; `allocateOrderLine` binds a line to a SPECIFIC listed, sellable, sufficient lot. `shipSalesOrder` re-runs the full sellable gate per line and draws down each lot's `soldQuantity` (shared-lot lines accumulate; overdraw refused).
- **Immutable invoice** (`issueInvoice`): sealed JSON snapshot + sha256, the same pattern as the signed-consent snapshot (`consentSnapshot.ts` — pattern reused, file untouched). Every sealed line carries its lot number + expiry. One invoice per order, never reissued. Terminal state: **`issued_not_collected`** — the status enum has exactly ONE value by design.
- **Vendor decision (recorded)**: `node-microinvoice` NOT vendored. The directive's invoice requirement is the immutable hash-backed record, which the repo's own consent-snapshot pattern covers with zero new dependencies; no PDF rendering was built this window (the repo's existing server-PDF pattern is available if S2 later wants one), so its licence was never exercised and was not audited.
- **Schema**: `salesOrders`, `salesOrderLines` (nullable `inventoryLotId` until allocated — that is what makes the ship trap real), `salesInvoices`; hand-written `drizzle/0028_shop_sales_orders.sql`, journal-registered, no FKs, identifiers < 64 chars.

## Gates + trap evidence (all tests pass: 40 files / 150 tests; `pnpm check` clean)

| Gate | Trap runs (must FAIL, and did) | Where |
|---|---|---|
| `expiry_blocks_sale` | listing an EXPIRED lot refused + logged; no-expiry lot refused (fail-closed); evidence-unapproved refused via REAL gate (`eu_registry_missing`); sale from a lot that expired AFTER listing refused | `shop.integration.test.ts`, `shopInventory.test.ts` |
| `stock_integrity` | overselling refused ("stock never goes negative") + logged; stored negative balance flagged, not hidden; received − sold = on-hand asserted | same |
| `cost_provenance` | receipt without unit cost / without expiry / with no supplier anywhere all FAIL before any write | same |
| `order_lot_traceability` (S2A) | shipping an unallocated line refused + logged; lot expired after allocation refused at ship; two lines overdrawing one lot refused; wrong-product / unlisted lot cannot be allocated; invoice line without lot/expiry cannot seal | `shopOrders.integration.test.ts`, `salesOrders.test.ts` |
| `no_charge` (S2A) | wired payment fields (`capturePayment`, `cardNumber`) rejected at the contract boundary (strict schemas); second invoice refused (immutable); source scan asserts no payment/charge tokens in shop code and no `pay/charge/collect/refund` procedure; schema scan asserts the invoice enum is exactly `issued_not_collected`; snapshot itself states "Nothing was charged and nothing will be charged by this system." | same |

Plus: invoice hash determinism + tamper detection (any changed line ⇒ different sha256); unpriced lines carry an explicit "Price not recorded" statement — never an invented number; totals only when every line is operator-priced in one currency.

## Live smoke (real server + throwaway MySQL8, recorded outputs committed)
- Stack: `aegis-shop-mysql` (mysql:8, port 33115), server booted from this branch. Smoke user seeded directly in DB (no OAuth server locally). Scripts + full outputs: `reports/qa_scripts/shop_smoke_s1.ts` / `_output.txt`, `shop_smoke_s2a.ts` / `_output.txt`.
- **S1 run (fresh DB)**: governed product approved through the real evidence chain; no-evidence product REFUSED approval (`eu_registry_missing`) even after canonical attestation; costless receipt refused; 3 lots created (fresh / already-expired-flagged / no-evidence); expired + no-evidence listings REFUSED; 12-of-20 sale ok, 9-with-8-on-hand REFUSED, exact-remainder ok, empty-lot REFUSED; catalog + alerts honest (20−20=0 on hand).
- **S2A run**: restock 30 units → list; order with one unallocated + one allocated line; ship-with-unallocated-line REFUSED + logged (`shop.ship_refused`); expired-lot allocation REFUSED; after allocation + operator price, ship drew down 30−15=15 (verified in catalog); payment-field invoice REFUSED (`Unrecognized keys: "capturePayment", "cardNumber"`); invoice sealed, hash `391215fd…b14c`, status `issued_not_collected`; second invoice REFUSED.
- **Audit trail verified in DB**: rows for every gate refusal (`shop.listing_refused`, `shop.sale_refused`, `shop.ship_refused`) and every lifecycle step through `shop.invoice_issued`.
- Teardown: server process stopped and `aegis-shop-mysql` removed after the runs. (Sibling `aegis-surveyjs-*`/`aegis-pdfsmoke-*` containers belong to parallel sessions and were left alone.)

## NOT done (honest list)
- **Not pushed**, and `STATE.md` not updated — both explicitly excluded for this run; they remain the directive's outstanding DoD steps.
- **No UI for S2A** (sales orders, fulfilment, invoices are server + tRPC only); SellerCatalog UI covers S1 and was not screenshot-verified in a browser this session.
- **S2 section B (lab marketplace) not started**; `lab_catalog_priced` gate not built.
- **No invoice PDF** — deliberate (decision above); the sealed record is JSON + sha256.
- **Allocation does not reserve stock**: two open orders can allocate the same units; the overdraw is caught fail-closed at SHIP time, not at allocation. Real reservation accounting = follow-up.
- **Re-receiving a purchase line overwrites `receivedQuantity`** rather than accumulating (inherited S1 behaviour; each receipt still creates its own provenanced lot, so stock itself is not corrupted).
- Migrations 0027/0028 exist on this branch only; **no live/hosted DB migrated**. Fresh-DB `drizzle-kit push` remains broken by the pre-existing >64-char FK-name defect (QA FINDING #2, not this window's scope); the throwaway DB was provisioned around it.
- `orderNumber`/`invoiceNumber` are operator input; no auto-numbering sequence.

## Files touched (fence proof)
All changes `db2b08f..HEAD` (7 commits) are confined to: `drizzle/schema.ts` (additive), new `drizzle/0027`/`0028` migrations + `drizzle/meta/_journal.json` (additive registrations), `server/routers.ts` (2-line registration), new `server/routers/shop.ts` / `shopOrders.ts` + tests, new `server/services/shopInventory.ts` / `salesOrders.ts` + tests, `client/src/App.tsx` / `AppShell.tsx` / new `SellerCatalog.tsx`, and `reports/qa_scripts/*` smoke artifacts. The only edit inside a pre-existing S1 file this session was exporting `loadSellableContext` from `shop.ts` for reuse.
**Fences untouched**: `consentSnapshot.ts`, `consentNotary.ts`, `marketCompliance.ts` (called, never edited), lot-expiry internals (`inventoryLot.ts`), membership/join, migrations 0000–0026 (and 0027 unmodified since its creation commit). No git author/trailer overrides.

## Commits
| Hash | Subject |
|---|---|
| 89f4f6d | schema: S1 shop foundation columns + migration 0027 (prior run) |
| 0f0ec70 | server: S1 shop router + gate/trap tests (prior run) |
| 99a2488 | client: SellerCatalog page + nav (prior run) |
| 805f40b | smoke: S1 live driver + recorded run |
| 5e643e8 | schema: S2A sales orders + immutable invoices, migration 0028 |
| 5707f4c | server: S2A shopOrders router + gate/trap tests |
| 1b2739f | smoke: S2A live driver + recorded run |
