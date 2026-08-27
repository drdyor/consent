/**
 * WINDOW S2A SHOP SMOKE — outbound sales orders + fulfilment + immutable invoice,
 * live against a locally booted Aegis Consent (throwaway aegis-shop-mysql DB, port
 * 33115; server per SHOP_SMOKE_BASE). Runs ON TOP of the S1 smoke state (products,
 * lots). Synthetic data only. Not part of the product.
 * Run: SHOP_SMOKE_BASE=http://localhost:3118 npx tsx reports/qa_scripts/shop_smoke_s2a.ts
 *
 * Trap runs included (all must be REFUSED):
 *  - shipping an order with an unallocated line (order_lot_traceability)
 *  - allocating an expired/unlisted lot to an order line
 *  - issueInvoice carrying a wired payment field (no_charge, strict schema)
 *  - issuing a second invoice for the same order (immutability)
 */
import { SignJWT } from "jose";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "../../server/routers";

const BASE = process.env.SHOP_SMOKE_BASE || "http://localhost:3118";
const SECRET = new TextEncoder().encode("aegis-shop-secret-2026");

async function mintCookie(openId: string, name: string) {
  const jwt = await new SignJWT({ openId, appId: "local-shop", name }).setProtectedHeader({ alg: "HS256", typ: "JWT" }).setExpirationTime("2h").sign(SECRET);
  return `app_session_id=${jwt}`;
}
function client(cookie?: string) {
  return createTRPCClient<AppRouter>({ links: [httpBatchLink({ url: `${BASE}/api/trpc`, transformer: superjson, headers: cookie ? { cookie } : {} })] });
}
const log = (label: string, value: unknown) => console.log(`\n### ${label}\n${typeof value === "string" ? value : JSON.stringify(value, null, 1)?.slice(0, 2600)}`);
async function attempt<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  try { const r = await fn(); log(`OK ${label}`, r as unknown); return r; }
  catch (e: any) { log(`ERR ${label}`, e?.message || String(e)); return null; }
}

const RUN = Date.now().toString(36).toUpperCase();
async function main() {
  const eva = client(await mintCookie("smoke-eva-shop", "SYNTH-Eva Operator"));

  // Fresh sellable stock on the governed product (S1 left LOT-FRESH sold out).
  const catalog0 = await eva.shop.sellerCatalog.query();
  const governed = catalog0.find(entry => entry.sellable);
  if (!governed) throw new Error("no sellable product from S1 state");
  const expiredLot = catalog0.flatMap(entry => entry.lots).find(lot => lot.expiryState === "expired");
  const orders = await eva.supplierOps.purchaseOrders.query();
  const line1 = orders[0]?.lines[0]?.line.id;
  if (!line1) throw new Error("S1 purchase order line not found");
  const lot2 = await attempt("receivePurchaseLine LOT-FRESH-2 (30 units for outbound sale)", () =>
    eva.shop.receivePurchaseLine.mutate({ purchaseOrderLineId: line1, receivedQuantity: 30, lotNumber: `LOT-FRESH-${RUN}`, expiryDate: new Date("2028-06-30"), unitCostBought: 140, costCurrency: "PLN" }));
  if (!lot2) throw new Error("restock failed");
  await attempt("listLotForSale LOT-FRESH-2", () => eva.shop.listLotForSale.mutate({ inventoryLotId: (lot2 as any).lotId }));

  // Sales order: line A unallocated (10), line B allocated at creation (5).
  const so = await attempt("createSalesOrder SO-S2A (line A unallocated, line B allocated)", () =>
    eva.shopOrders.createSalesOrder.mutate({ orderNumber: `SO-S2A-${RUN}`, buyerName: "SYNTH Clinic Sliema", shippingAddress: "1 Synthetic Street, Sliema, Malta", lines: [
      { productId: governed.product.id, quantity: 10, quantityUnit: "units" },
      { productId: governed.product.id, quantity: 5, quantityUnit: "units", inventoryLotId: (lot2 as any).lotId },
    ] }));
  if (!so) throw new Error("sales order creation failed");
  const listed = await eva.shopOrders.salesOrders.query();
  const entry = listed.find(item => item.order.orderNumber === `SO-S2A-${RUN}`);
  if (!entry) throw new Error("created sales order not found");
  const lineA = entry.lines.find(item => !item.line.inventoryLotId)?.line.id!;
  const lineB = entry.lines.find(item => Boolean(item.line.inventoryLotId))?.line.id!;
  log("sales order line ids", { lineA, lineB });

  await attempt("confirmSalesOrder", () => eva.shopOrders.confirmSalesOrder.mutate({ salesOrderId: (so as any).salesOrderId }));

  // TRAP: order_lot_traceability — line A has no lot.
  await attempt("TRAP shipSalesOrder with UNALLOCATED line A (EXPECT REFUSAL)", () => eva.shopOrders.shipSalesOrder.mutate({ salesOrderId: (so as any).salesOrderId }));
  // TRAP: allocating an expired (never listed) lot.
  if (expiredLot) await attempt("TRAP allocateOrderLine to EXPIRED lot (EXPECT REFUSAL)", () => eva.shopOrders.allocateOrderLine.mutate({ salesOrderLineId: lineA, inventoryLotId: expiredLot.id }));
  await attempt("allocateOrderLine A -> LOT-FRESH-2", () => eva.shopOrders.allocateOrderLine.mutate({ salesOrderLineId: lineA, inventoryLotId: (lot2 as any).lotId }));

  // Operator price on line A only; line B stays deliberately unpriced.
  await attempt("setLineSellPrice line A = 200 PLN (operator content)", () => eva.shopOrders.setLineSellPrice.mutate({ salesOrderLineId: lineA, unitSellPrice: 200, sellCurrency: "PLN" }));

  await attempt("shipSalesOrder (draws down LOT-FRESH-2 by 15)", () => eva.shopOrders.shipSalesOrder.mutate({ salesOrderId: (so as any).salesOrderId }));

  // TRAP: no_charge — wired payment field must be rejected at the contract boundary.
  await attempt("TRAP issueInvoice with capturePayment field (EXPECT REFUSAL: strict schema)", () =>
    (eva.shopOrders.issueInvoice as any).mutate({ salesOrderId: (so as any).salesOrderId, invoiceNumber: `INV-S2A-${RUN}`, capturePayment: true, cardNumber: "4111111111111111" }));

  await attempt("deliverSalesOrder", () => eva.shopOrders.deliverSalesOrder.mutate({ salesOrderId: (so as any).salesOrderId }));
  const invoice = await attempt("issueInvoice INV-S2A-001 (immutable, issued-not-collected)", () => eva.shopOrders.issueInvoice.mutate({ salesOrderId: (so as any).salesOrderId, invoiceNumber: `INV-S2A-${RUN}` }));
  // TRAP: immutability — second invoice refused.
  await attempt("TRAP issueInvoice AGAIN (EXPECT REFUSAL: immutable, never reissued)", () => eva.shopOrders.issueInvoice.mutate({ salesOrderId: (so as any).salesOrderId, invoiceNumber: `INV-S2A-${RUN}-B` }));

  const after = await eva.shopOrders.salesOrders.query();
  const final = after.find(item => item.order.orderNumber === `SO-S2A-${RUN}`);
  log("final order state", { status: final?.order.status, invoice: final?.invoice ? { invoiceNumber: final.invoice.invoiceNumber, status: final.invoice.status, snapshotHash: final.invoice.snapshotHash } : null });
  log("sealed invoice snapshot", final?.invoice?.snapshot);

  const catalog1 = await eva.shop.sellerCatalog.query();
  const lotAfter = catalog1.flatMap(item => item.lots).find(lot => lot.lotNumber === `LOT-FRESH-${RUN}`);
  log("stock reconciliation LOT-FRESH-2 (30 received − 15 shipped = 15)", { received: lotAfter?.receivedQuantity, sold: lotAfter?.soldQuantity, onHand: lotAfter?.onHand });
  if (lotAfter?.onHand !== 15) throw new Error(`stock did not reconcile: expected 15 on hand, got ${lotAfter?.onHand}`);
  if (!invoice) throw new Error("invoice issuance failed");
}

main().then(() => { console.log("\nSMOKE COMPLETE"); process.exit(0); }).catch(error => { console.error("\nSMOKE FAILED", error); process.exit(1); });
