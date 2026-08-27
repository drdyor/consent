import { describe, expect, it } from "vitest";
import { PAPER_WITNESS_ATTESTATION, buildPaperConsentPackage } from "./paperConsent";

const baseInput = {
  packageReference: "aegis-paper:0123456789abcdef0123456789abcdef",
  preparedAt: new Date("2026-08-27T12:00:00.000Z"),
  record: { id: 7, procedureName: "Example procedure", patientFirstName: "Ada", patientLastName: "Example" },
  template: { name: "Example consent", revision: 3, sections: [{ heading: "Scope" }] },
  product: { name: "Example product" }, source: { documentTitle: "Example IFU" }, inventoryLot: { lotNumber: "LOT-1" },
  materials: [{ selection: { lotNumber: "LOT-1" }, product: { name: "Example product" } }], educationResources: [], practitioner: { displayName: "Dr Example" }, clinic: { name: "Example Clinic" }, disclosures: [{ title: "Warning", body: "Example warning" }], treatmentMap: [],
};

describe("paper consent package", () => {
  it("creates a repeatable hash for the same sealed package inputs", () => {
    const first = buildPaperConsentPackage(baseInput); const second = buildPaperConsentPackage(baseInput);
    expect(first.packageHash).toMatch(/^[a-f0-9]{64}$/); expect(second.packageHash).toBe(first.packageHash); expect(first.packageSnapshot.paperSigning.witnessAttestation).toBe(PAPER_WITNESS_ATTESTATION);
  });

  it("changes the hash when a patient-facing disclosure changes", () => {
    const original = buildPaperConsentPackage(baseInput); const modified = buildPaperConsentPackage({ ...baseInput, disclosures: [{ title: "Warning", body: "Revised warning" }] });
    expect(modified.packageHash).not.toBe(original.packageHash);
  });
});
