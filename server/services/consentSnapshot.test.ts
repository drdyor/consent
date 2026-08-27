import { describe, expect, it } from "vitest";
import { buildSignedSnapshot, hasAllRequiredAcknowledgements } from "./consentSnapshot";

describe("consent signing controls", () => {
  const disclosures = [{ id: 1, title: "Contraindication", requiredAcknowledgement: true }, { id: 2, title: "Optional detail", requiredAcknowledgement: false }, { id: 3, title: "Area warning", requiredAcknowledgement: true }];

  it("requires every required disclosure before a consent can be signed", () => {
    expect(hasAllRequiredAcknowledgements(disclosures, [1])).toBe(false);
    expect(hasAllRequiredAcknowledgements(disclosures, [1, 3])).toBe(true);
  });

  it("hashes the complete signing snapshot, including clinic, practitioner, source, and signature data", () => {
    const base = { record: { id: 14, procedureName: "Example procedure", lotNumber: "LOT-124", expiryDate: "2027-12-31" }, template: { name: "Clinic template", revision: 2, sections: [] }, product: { name: "Product" }, source: { documentTitle: "Canonical PI", documentVersion: "January 2026" }, practitioner: { displayName: "Dr Example" }, clinic: { name: "Example Clinic", logoUrl: "/manus-storage/logo.png" }, disclosures, signerName: "Patient Example", signingMethod: "typed" as const, signatureUrl: null, signedAt: new Date("2026-08-20T10:00:00.000Z"), materials: [{ selection: { selectionRole: "primary", lotNumber: "LOT-124", referenceCode: "REF-PRIMARY" }, product: { id: 7, name: "Primary material" }, source: { id: 8, documentVersion: "2026-01" } }, { selection: { selectionRole: "supplementary", lotNumber: "LOT-125", referenceCode: "REF-MEMBRANE" }, product: { id: 9, name: "Membrane" }, source: { id: 10, documentVersion: "2026-02" } }], treatmentMap: [{ areaKey: "glabella", productId: 7, amount: "12.00", measureType: "units", clinicalNote: "Documented treatment note", lotNumber: "LOT-124", expiryDate: "2027-12-31", practitioner: { displayName: "Dr Example" } }] };
    const first = buildSignedSnapshot(base);
    const altered = buildSignedSnapshot({ ...base, signerName: "Different Patient" });
    expect(first.snapshotHash).toHaveLength(64);
    expect(first.snapshotHash).not.toBe(altered.snapshotHash);
    expect((first.snapshot as { clinic: { logoUrl: string } }).clinic.logoUrl).toBe("/manus-storage/logo.png");
    expect((first.snapshot as { treatmentMap: Array<{ areaKey: string; productId: number; amount: string; measureType: string; clinicalNote: string; lotNumber: string; expiryDate: string; practitioner: { displayName: string } }> }).treatmentMap[0]).toMatchObject({ areaKey: "glabella", productId: 7, amount: "12.00", measureType: "units", clinicalNote: "Documented treatment note", lotNumber: "LOT-124", expiryDate: "2027-12-31", practitioner: { displayName: "Dr Example" } });
    expect(first.snapshot).toMatchObject({ materials: [{ selection: { selectionRole: "primary", lotNumber: "LOT-124", referenceCode: "REF-PRIMARY" }, product: { name: "Primary material" }, source: { documentVersion: "2026-01" } }, { selection: { selectionRole: "supplementary", lotNumber: "LOT-125", referenceCode: "REF-MEMBRANE" }, product: { name: "Membrane" }, source: { documentVersion: "2026-02" } }] });
    expect(first.snapshot).toMatchObject({ record: { lotNumber: "LOT-124", expiryDate: "2027-12-31" }, practitioner: { displayName: "Dr Example" } });
  });
});
