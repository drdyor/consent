import { describe, expect, it } from "vitest";
import { applyInventoryLotSelection } from "../../shared/inventoryLot";

describe("applyInventoryLotSelection", () => {
  it("carries a selected clinic inventory lot and its expiry into consent traceability fields", () => {
    expect(applyInventoryLotSelection({ lotNumber: "LOT-124", expiryDate: new Date("2027-12-31T00:00:00.000Z") })).toEqual({ lotNumber: "LOT-124", expiryDate: "2027-12-31" });
  });
});
