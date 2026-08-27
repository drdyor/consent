/**
 * WINDOW S1 SHOP SMOKE — seller catalog + purchase-in + batch/expiry gates,
 * live against a locally booted Aegis Consent (throwaway aegis-shop-mysql DB,
 * port 33114; server on 3118). Synthetic data only. Not part of the product.
 * Run: npx tsx reports/qa_scripts/shop_smoke_s1.ts
 *
 * Trap runs included (all must be REFUSED):
 *  - purchase receipt without unit cost (cost_provenance)
 *  - listing an EXPIRED lot (expiry_blocks_sale)
 *  - listing a lot of an evidence-unapproved product (evidence gate)
 *  - overselling a lot (stock_integrity)
 */
import { SignJWT } from "jose";
import { createTRPCClient, httpBatchLink } from "@trpc/client";
import superjson from "superjson";
import type { AppRouter } from "../../server/routers";

const BASE = process.env.SHOP_SMOKE_BASE || "http://localhost:3118";
const SECRET = new TextEncoder().encode("aegis-shop-secret-2026");

async function mintCookie(openId: string, name: string) {
  const jwt = await new SignJWT({ openId, appId: "local-shop", name })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setExpirationTime("2h")
    .sign(SECRET);
  return `app_session_id=${jwt}`;
}

function client(cookie?: string) {
  return createTRPCClient<AppRouter>({
    links: [httpBatchLink({ url: `${BASE}/api/trpc`, transformer: superjson, headers: cookie ? { cookie } : {} })],
  });
}

const log = (label: string, value: unknown) =>
  console.log(`\n### ${label}\n${typeof value === "string" ? value : JSON.stringify(value, null, 1)?.slice(0, 2000)}`);

async function attempt<T>(label: string, fn: () => Promise<T>): Promise<T | null> {
  try { const r = await fn(); log(`OK ${label}`, r as unknown); return r; }
  catch (e: any) { log(`ERR ${label}`, e?.message || String(e)); return null; }
}

const disclosures = [{ scope: "product" as const, kind: "warning" as const, title: "SYNTH warning", body: "Synthetic disclosure body for smoke testing only.", requiredAcknowledgement: true }];

async function main() {
  const eva = client(await mintCookie("smoke-eva-shop", "SYNTH-Eva Operator"));
  await attempt("workspace.overview (auto-provision fresh clinic, admin)", () => eva.workspace.overview.query());

  // ---- Product 1: fully governed (registry verified + canonical verified + approved)
  const p1 = await attempt("createProductSource SYNTH Filler (with registry evidence)", () =>
    eva.catalog.createProductSource.mutate({ productName: "SYNTH Filler", manufacturer: "SYNTH Labs", category: "ha_filler", jurisdiction: "PL", language: "pl", registryAuthority: "URPL", registryIdentifier: "PL-SYNTH-1", documentTitle: "SYNTH Filler SPC", documentUrl: "https://example.com/synth-spc.pdf", documentVersion: "v1.0", documentKind: "spc", disclosures }));
  if (!p1) throw new Error("product 1 creation failed");
  await attempt("verifyCanonicalSource p1", () => eva.catalog.verifyCanonicalSource.mutate({ sourceId: (p1 as any).sourceId, note: "Synthetic canonical verification note for the S1 shop smoke run." }));
  await attempt("approveSource p1 (market evidence gate must pass)", () => eva.catalog.approveSource.mutate({ sourceId: (p1 as any).sourceId }));

  // ---- Product 2: NO registry evidence — must stay unsellable
  const p2 = await attempt("createProductSource SYNTH NoEvidence (no registry evidence)", () =>
    eva.catalog.createProductSource.mutate({ productName: "SYNTH NoEvidence", manufacturer: "SYNTH Labs", category: "medical_device", jurisdiction: "PL", language: "pl", documentTitle: "SYNTH NoEvidence IFU", documentUrl: "https://example.com/synth-ifu.pdf", documentVersion: "v1.0", documentKind: "ifu", disclosures }));
  if (!p2) throw new Error("product 2 creation failed");
  await attempt("verifyCanonicalSource p2 (attestation alone is not market evidence)", () => eva.catalog.verifyCanonicalSource.mutate({ sourceId: (p2 as any).sourceId, note: "Synthetic canonical verification note for the S1 shop smoke run." }));
  await attempt("approveSource p2 (EXPECT REFUSAL: eu_registry_missing)", () => eva.catalog.approveSource.mutate({ sourceId: (p2 as any).sourceId }));

  // ---- Purchase order with three lines
  const po = await attempt("createPurchaseOrder (3 lines)", () => eva.supplierOps.createPurchaseOrder.mutate({
    supplierName: "MedSupply SYNTH", purchaseOrderNumber: "PO-S1-SMOKE-001", orderedAt: new Date(),
    lines: [
      { productId: (p1 as any).productId, expectedQuantity: 20, quantityUnit: "units" },
      { productId: (p1 as any).productId, expectedQuantity: 10, quantityUnit: "units" },
      { productId: (p2 as any).productId, expectedQuantity: 5, quantityUnit: "units" },
    ],
  }));
  if (!po) throw new Error("purchase order creation failed");
  const orders = await eva.supplierOps.purchaseOrders.query();
  const order = orders.find(entry => entry.order.purchaseOrderNumber === "PO-S1-SMOKE-001");
  if (!order) throw new Error("created order not found");
  const [lineFresh, lineExpired, lineNoEvidence] = order.lines.map(item => item.line.id);
  log("line ids", { lineFresh, lineExpired, lineNoEvidence });

  // TRAP: cost provenance — no unit cost
  await attempt("TRAP receivePurchaseLine WITHOUT unit cost (EXPECT REFUSAL)", () =>
    eva.shop.receivePurchaseLine.mutate({ purchaseOrderLineId: lineFresh, receivedQuantity: 20, lotNumber: "LOT-FRESH", expiryDate: new Date("2028-12-31") } as any));

  // Purchase-in creates lots
  const lotFresh = await attempt("receivePurchaseLine fresh lot (supplier+cost+expiry)", () =>
    eva.shop.receivePurchaseLine.mutate({ purchaseOrderLineId: lineFresh, receivedQuantity: 20, lotNumber: "LOT-FRESH", expiryDate: new Date("2028-12-31"), unitCostBought: 150, costCurrency: "PLN" }));
  const lotExpired = await attempt("receivePurchaseLine ALREADY-EXPIRED lot (received but flagged)", () =>
    eva.shop.receivePurchaseLine.mutate({ purchaseOrderLineId: lineExpired, receivedQuantity: 10, lotNumber: "LOT-EXPIRED", expiryDate: new Date("2024-01-01"), unitCostBought: 90, costCurrency: "PLN" }));
  const lotNoEvidence = await attempt("receivePurchaseLine lot for evidence-unapproved product", () =>
    eva.shop.receivePurchaseLine.mutate({ purchaseOrderLineId: lineNoEvidence, receivedQuantity: 5, lotNumber: "LOT-NOEV", expiryDate: new Date("2028-12-31"), unitCostBought: 40, costCurrency: "PLN" }));
  if (!lotFresh || !lotExpired || !lotNoEvidence) throw new Error("purchase-in failed");

  // TRAP: expiry_blocks_sale
  await attempt("TRAP listLotForSale on EXPIRED lot (EXPECT REFUSAL)", () => eva.shop.listLotForSale.mutate({ inventoryLotId: (lotExpired as any).lotId }));
  // TRAP: evidence gate
  await attempt("TRAP listLotForSale on evidence-unapproved product lot (EXPECT REFUSAL)", () => eva.shop.listLotForSale.mutate({ inventoryLotId: (lotNoEvidence as any).lotId }));
  // Happy path
  await attempt("listLotForSale fresh approved lot", () => eva.shop.listLotForSale.mutate({ inventoryLotId: (lotFresh as any).lotId }));

  // stock_integrity
  await attempt("recordSale 12 of 20 (stock reconciles)", () => eva.shop.recordSale.mutate({ inventoryLotId: (lotFresh as any).lotId, quantity: 12, buyerReference: "SYNTH Clinic Sliema" }));
  await attempt("TRAP recordSale 9 with 8 on hand (EXPECT REFUSAL: never negative)", () => eva.shop.recordSale.mutate({ inventoryLotId: (lotFresh as any).lotId, quantity: 9 }));
  await attempt("recordSale exactly remaining 8 (allowed)", () => eva.shop.recordSale.mutate({ inventoryLotId: (lotFresh as any).lotId, quantity: 8 }));
  await attempt("TRAP recordSale from emptied lot (EXPECT REFUSAL: no stock)", () => eva.shop.recordSale.mutate({ inventoryLotId: (lotFresh as any).lotId, quantity: 1 }));

  const catalog = await attempt("shop.sellerCatalog", () => eva.shop.sellerCatalog.query());
  log("catalog summary", (catalog || []).map(entry => ({ product: entry.product.name, sellable: entry.sellable, gate: entry.evidenceGate.code, price: entry.product.sellPriceNote || "Price set by operator", lots: entry.lots.map(lot => ({ lot: lot.lotNumber, expiry: lot.expiryState, stock: lot.stockState, onHand: lot.onHand, listed: lot.isListed, blocked: lot.saleBlocked })) })));
  const alerts = await attempt("shop.stockAlerts", () => eva.shop.stockAlerts.query());
  log("alerts summary", { expired: (alerts as any)?.expired.map((item: any) => item.lotNumber), lowStock: (alerts as any)?.lowStock.map((item: any) => item.lotNumber), nearExpiry: (alerts as any)?.nearExpiry.map((item: any) => item.lotNumber) });
}

main().then(() => { console.log("\nSMOKE COMPLETE"); process.exit(0); }).catch(error => { console.error("\nSMOKE FAILED", error); process.exit(1); });
