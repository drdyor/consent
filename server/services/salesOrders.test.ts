import { describe, expect, it } from "vitest";
import { assertLineShippable, assertOrderTransition, buildSalesInvoiceSnapshot, PRICE_NOT_RECORDED_STATEMENT, SALES_ORDER_TRANSITIONS } from "./salesOrders";

const order = { id: 5, orderNumber: "SO-1", buyerName: "SYNTH Clinic Sliema", buyerClinicId: null, shippingAddress: "1 Synthetic Street, Sliema", orderedAt: new Date("2026-08-01T10:00:00Z"), shippedAt: new Date("2026-08-02T10:00:00Z"), deliveredAt: null };
const sellerClinic = { id: 4, name: "Example Clinic", jurisdiction: "PL" };
const pricedLine = { lineId: 1, productName: "SYNTH Filler", manufacturer: "SYNTH Labs", lotNumber: "LOT-500", expiryDate: new Date("2028-12-31"), quantity: 5, quantityUnit: "units", unitSellPrice: 200, sellCurrency: "PLN" };
const issuedAt = new Date("2026-08-03T09:00:00Z");

describe("sales order lifecycle transitions", () => {
  it("allows order → confirm → ship → deliver and nothing after deliver", () => {
    expect(() => assertOrderTransition("ordered", "confirmed")).not.toThrow();
    expect(() => assertOrderTransition("confirmed", "shipped")).not.toThrow();
    expect(() => assertOrderTransition("shipped", "delivered")).not.toThrow();
    expect(SALES_ORDER_TRANSITIONS.delivered).toEqual([]);
  });
  it("TRAP: refuses skipping confirm, shipping twice, and delivering an unshipped order", () => {
    expect(() => assertOrderTransition("ordered", "shipped")).toThrow(/cannot move/);
    expect(() => assertOrderTransition("shipped", "shipped")).toThrow(/cannot move/);
    expect(() => assertOrderTransition("confirmed", "delivered")).toThrow(/cannot move/);
  });
});

describe("gate: order_lot_traceability", () => {
  it("TRAP: a line with no allocated lot cannot ship", () => {
    expect(() => assertLineShippable({ id: 9, inventoryLotId: null, quantity: "5" })).toThrow(/no allocated stock lot/);
  });
  it("an allocated line with positive quantity ships", () => {
    expect(() => assertLineShippable({ id: 9, inventoryLotId: 19, quantity: "5" })).not.toThrow();
  });
  it("TRAP: an invoice line with no lot number or no expiry FAILS", () => {
    expect(() => buildSalesInvoiceSnapshot({ invoiceNumber: "INV-1", order, sellerClinic, lines: [{ ...pricedLine, lotNumber: "" }], issuedAt })).toThrow(/no lot number/);
    expect(() => buildSalesInvoiceSnapshot({ invoiceNumber: "INV-1", order, sellerClinic, lines: [{ ...pricedLine, expiryDate: "not-a-date" }], issuedAt })).toThrow(/no valid expiry/);
  });
  it("every sealed invoice line carries its specific lot + expiry", () => {
    const { snapshot } = buildSalesInvoiceSnapshot({ invoiceNumber: "INV-1", order, sellerClinic, lines: [pricedLine], issuedAt });
    expect(snapshot.lines[0].lot).toEqual({ lotNumber: "LOT-500", expiryDate: new Date("2028-12-31").toISOString() });
  });
});

describe("immutable invoice snapshot (signed-consent hash pattern)", () => {
  it("is deterministic: identical input yields the identical sha256", () => {
    const a = buildSalesInvoiceSnapshot({ invoiceNumber: "INV-1", order, sellerClinic, lines: [pricedLine], issuedAt });
    const b = buildSalesInvoiceSnapshot({ invoiceNumber: "INV-1", order, sellerClinic, lines: [pricedLine], issuedAt });
    expect(a.snapshotHash).toBe(b.snapshotHash);
    expect(a.snapshotHash).toMatch(/^[0-9a-f]{64}$/);
  });
  it("TRAP: any tampering with a sealed line changes the hash", () => {
    const a = buildSalesInvoiceSnapshot({ invoiceNumber: "INV-1", order, sellerClinic, lines: [pricedLine], issuedAt });
    const b = buildSalesInvoiceSnapshot({ invoiceNumber: "INV-1", order, sellerClinic, lines: [{ ...pricedLine, quantity: 6 }], issuedAt });
    expect(a.snapshotHash).not.toBe(b.snapshotHash);
  });
  it("computes a total only when every line carries an operator price in one currency", () => {
    const priced = buildSalesInvoiceSnapshot({ invoiceNumber: "INV-1", order, sellerClinic, lines: [pricedLine, { ...pricedLine, lineId: 2, quantity: 2 }], issuedAt });
    expect(priced.snapshot.total).toEqual({ amount: 1400, currency: "PLN" });
  });
  it("never invents a price: an unpriced line carries the explicit statement, and no total is computed", () => {
    const { snapshot } = buildSalesInvoiceSnapshot({ invoiceNumber: "INV-1", order, sellerClinic, lines: [pricedLine, { ...pricedLine, lineId: 2, unitSellPrice: null, sellCurrency: null }], issuedAt });
    expect(snapshot.lines[1].price).toEqual({ statement: PRICE_NOT_RECORDED_STATEMENT });
    expect(snapshot.total).toHaveProperty("statement");
  });
});

describe("gate: no_charge", () => {
  it("the sealed invoice states issued_not_collected and that nothing charges", () => {
    const { snapshot } = buildSalesInvoiceSnapshot({ invoiceNumber: "INV-1", order, sellerClinic, lines: [pricedLine], issuedAt });
    expect(snapshot.charge.status).toBe("issued_not_collected");
    expect(snapshot.charge.statement).toMatch(/Nothing was charged/);
  });
});
