import { describe, expect, it, vi } from "vitest";

/**
 * WINDOW S1 gate + trap coverage over the shop router, using the repo's mocked-db
 * integration pattern (see inventory.integration.test.ts). The REAL market evidence
 * gate (services/marketCompliance.ts) is exercised — it is called, never mocked.
 */

const state = vi.hoisted(() => ({
  db: null as any,
  workspace: { clinic: { id: 4, name: "Example Clinic", logoUrl: null, complianceMarket: "pl_eu", jurisdiction: "PL" }, membership: { role: "admin" } },
}));
vi.mock("../db", () => ({ getDb: vi.fn(async () => state.db) }));
vi.mock("../services/workspace", () => ({
  requireWorkspace: vi.fn(async () => state.workspace),
  requireAdmin: vi.fn(async () => state.workspace),
}));
import { appRouter } from "../routers";

const ctx = { user: { id: 2, openId: "shop-test-user", name: "Dr Example", email: "doctor@example.com", loginMethod: "manus", role: "user" as const, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: {} as any, res: {} as any };
const caller = () => appRouter.createCaller(ctx as any);
const tableName = (table: any) => table?.[Symbol.for("drizzle:Name")];

/** Sequential-select mock db: each db.select() consumes the next result set. */
function makeDb(selectResults: any[][]) {
  const inserts: Record<string, any[]> = {};
  const updates: Record<string, any[]> = {};
  let selectCall = 0;
  let nextId = 100;
  const db = {
    select: vi.fn(() => {
      const rows = selectResults[selectCall++] ?? [];
      const query: any = { from: () => query, innerJoin: () => query, where: () => query, orderBy: async () => rows, limit: async () => rows, then: (resolve: any, reject: any) => Promise.resolve(rows).then(resolve, reject) };
      return query;
    }),
    insert: vi.fn((table: any) => ({ values: vi.fn((values: any) => { (inserts[tableName(table)] ||= []).push(values); return { $returningId: async () => [{ id: nextId++ }] }; }) })),
    update: vi.fn((table: any) => ({ set: vi.fn((values: any) => { (updates[tableName(table)] ||= []).push(values); return { where: async () => undefined }; }) })),
  };
  return { db, inserts, updates };
}

const approvedSource = { id: 8, marketCatalogueProductId: null, reviewStatus: "approved", jurisdiction: "PL", language: "pl", registryAuthority: "URPL", registryIdentifier: "PL-REG-1", registryVerifiedAt: new Date("2026-01-10"), documentKind: "spc" };
const product = { id: 7, sourceId: 8, name: "SYNTH Filler", manufacturer: "SYNTH Labs", category: "ha_filler", registryIdentifier: "PL-REG-1", registryStatus: "verified", isActive: true, sellerListingStatus: "not_listed", sellPriceNote: null };
const freshLot = { id: 19, clinicId: 4, productId: 7, lotNumber: "LOT-500", expiryDate: new Date("2028-12-31"), quantity: "20.00", quantityUnit: "units", soldQuantity: "0.00", supplierName: "MedSupply SYNTH", unitCostBought: "150.00", costCurrency: "PLN", purchaseOrderLineId: 3, listedForSaleAt: null, delistedAt: null, delistReason: null };

describe("shop gate: expiry_blocks_sale", () => {
  it("lists an in-date lot whose source is approved with verified registry evidence", async () => {
    const { db, inserts, updates } = makeDb([[freshLot], [{ product, source: approvedSource }]]);
    state.db = db;
    await expect(caller().shop.listLotForSale({ inventoryLotId: 19 })).resolves.toEqual({ success: true, lotId: 19 });
    expect(updates.productInventoryLots[0]).toMatchObject({ listedByUserId: 2, delistedAt: null });
    expect(updates.productInventoryLots[0].listedForSaleAt).toBeInstanceOf(Date);
    expect(updates.products[0]).toEqual({ sellerListingStatus: "listed" });
    expect(inserts.auditEvents[0]).toMatchObject({ clinicId: 4, action: "shop.lot_listed", entityId: "19" });
  });

  it("TRAP RUN: listing an EXPIRED lot is refused fail-closed and the refusal is logged", async () => {
    const expiredLot = { ...freshLot, expiryDate: new Date("2025-01-01") };
    const { db, inserts, updates } = makeDb([[expiredLot], [{ product, source: approvedSource }]]);
    state.db = db;
    await expect(caller().shop.listLotForSale({ inventoryLotId: 19 })).rejects.toThrow(/Expired lot blocked from sale/);
    expect(updates.productInventoryLots).toBeUndefined();
    expect(updates.products).toBeUndefined();
    expect(inserts.auditEvents[0]).toMatchObject({ clinicId: 4, action: "shop.listing_refused", entityId: "19" });
    expect(inserts.auditEvents[0].summary).toMatch(/Expired lot blocked from sale/);
  });

  it("TRAP RUN: listing a lot whose product lacks approved market evidence is refused (real gate: eu_registry_missing)", async () => {
    const unverifiedSource = { ...approvedSource, registryIdentifier: null, registryVerifiedAt: null };
    const unverifiedProduct = { ...product, registryIdentifier: null, registryStatus: "unverified" };
    const { db, inserts } = makeDb([[freshLot], [{ product: unverifiedProduct, source: unverifiedSource }]]);
    state.db = db;
    await expect(caller().shop.listLotForSale({ inventoryLotId: 19 })).rejects.toThrow(/eu_registry_missing/);
    expect(inserts.auditEvents[0]).toMatchObject({ action: "shop.listing_refused" });
  });

  it("refuses to list when the source review status is not approved, even with registry evidence", async () => {
    const pendingSource = { ...approvedSource, reviewStatus: "pending" };
    const { db, inserts } = makeDb([[freshLot], [{ product, source: pendingSource }]]);
    state.db = db;
    await expect(caller().shop.listLotForSale({ inventoryLotId: 19 })).rejects.toThrow(/not been approved/);
    expect(inserts.auditEvents[0]).toMatchObject({ action: "shop.listing_refused" });
  });

  it("refuses to list a lot with no expiry recorded (fail-closed)", async () => {
    const noExpiryLot = { ...freshLot, expiryDate: null };
    const { db, inserts } = makeDb([[noExpiryLot], [{ product, source: approvedSource }]]);
    state.db = db;
    await expect(caller().shop.listLotForSale({ inventoryLotId: 19 })).rejects.toThrow(/fail-closed/);
    expect(inserts.auditEvents[0]).toMatchObject({ action: "shop.listing_refused" });
  });

  it("refuses a sale from a lot that EXPIRED AFTER it was listed (re-check at sale time)", async () => {
    const listedButNowExpired = { ...freshLot, listedForSaleAt: new Date("2026-01-01"), expiryDate: new Date("2026-06-01") };
    const { db, inserts, updates } = makeDb([[listedButNowExpired], [{ product, source: approvedSource }]]);
    state.db = db;
    await expect(caller().shop.recordSale({ inventoryLotId: 19, quantity: 1 })).rejects.toThrow(/Expired lot blocked from sale/);
    expect(updates.productInventoryLots).toBeUndefined();
    expect(inserts.auditEvents[0]).toMatchObject({ action: "shop.sale_refused" });
  });
});

describe("shop gate: stock_integrity", () => {
  const listedLot = { ...freshLot, listedForSaleAt: new Date("2026-08-01"), soldQuantity: "12.00" };

  it("a sale reduces on-hand: received − sold = on-hand", async () => {
    const { db, inserts, updates } = makeDb([[listedLot], [{ product, source: approvedSource }]]);
    state.db = db;
    await expect(caller().shop.recordSale({ inventoryLotId: 19, quantity: 5, buyerReference: "SYNTH Clinic Sliema" })).resolves.toEqual({ success: true, soldQuantity: 17, onHand: 3 });
    expect(updates.productInventoryLots[0]).toEqual({ soldQuantity: "17" });
    expect(inserts.auditEvents[0]).toMatchObject({ action: "shop.stock_sold" });
    expect(inserts.auditEvents[0].summary).toMatch(/3 remain on hand/);
  });

  it("TRAP RUN: overselling is refused — stock never goes negative — and logged", async () => {
    const { db, inserts, updates } = makeDb([[listedLot], [{ product, source: approvedSource }]]);
    state.db = db;
    await expect(caller().shop.recordSale({ inventoryLotId: 19, quantity: 9 })).rejects.toThrow(/never goes negative/);
    expect(updates.productInventoryLots).toBeUndefined();
    expect(inserts.auditEvents[0]).toMatchObject({ action: "shop.sale_refused" });
  });

  it("refuses a sale from an unlisted lot", async () => {
    const { db } = makeDb([[freshLot], [{ product, source: approvedSource }]]);
    state.db = db;
    await expect(caller().shop.recordSale({ inventoryLotId: 19, quantity: 1 })).rejects.toThrow(/not listed/);
  });
});

describe("shop gate: cost_provenance (purchase-in)", () => {
  const line = { id: 3, purchaseOrderId: 11, productId: 7, expectedQuantity: "20.00", quantityUnit: "units", expectedLotNumber: "LOT-500", receivedQuantity: null };
  const order = { id: 11, clinicId: 4, supplierName: "MedSupply SYNTH", purchaseOrderNumber: "PO-2026-014", status: "ordered" };

  it("receiving a purchase line creates a lot carrying supplier + unit cost + expiry", async () => {
    const { db, inserts, updates } = makeDb([[line], [order], [{ ...line, receivedQuantity: "20.00" }]]);
    state.db = db;
    const result = await caller().shop.receivePurchaseLine({ purchaseOrderLineId: 3, receivedQuantity: 20, lotNumber: "LOT-500", expiryDate: new Date("2028-12-31"), unitCostBought: 150, costCurrency: "PLN" });
    expect(result).toMatchObject({ orderStatus: "received", expiryState: "ok" });
    expect(inserts.productInventoryLots[0]).toMatchObject({ clinicId: 4, productId: 7, lotNumber: "LOT-500", quantity: "20", supplierName: "MedSupply SYNTH", unitCostBought: "150", costCurrency: "PLN", soldQuantity: "0", purchaseOrderLineId: 3, createdByUserId: 2 });
    expect(updates.supplierPurchaseOrderLines[0]).toMatchObject({ receivedQuantity: "20", unitCostBought: "150" });
    expect(updates.supplierPurchaseOrders[0]).toMatchObject({ status: "received" });
    expect(inserts.auditEvents[0]).toMatchObject({ action: "shop.purchase_received" });
  });

  it("TRAP RUN: a receipt without a unit cost FAILS at the contract boundary", async () => {
    const { db, inserts } = makeDb([[line], [order]]);
    state.db = db;
    await expect(caller().shop.receivePurchaseLine({ purchaseOrderLineId: 3, receivedQuantity: 20, lotNumber: "LOT-500", expiryDate: new Date("2028-12-31") } as any)).rejects.toThrow();
    expect(inserts.productInventoryLots).toBeUndefined();
  });

  it("TRAP RUN: a receipt without an expiry date FAILS", async () => {
    const { db, inserts } = makeDb([[line], [order]]);
    state.db = db;
    await expect(caller().shop.receivePurchaseLine({ purchaseOrderLineId: 3, receivedQuantity: 20, lotNumber: "LOT-500", unitCostBought: 150 } as any)).rejects.toThrow();
    expect(inserts.productInventoryLots).toBeUndefined();
  });

  it("TRAP RUN: no supplier anywhere (blank order name, none supplied) FAILS the provenance gate", async () => {
    const { db, inserts } = makeDb([[line], [{ ...order, supplierName: "" }]]);
    state.db = db;
    await expect(caller().shop.receivePurchaseLine({ purchaseOrderLineId: 3, receivedQuantity: 20, lotNumber: "LOT-500", expiryDate: new Date("2028-12-31"), unitCostBought: 150 })).rejects.toThrow(/Cost provenance failure/);
    expect(inserts.productInventoryLots).toBeUndefined();
  });

  it("an already-expired delivery may be received (goods arrived) but is flagged and stays sale-blocked", async () => {
    const { db, inserts } = makeDb([[line], [order], [{ ...line, receivedQuantity: "20.00" }]]);
    state.db = db;
    const result = await caller().shop.receivePurchaseLine({ purchaseOrderLineId: 3, receivedQuantity: 20, lotNumber: "LOT-OLD", expiryDate: new Date("2024-01-01"), unitCostBought: 90 });
    expect(result.expiryState).toBe("expired");
    expect(inserts.auditEvents[0].summary).toMatch(/ALREADY EXPIRED — blocked from sale/);
  });
});

describe("shop seller catalog view", () => {
  it("derives lot batch states and honest sellability without inventing a price", async () => {
    const expiredLot = { ...freshLot, id: 20, lotNumber: "LOT-OLD", expiryDate: new Date("2025-01-01") };
    const lowLot = { ...freshLot, id: 21, lotNumber: "LOT-LOW", quantity: "6.00", soldQuantity: "3.00" };
    const { db } = makeDb([[{ product, source: approvedSource }], [], [freshLot, expiredLot, lowLot]]);
    state.db = db;
    const catalog = await caller().shop.sellerCatalog();
    expect(catalog).toHaveLength(1);
    const entry = catalog[0];
    expect(entry.sellable).toBe(true);
    expect(entry.product.sellPriceNote).toBeNull(); // client renders the operator placeholder
    const byLot = Object.fromEntries(entry.lots.map(lot => [lot.lotNumber, lot]));
    expect(byLot["LOT-500"]).toMatchObject({ expiryState: "ok", stockState: "in_stock", onHand: 20, saleBlocked: false });
    expect(byLot["LOT-OLD"]).toMatchObject({ expiryState: "expired", saleBlocked: true });
    expect(byLot["LOT-LOW"]).toMatchObject({ stockState: "low_stock", onHand: 3, saleBlocked: false });
  });

  it("marks every lot of an evidence-ineligible product as sale-blocked", async () => {
    const unverifiedSource = { ...approvedSource, registryIdentifier: null, registryVerifiedAt: null };
    const unverifiedProduct = { ...product, registryIdentifier: null, registryStatus: "unverified" };
    const { db } = makeDb([[{ product: unverifiedProduct, source: unverifiedSource }], [], [freshLot]]);
    state.db = db;
    const catalog = await caller().shop.sellerCatalog();
    expect(catalog[0].sellable).toBe(false);
    expect(catalog[0].evidenceGate.code).toBe("eu_registry_missing");
    expect(catalog[0].lots[0].saleBlocked).toBe(true);
  });
});
