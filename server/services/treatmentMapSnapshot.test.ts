import { describe, expect, it } from "vitest";
import { bindTreatmentMapForSigning } from "./treatmentMapSnapshot";
import { buildTreatmentMapConsentContext } from "../../shared/treatmentMapContext";

describe("bindTreatmentMapForSigning", () => {
  it("binds a persisted map point to the signed consent’s product, lot, expiry, practitioner, quantity, and note", () => {
    const signed = bindTreatmentMapForSigning([{ id: 31, consentRecordId: 14, productId: 7, areaKey: "glabella", coordinateX: "0.50", coordinateY: "0.28", measureType: "units", amount: "12.00", clinicalNote: "Symmetric point documented" }], { product: { id: 7, name: "Product Example" }, lotNumber: "LOT-124", expiryDate: new Date("2027-12-31T00:00:00.000Z"), practitioner: { id: 2, displayName: "Dr Example", registrationNumber: "REG-22" } });
    expect(signed).toEqual([expect.objectContaining({ product: { id: 7, name: "Product Example" }, lotNumber: "LOT-124", expiryDate: new Date("2027-12-31T00:00:00.000Z"), practitioner: { id: 2, displayName: "Dr Example", registrationNumber: "REG-22" }, amount: "12.00", measureType: "units", clinicalNote: "Symmetric point documented" })]);
  });

  it("uses the same product, lot, expiry, and practitioner context shown in the clinician treatment-map workspace", () => {
    const workspaceContext = buildTreatmentMapConsentContext({ lotNumber: "LOT-124", expiryDate: new Date("2027-12-31T00:00:00.000Z") }, { id: 7, name: "Product Example" }, { id: 2, displayName: "Dr Example", registrationNumber: "REG-22" });
    const signed = bindTreatmentMapForSigning([{ id: 31, consentRecordId: 14, productId: 7, areaKey: "glabella", coordinateX: "0.50", coordinateY: "0.28", measureType: "units", amount: "12.00", clinicalNote: "Point note" }], workspaceContext);
    expect(signed[0]).toMatchObject(workspaceContext);
  });
});
