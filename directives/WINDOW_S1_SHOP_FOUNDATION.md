# WINDOW S1 — Shop foundation (seller catalog + purchase-in + batch/expiry)

Single controlling document. Runs on the migrated stack (WINDOW_S0). This is the INBOUND side
of the B2B shop — what Eva stocks to sell to clinics. It extends Aegis's existing supplier/
purchase-order module rather than importing a warehouse system. Synthetic only; behaviour-first.

## Business context (3 sentences)
Eva sells aesthetics and dental implants (and later, lab bundles) to clinics. This window models
what she buys to sell: a seller product catalog, purchases from her own suppliers, and per-batch
stock with expiry — the compliance-critical spine for reselling medical devices/injectables.
It reuses the existing `products`, `productSources`, `supplierPurchaseOrders`, and
`productInventoryLots` tables; it does NOT embed InvenTree/OpenBoxes/etc.

## Build (data model + tRPC + UI)
- **Seller catalog:** a sellable-product view over `products` (name, classification, market
  evidence from the existing evidence gate, sell price placeholder — pricing is operator content).
- **Purchase-in:** extend `supplierPurchaseOrders`/`Lines` + `productInventoryLots` so a received
  purchase creates stock lots with `lotNumber`, `expiryDate`, `quantity`, `unitCostBought`,
  `supplier`. Reference PerishTrack/OSPOS DATA MODELS only.
- **Batch/expiry as first class:** low-stock + near-expiry + expired states; an expired lot is
  blocked from sale (fail-closed) and logged.
- The evidence gate applies: a device/injectable with no approved market evidence cannot be
  listed for sale.

## Gates (+ traps)
- `expiry_blocks_sale`: an expired or unapproved-evidence lot cannot be added to a sellable
  listing. Trap: listing an expired lot FAILS.
- `stock_integrity`: received quantity, sold quantity, and on-hand reconcile; no negative stock.
- `cost_provenance`: every lot carries supplier + unit cost + expiry; a lot missing these FAILS.

## Definition of done
Integration tests green; seller catalog + purchase-in + batch/expiry on synthetic data;
committed + pushed; `reports/WINDOW_S1_REPORT.md`. Update STATE.md → `WINDOW_S2_COMMERCE_LABS.md`.
