import { describe, expect, it } from "vitest";
import { renderSealedConsentPdf, winAnsiSafe, SealedConsentPdfInput, SealedSnapshot } from "./consentPdf";
import { PROCEDURE_ONLY_STATEMENT, procedureOnlySnapshotSection } from "../../shared/procedureOnlyConsent";
import { extractPdfText } from "./pdfInspect";

const FIXTURE_HASH = "a3f9c2d84e61b07f5a3f9c2d84e61b07f5a3f9c2d84e61b07f5a3f9c2d84e61b";

function productSnapshot(): SealedSnapshot {
  return {
    clinic: { name: "SYNTH Fixture Clinic", addressLine: "1 Fixture Street, Warsaw" },
    practitioner: { displayName: "Dr Fixture Example", professionalTitle: "MD", registrationNumber: "REG-1234", registrationAuthority: "Fixture Chamber" },
    template: { name: "Neuromodulator consent", revision: 3, sections: [{ id: "what", title: "What this involves", body: "A small injection in the treatment area." }, { id: "decision", title: "Your decision", body: "You choose whether to have this treatment." }] },
    product: { name: "FixtureTox 100U" },
    source: { documentTitle: "Canonical ChPL", documentVersion: "2026-01" },
    inventoryLot: { id: 19, lotNumber: "LOT-FIX-77", expiryDate: "2027-12-31T00:00:00.000Z" },
    record: { id: 11, procedureName: "Neuromodulator treatment", treatmentAreaKey: "glabella", patientFirstName: "Zofia", patientLastName: "Fixture", lotNumber: "LOT-FIX-77", expiryDate: "2027-12-31T00:00:00.000Z", language: "pl", signedAt: "2026-08-01T10:30:00.000Z" },
    patient: { id: 5, identityHash: "identity-hash-value" },
    signer: { name: "Zofia Fixture", method: "typed", signatureUrl: null, signedAt: "2026-08-01T10:30:00.000Z" },
    disclosures: [{ title: "Do not treat during infection", body: "Active skin infection is a contraindication.", kind: "contraindication", requiredAcknowledgement: true }],
    acknowledgements: [{ disclosureBlockId: 1, title: "Do not treat during infection", acknowledgedAt: "2026-08-01T10:30:00.000Z" }],
    treatmentMap: [{ areaKey: "glabella", amount: "12.00", measureType: "units", faceView: "front", clinicalNote: "Symmetric point", lotNumber: "LOT-FIX-77" }],
  };
}

function baseInput(overrides: Partial<SealedConsentPdfInput> = {}): SealedConsentPdfInput {
  return {
    snapshot: productSnapshot(),
    snapshotHash: FIXTURE_HASH,
    verifyUrl: `https://consent.example.test/verify/${FIXTURE_HASH}`,
    notary: { status: "notarized", topicId: "0.0.12345", sequenceNumber: "7", transactionId: "0.0.999@1700000000.000000001", consensusTimestamp: "1700000000.000000001" },
    withdrawal: null,
    ...overrides,
  };
}

describe("renderSealedConsentPdf", () => {
  it("renders the sealed snapshot with hash, product/lot, practitioner registration, notary ids, and QR link", async () => {
    const bytes = await renderSealedConsentPdf(baseInput());
    expect(Buffer.from(bytes.slice(0, 5)).toString("latin1")).toBe("%PDF-");
    const text = extractPdfText(bytes);
    expect(text).toContain("PODPISANA ZGODA PACJENTA");
    expect(text).toContain("SIGNED PATIENT CONSENT");
    expect(text).toContain("Zofia Fixture");
    expect(text).toContain("FixtureTox 100U");
    expect(text).toContain("LOT-FIX-77");
    expect(text).toContain("REG-1234");
    expect(text).toContain(FIXTURE_HASH);
    expect(text).toContain("0.0.12345");
    expect(text).toContain("https://consent.example.test/verify/");
    // template sections + disclosures + treatment map made it in
    expect(text).toContain("What this involves");
    expect(text).toContain("Active skin infection is a contraindication.");
    expect(text).toContain("glabella");
  });

  it("renders a procedure-only snapshot with the affirmative statement and no product name", async () => {
    const snapshot = productSnapshot();
    snapshot.product = procedureOnlySnapshotSection();
    snapshot.source = procedureOnlySnapshotSection();
    snapshot.inventoryLot = null;
    snapshot.treatmentMap = [];
    if (snapshot.record) {
      snapshot.record.lotNumber = null;
      snapshot.record.expiryDate = null;
      snapshot.record.procedureName = "Scaling and root planing";
    }
    const bytes = await renderSealedConsentPdf(baseInput({ snapshot, notary: { status: "notary_pending" } }));
    const text = extractPdfText(bytes);
    expect(text.replace(/\s+/g, " ")).toContain(PROCEDURE_ONLY_STATEMENT);
    expect(text).toContain("Scaling and root planing");
    expect(text).not.toContain("FixtureTox");
    expect(text).toContain(FIXTURE_HASH);
  });

  it("shows the withdrawal state on a voided record", async () => {
    const bytes = await renderSealedConsentPdf(baseInput({ withdrawal: { withdrawnAt: "2026-08-02T09:00:00.000Z", withdrawalEventHash: "withdrawal-event-hash-fixture" } }));
    const text = extractPdfText(bytes);
    expect(text).toContain("ZGODA WYCOFANA");
    expect(text).toContain("CONSENT WITHDRAWN");
    expect(text).toContain("withdrawal-event-hash-fixture");
  });

  it("is deterministic: same snapshot input produces byte-identical output", async () => {
    const first = await renderSealedConsentPdf(baseInput());
    const second = await renderSealedConsentPdf(baseInput());
    expect(Buffer.compare(Buffer.from(first), Buffer.from(second))).toBe(0);
  });

  it("changes output when the snapshot content changes", async () => {
    const first = await renderSealedConsentPdf(baseInput());
    const changed = productSnapshot();
    if (changed.record) changed.record.procedureName = "Different procedure";
    const second = await renderSealedConsentPdf(baseInput({ snapshot: changed }));
    expect(Buffer.compare(Buffer.from(first), Buffer.from(second))).not.toBe(0);
  });
});

describe("winAnsiSafe", () => {
  it("transliterates Polish diacritics instead of throwing", () => {
    expect(winAnsiSafe("Źródło ważności: odręczny podpis")).toBe("Zrodlo waznosci: odreczny podpis");
    expect(winAnsiSafe("ŁĄŻĘĆŃŚ")).toBe("LAZECNS");
  });
  it("replaces unmappable characters with ?", () => {
    expect(winAnsiSafe("mark → here")).toBe("mark ? here");
  });
});
