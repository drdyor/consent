import { describe, expect, it } from "vitest";
import { applyStockWithdrawal, assertCostProvenance, assertLotSellable, lotExpiryState, lotOnHand, lotStockState } from "./shopInventory";

const now = new Date("2026-08-28T12:00:00.000Z");
const approvedGate = { eligible: true, code: "ready", message: "evidence present" };

describe("shopInventory cost_provenance gate", () => {
  it("accepts a lot carrying supplier + unit cost + expiry", () => {
    expect(() => assertCostProvenance({ supplierName: "MedSupply SYNTH", unitCostBought: 120.5, expiryDate: new Date("2028-01-01") })).not.toThrow();
  });
  it("FAILS a lot missing the supplier", () => {
    expect(() => assertCostProvenance({ supplierName: "  ", unitCostBought: 120.5, expiryDate: new Date("2028-01-01") })).toThrow(/Cost provenance failure.*supplier/);
  });
  it("FAILS a lot missing the unit cost", () => {
    expect(() => assertCostProvenance({ supplierName: "MedSupply SYNTH", unitCostBought: null, expiryDate: new Date("2028-01-01") })).toThrow(/Cost provenance failure.*unit cost/);
  });
  it("FAILS a lot with a zero or negative unit cost", () => {
    expect(() => assertCostProvenance({ supplierName: "MedSupply SYNTH", unitCostBought: 0, expiryDate: new Date("2028-01-01") })).toThrow(/unit cost/);
  });
  it("FAILS a lot missing the expiry date", () => {
    expect(() => assertCostProvenance({ supplierName: "MedSupply SYNTH", unitCostBought: 99, expiryDate: null })).toThrow(/expiry date/);
  });
});

describe("shopInventory batch/expiry states", () => {
  it("classifies expired, near-expiry, ok, and missing expiry", () => {
    expect(lotExpiryState({ expiryDate: new Date("2026-08-01") }, now)).toBe("expired");
    expect(lotExpiryState({ expiryDate: new Date("2026-09-30") }, now)).toBe("near_expiry");
    expect(lotExpiryState({ expiryDate: new Date("2028-01-01") }, now)).toBe("ok");
    expect(lotExpiryState({ expiryDate: null }, now)).toBe("no_expiry_recorded");
  });
  it("treats the expiry instant itself as expired (fail-closed boundary)", () => {
    expect(lotExpiryState({ expiryDate: now }, now)).toBe("expired");
  });
  it("classifies stock levels", () => {
    expect(lotStockState(0)).toBe("out_of_stock");
    expect(lotStockState(3)).toBe("low_stock");
    expect(lotStockState(40)).toBe("in_stock");
  });
});

describe("shopInventory expiry_blocks_sale gate", () => {
  const freshLot = { quantity: "10.00", soldQuantity: "2.00", expiryDate: new Date("2028-06-01") };
  it("allows an in-date, approved, evidence-eligible lot", () => {
    expect(() => assertLotSellable({ lot: freshLot, sourceReviewStatus: "approved", evidenceGate: approvedGate, now })).not.toThrow();
  });
  it("TRAP: refuses an expired lot", () => {
    expect(() => assertLotSellable({ lot: { ...freshLot, expiryDate: new Date("2026-01-01") }, sourceReviewStatus: "approved", evidenceGate: approvedGate, now })).toThrow(/Expired lot blocked from sale/);
  });
  it("refuses a lot with no expiry recorded (fail-closed)", () => {
    expect(() => assertLotSellable({ lot: { ...freshLot, expiryDate: null }, sourceReviewStatus: "approved", evidenceGate: approvedGate, now })).toThrow(/fail-closed/);
  });
  it("TRAP: refuses a lot whose product source lacks approved market evidence", () => {
    expect(() => assertLotSellable({ lot: freshLot, sourceReviewStatus: "pending", evidenceGate: approvedGate, now })).toThrow(/not been approved/);
    expect(() => assertLotSellable({ lot: freshLot, sourceReviewStatus: "approved", evidenceGate: { eligible: false, code: "eu_registry_missing", message: "registry evidence missing" }, now })).toThrow(/market evidence gate refused \(eu_registry_missing\)/);
  });
  it("refuses a lot with nothing on hand", () => {
    expect(() => assertLotSellable({ lot: { ...freshLot, quantity: "5.00", soldQuantity: "5.00" }, sourceReviewStatus: "approved", evidenceGate: approvedGate, now })).toThrow(/no on-hand stock/);
  });
});

describe("shopInventory stock_integrity gate", () => {
  it("received − sold = on-hand", () => {
    expect(lotOnHand({ quantity: "24.00", soldQuantity: "9.50" })).toBe(14.5);
  });
  it("flags a stored negative balance instead of hiding it", () => {
    expect(() => lotOnHand({ quantity: "5.00", soldQuantity: "6.00" })).toThrow(/Stock integrity failure/);
  });
  it("applies a withdrawal and returns the new sold quantity", () => {
    expect(applyStockWithdrawal({ quantity: "24.00", soldQuantity: "9.50" }, 4.5)).toBe(14);
  });
  it("TRAP: refuses a withdrawal that would drive stock negative", () => {
    expect(() => applyStockWithdrawal({ quantity: "10.00", soldQuantity: "8.00" }, 3)).toThrow(/never goes negative/);
  });
  it("refuses zero or negative withdrawals", () => {
    expect(() => applyStockWithdrawal({ quantity: "10.00", soldQuantity: "0" }, 0)).toThrow(/positive/);
    expect(() => applyStockWithdrawal({ quantity: "10.00", soldQuantity: "0" }, -2)).toThrow(/positive/);
  });
  it("allows selling exactly the remaining balance", () => {
    expect(applyStockWithdrawal({ quantity: "10.00", soldQuantity: "8.00" }, 2)).toBe(10);
  });
});
