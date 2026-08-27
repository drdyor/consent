import { describe, expect, it } from "vitest";
import { getLotOperationalStatus, makeAegisLotReference, makeAegisProductReference, parseAegisLotReference, parseAegisProductReference, readinessState, requireControlledReference, stablePayloadHash } from "./clinicIntegration";

describe("Clinic integration contract helpers", () => {
  it("accepts only opaque controlled references and Aegis-owned product and lot references", () => {
    expect(requireControlledReference("case-dental_01:rev.2", "originCaseRef")).toBe("case-dental_01:rev.2");
    expect(() => requireControlledReference("diagnosis: implant is recommended", "originCaseRef")).toThrow("opaque controlled reference");
    expect(parseAegisProductReference(makeAegisProductReference(17))).toBe(17);
    expect(parseAegisLotReference(makeAegisLotReference(22))).toBe(22);
    expect(() => parseAegisProductReference("supplier-sku:NP-40115")).toThrow("Aegis product reference");
    expect(() => parseAegisLotReference("free-text-lot:ABC")).toThrow("Aegis lot reference");
  });

  it("hashes equivalent nested controlled requests deterministically and detects a changed manifest value", () => {
    const first = { originApp: "dental", items: [{ lotRef: "aegis-lot:2", product: { ref: "aegis-product:1", quantity: 2 } }] };
    const sameValuesDifferentOrder = { items: [{ product: { quantity: 2, ref: "aegis-product:1" }, lotRef: "aegis-lot:2" }], originApp: "dental" };
    expect(stablePayloadHash(first)).toBe(stablePayloadHash(sameValuesDifferentOrder));
    expect(stablePayloadHash(first)).not.toBe(stablePayloadHash({ ...first, items: [{ lotRef: "aegis-lot:2", product: { ref: "aegis-product:1", quantity: 3 } }] }));
  });

  it("reports only factual lot and supply-readiness states without clinical or supplier inference", () => {
    expect(getLotOperationalStatus({ expiryDate: new Date("2000-01-01T00:00:00Z"), quantity: "5" })).toBe("expired");
    expect(getLotOperationalStatus({ expiryDate: new Date("2099-01-01T00:00:00Z"), quantity: "0" })).toBe("depleted");
    expect(readinessState({ evidenceStatus: "blocked", lotStatus: "usable", availableQuantity: 10, requestedQuantity: 1, quantityUnitMatches: true })).toMatchObject({ status: "blocked", code: "evidence_not_approved" });
    expect(readinessState({ evidenceStatus: "approved", lotStatus: "usable", availableQuantity: 1, requestedQuantity: 2, quantityUnitMatches: true })).toMatchObject({ status: "attention_required", code: "insufficient_quantity" });
    expect(readinessState({ evidenceStatus: "approved", lotStatus: "usable", availableQuantity: 2, requestedQuantity: 2, quantityUnitMatches: true })).toMatchObject({ status: "ready", code: "ready" });
  });
});
