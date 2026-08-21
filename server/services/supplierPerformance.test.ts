import { describe, expect, it } from "vitest";
import { calculateSupplierPerformance, validateSupplierIncidentTransition } from "./supplierPerformance";

describe("supplier performance scoring", () => {
  it("averages the three controlled review dimensions and derives the expected risk status", () => {
    expect(calculateSupplierPerformance({ deliveryScore: 90, documentationScore: 86, reconciliationScore: 88 })).toEqual({ overallScore: 88, riskStatus: "acceptable" });
    expect(calculateSupplierPerformance({ deliveryScore: 70, documentationScore: 65, reconciliationScore: 60 })).toEqual({ overallScore: 65, riskStatus: "monitor" });
    expect(calculateSupplierPerformance({ deliveryScore: 60, documentationScore: 55, reconciliationScore: 50 })).toEqual({ overallScore: 55, riskStatus: "restricted" });
  });

  it("rejects scores outside the auditable 0–100 scale", () => {
    expect(() => calculateSupplierPerformance({ deliveryScore: 101, documentationScore: 80, reconciliationScore: 80 })).toThrow("between 0 and 100");
  });

  it("requires an explicit resolution note before an incident can be mitigated or closed", () => {
    expect(() => validateSupplierIncidentTransition("mitigated")).toThrow("resolution note");
    expect(() => validateSupplierIncidentTransition("closed", "")).toThrow("resolution note");
    expect(() => validateSupplierIncidentTransition("closed", "Document owner verified replacement certificate")).not.toThrow();
  });
});
