import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";
import { describe, expect, it, vi } from "vitest";

/**
 * WINDOW S2A gate + trap coverage over the shopOrders router, using the repo's mocked-db
 * integration pattern (see shop.integration.test.ts). The REAL market evidence gate and
 * the REAL invoice snapshot builder are exercised — called, never mocked.
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

const ctx = { user: { id: 2, openId: "shop-orders-test-user", name: "Dr Example", email: "doctor@example.com", loginMethod: "manus", role: "user" as const, createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date() }, req: {} as any, res: {} as any };
const caller = () => appRouter.createCaller(ctx as any);
const tableName = (table: any) => table?.[Symbol.for("drizzle:Name")];

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
const product = { id: 7, sourceId: 8, name: "SYNTH Filler", manufacturer: "SYNTH Labs", category: "ha_filler", registryIdentifier: "PL-REG-1", registryStatus: "verified", isActive: true, sellerListingStatus: "listed", sellPriceNote: null };
const listedLot = { id: 19, clinicId: 4, productId: 7, lotNumber: "LOT-500", expiryDate: new Date("2028-12-31"), quantity: "20.00", quantityUnit: "units", soldQuantity: "0.00", supplierName: "MedSupply SYNTH", unitCostBought: "150.00", costCurrency: "PLN", purchaseOrderLineId: 3, listedForSaleAt: new Date("2026-08-01"), delistedAt: null, delistReason: null };
const confirmedOrder = { id: 5, clinicId: 4, orderNumber: "SO-2026-001", buyerClinicId: null, buyerName: "SYNTH Clinic Sliema", shippingAddress: "1 Synthetic Street, Sliema", status: "confirmed", orderedAt: new Date("2026-08-01"), confirmedAt: new Date("2026-08-01"), shippedAt: null, deliveredAt: null, createdByUserId: 2 };
const allocatedLine = { id: 31, salesOrderId: 5, productId: 7, inventoryLotId: 19, quantity: "5.00", quantityUnit: "units", unitSellPrice: "200.00", sellCurrency: "PLN", allocatedAt: new Date("2026-08-01"), shippedAt: null };

describe("shopOrders gate: order_lot_traceability", () => {
  it("ships a confirmed order whose line is allocated to a listed, sellable lot — and draws down that specific lot", async () => {
    const { db, inserts, updates } = makeDb([[confirmedOrder], [allocatedLine], [listedLot], [{ product, source: approvedSource }]]);
    state.db = db;
    const result = await caller().shopOrders.shipSalesOrder({ salesOrderId: 5 });
    expect(result.shippedLines).toEqual([{ lineId: 31, lotId: 19, lotNumber: "LOT-500" }]);
    expect(updates.productInventoryLots[0]).toEqual({ soldQuantity: "5" });
    expect(updates.salesOrders[0]).toMatchObject({ status: "shipped" });
    expect(inserts.auditEvents[0].action).toBe("shop.sales_order_shipped");
    expect(inserts.auditEvents[0].summary).toMatch(/lot LOT-500 \(expiry 2028-12-31\)/);
  });

  it("TRAP RUN: shipping a line with NO allocated lot is refused fail-closed and logged", async () => {
    const unallocatedLine = { ...allocatedLine, inventoryLotId: null, allocatedAt: null };
    const { db, inserts, updates } = makeDb([[confirmedOrder], [unallocatedLine]]);
    state.db = db;
    await expect(caller().shopOrders.shipSalesOrder({ salesOrderId: 5 })).rejects.toThrow(/no allocated stock lot/);
    expect(updates.productInventoryLots).toBeUndefined();
    expect(updates.salesOrders).toBeUndefined();
    expect(inserts.auditEvents[0]).toMatchObject({ action: "shop.ship_refused", entityId: "5" });
  });

  it("TRAP RUN: shipping refuses when the allocated lot EXPIRED after allocation (re-check at ship time)", async () => {
    const expiredLot = { ...listedLot, expiryDate: new Date("2026-06-01") };
    const { db, inserts, updates } = makeDb([[confirmedOrder], [allocatedLine], [expiredLot], [{ product, source: approvedSource }]]);
    state.db = db;
    await expect(caller().shopOrders.shipSalesOrder({ salesOrderId: 5 })).rejects.toThrow(/Expired lot blocked from sale/);
    expect(updates.productInventoryLots).toBeUndefined();
    expect(inserts.auditEvents[0]).toMatchObject({ action: "shop.ship_refused" });
  });

  it("TRAP RUN: two lines on one lot cannot together overdraw it — stock never goes negative", async () => {
    const bigLineA = { ...allocatedLine, id: 31, quantity: "15.00" };
    const bigLineB = { ...allocatedLine, id: 32, quantity: "10.00" };
    const { db, inserts, updates } = makeDb([[confirmedOrder], [bigLineA, bigLineB], [listedLot], [{ product, source: approvedSource }], [listedLot], [{ product, source: approvedSource }]]);
    state.db = db;
    await expect(caller().shopOrders.shipSalesOrder({ salesOrderId: 5 })).rejects.toThrow(/never goes negative/);
    expect(updates.productInventoryLots).toBeUndefined();
    expect(inserts.auditEvents[0]).toMatchObject({ action: "shop.ship_refused" });
  });

  it("refuses to allocate a lot that belongs to a different product than the line", async () => {
    const otherProductLot = { ...listedLot, productId: 99 };
    const { db } = makeDb([[allocatedLine], [confirmedOrder], [allocatedLine], [otherProductLot], [{ product: { ...product, id: 99 }, source: approvedSource }]]);
    state.db = db;
    await expect(caller().shopOrders.allocateOrderLine({ salesOrderLineId: 31, inventoryLotId: 19 })).rejects.toThrow(/different product/);
  });

  it("refuses to allocate an unlisted lot", async () => {
    const unlistedLot = { ...listedLot, listedForSaleAt: null };
    const { db } = makeDb([[allocatedLine], [confirmedOrder], [allocatedLine], [unlistedLot], [{ product, source: approvedSource }]]);
    state.db = db;
    await expect(caller().shopOrders.allocateOrderLine({ salesOrderLineId: 31, inventoryLotId: 19 })).rejects.toThrow(/listed on the seller catalog/);
  });
});

describe("shopOrders gate: no_charge (invoice issued, never collected)", () => {
  const shippedOrder = { ...confirmedOrder, status: "shipped", shippedAt: new Date("2026-08-02") };
  const shippedLine = { ...allocatedLine, shippedAt: new Date("2026-08-02") };

  it("issues an immutable hash-backed invoice for a shipped order, ending at issued_not_collected", async () => {
    const { db, inserts } = makeDb([[shippedOrder], [shippedLine], [], [listedLot], [product]]);
    state.db = db;
    const result = await caller().shopOrders.issueInvoice({ salesOrderId: 5, invoiceNumber: "INV-2026-001" });
    expect(result.status).toBe("issued_not_collected");
    expect(result.snapshotHash).toMatch(/^[0-9a-f]{64}$/);
    const stored = inserts.salesInvoices[0];
    expect(stored).toMatchObject({ clinicId: 4, salesOrderId: 5, invoiceNumber: "INV-2026-001", snapshotHash: result.snapshotHash });
    expect(stored.snapshot.lines[0].lot.lotNumber).toBe("LOT-500");
    expect(stored.snapshot.charge.status).toBe("issued_not_collected");
    expect(inserts.auditEvents[0].action).toBe("shop.invoice_issued");
  });

  it("TRAP RUN: a wired payment field on issueInvoice is rejected at the contract boundary (strict schema)", async () => {
    const { db, inserts } = makeDb([[shippedOrder], [shippedLine], [], [listedLot], [product]]);
    state.db = db;
    await expect(caller().shopOrders.issueInvoice({ salesOrderId: 5, invoiceNumber: "INV-2026-001", capturePayment: true, cardNumber: "4111111111111111" } as any)).rejects.toThrow();
    expect(inserts.salesInvoices).toBeUndefined();
  });

  it("TRAP RUN: a second invoice for the same order is refused — invoices are immutable, never reissued", async () => {
    const existing = { id: 60, clinicId: 4, salesOrderId: 5, invoiceNumber: "INV-2026-001", snapshotHash: "ab".repeat(32), status: "issued_not_collected" };
    const { db, inserts } = makeDb([[shippedOrder], [shippedLine], [existing]]);
    state.db = db;
    await expect(caller().shopOrders.issueInvoice({ salesOrderId: 5, invoiceNumber: "INV-2026-002" })).rejects.toThrow(/immutable and never reissued/);
    expect(inserts.salesInvoices).toBeUndefined();
  });

  it("refuses to invoice an order that has not shipped", async () => {
    const { db } = makeDb([[confirmedOrder], [allocatedLine]]);
    state.db = db;
    await expect(caller().shopOrders.issueInvoice({ salesOrderId: 5, invoiceNumber: "INV-2026-001" })).rejects.toThrow(/shipped or delivered/);
  });

  it("no payment/charge procedure exists on the shop routers, and the invoice status enum has exactly one value", async () => {
    const procedures = Object.keys((appRouter as any)._def.procedures).filter(key => key.startsWith("shop"));
    expect(procedures.length).toBeGreaterThan(0);
    for (const name of procedures) expect(name).not.toMatch(/pay|charge|collect|refund|card|checkout/i);
    const dir = path.dirname(fileURLToPath(import.meta.url));
    const sources = [path.join(dir, "shopOrders.ts"), path.join(dir, "shop.ts"), path.join(dir, "../services/salesOrders.ts"), path.join(dir, "../services/shopInventory.ts")].map(file => readFileSync(file, "utf8")).join("\n");
    expect(sources).not.toMatch(/stripe|paypal|payment_intent|cardNumber|checkout|chargeCard/i);
    const schema = readFileSync(path.join(dir, "../../drizzle/schema.ts"), "utf8");
    const enumMatch = schema.match(/mysqlEnum\("status", \[([^\]]*)\]\)\.default\("issued_not_collected"\)/);
    expect(enumMatch?.[1].trim()).toBe('"issued_not_collected"');
  });
});

describe("shopOrders lifecycle", () => {
  it("creates an order with an immediately allocated line after the full sellable gate", async () => {
    const { db, inserts } = makeDb([[listedLot], [{ product, source: approvedSource }]]);
    state.db = db;
    const result = await caller().shopOrders.createSalesOrder({ orderNumber: "SO-2026-001", buyerName: "SYNTH Clinic Sliema", shippingAddress: "1 Synthetic Street, Sliema", lines: [{ productId: 7, quantity: 5, quantityUnit: "units", inventoryLotId: 19 }] });
    expect(result.salesOrderId).toBeGreaterThan(0);
    expect(inserts.salesOrders[0]).toMatchObject({ clinicId: 4, orderNumber: "SO-2026-001", buyerName: "SYNTH Clinic Sliema" });
    expect(inserts.salesOrderLines[0][0]).toMatchObject({ productId: 7, inventoryLotId: 19, quantity: "5" });
    expect(inserts.auditEvents[0].action).toBe("shop.sales_order_created");
  });

  it("TRAP RUN: skipping confirm (ordered → shipped) is refused", async () => {
    const { db } = makeDb([[{ ...confirmedOrder, status: "ordered", confirmedAt: null }], [allocatedLine]]);
    state.db = db;
    await expect(caller().shopOrders.shipSalesOrder({ salesOrderId: 5 })).rejects.toThrow(/cannot move from ordered to shipped/);
  });

  it("delivers a shipped order", async () => {
    const { db, inserts, updates } = makeDb([[{ ...confirmedOrder, status: "shipped", shippedAt: new Date() }], [allocatedLine]]);
    state.db = db;
    await expect(caller().shopOrders.deliverSalesOrder({ salesOrderId: 5 })).resolves.toEqual({ success: true });
    expect(updates.salesOrders[0]).toMatchObject({ status: "delivered" });
    expect(inserts.auditEvents[0].action).toBe("shop.sales_order_delivered");
  });
});
