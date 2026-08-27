import { describe, expect, it } from "vitest";
import { buildPassportJson, ConsentPassportInput, ConsentPassportJson, renderConsentPassportPdf } from "./consentPassport";
import { PROCEDURE_ONLY_STATEMENT, procedureOnlySnapshotSection } from "../../shared/procedureOnlyConsent";
import { extractJsonAttachments, extractPdfText } from "./pdfInspect";
import { SealedSnapshot } from "./consentPdf";

const FIXTURE_HASH = "b7e2f1a94c63d05e8ab7e2f1a94c63d05e8ab7e2f1a94c63d05e8ab7e2f1a94c";

function snapshot(): SealedSnapshot {
  return {
    clinic: { name: "SYNTH Passport Clinic" },
    practitioner: { displayName: "Dr Passport Example", professionalTitle: "DDS", registrationNumber: "REG-9876" },
    product: { name: "FixtureImplant 4.1x10" },
    record: { id: 21, procedureName: "Dental implant placement", treatmentAreaKey: "tooth-36", patientFirstName: "Pawlu", patientLastName: "Fixture", lotNumber: "LOT-IMP-4110", expiryDate: "2029-06-30T00:00:00.000Z", language: "en", signedAt: "2026-08-10T09:00:00.000Z" },
    signer: { name: "Pawlu Fixture", method: "typed", signedAt: "2026-08-10T09:00:00.000Z" },
  };
}

function baseInput(overrides: Partial<ConsentPassportInput> = {}): ConsentPassportInput {
  return {
    snapshot: snapshot(),
    snapshotHash: FIXTURE_HASH,
    verifyUrl: `https://consent.example.test/verify/${FIXTURE_HASH}`,
    notary: { status: "notary_pending" },
    withdrawal: null,
    ...overrides,
  };
}

describe("renderConsentPassportPdf", () => {
  it("renders what/when/where/who, product+lot+expiry, hash, and verify link on one page", async () => {
    const bytes = await renderConsentPassportPdf(baseInput());
    const text = extractPdfText(bytes).replace(/\s+/g, " ");
    expect(text).toContain("Consent passport");
    expect(text).toContain("Dental implant placement");
    expect(text).toContain("SYNTH Passport Clinic");
    expect(text).toContain("Dr Passport Example");
    expect(text).toContain("REG-9876");
    expect(text).toContain("FixtureImplant 4.1x10");
    expect(text).toContain("LOT-IMP-4110");
    expect(text).toContain("30.06.2029");
    expect(text).toContain(FIXTURE_HASH.slice(0, 32));
    expect(text).toContain(FIXTURE_HASH.slice(32));
  });

  it("attaches machine-readable consent-passport.json inside the PDF", async () => {
    const bytes = await renderConsentPassportPdf(baseInput());
    expect(Buffer.from(bytes).toString("latin1")).toContain("consent-passport.json");
    const attachments = extractJsonAttachments(bytes) as ConsentPassportJson[];
    expect(attachments.length).toBeGreaterThan(0);
    const passport = attachments[0];
    expect(passport.type).toBe("aegis-consent-passport");
    expect(passport.snapshotHash).toBe(FIXTURE_HASH);
    expect(passport.status).toBe("signed");
    expect(passport.product).toMatchObject({ procedureOnly: false, name: "FixtureImplant 4.1x10", lotNumber: "LOT-IMP-4110" });
  });

  it("uses the procedure-only statement when no product applies", async () => {
    const noProduct = snapshot();
    noProduct.product = procedureOnlySnapshotSection();
    if (noProduct.record) {
      noProduct.record.lotNumber = null;
      noProduct.record.expiryDate = null;
    }
    const bytes = await renderConsentPassportPdf(baseInput({ snapshot: noProduct }));
    const text = extractPdfText(bytes).replace(/\s+/g, " ");
    expect(text).toContain("No product or medical device was used in this procedure.");
    expect(text).not.toContain("FixtureImplant");
    const passport = (extractJsonAttachments(bytes) as ConsentPassportJson[])[0];
    expect(passport.product).toMatchObject({ procedureOnly: true, statement: PROCEDURE_ONLY_STATEMENT });
  });

  it("shows the withdrawn state on the passport and in the JSON", async () => {
    const bytes = await renderConsentPassportPdf(baseInput({ withdrawal: { withdrawnAt: "2026-08-11T08:00:00.000Z", withdrawalEventHash: "evt-hash" } }));
    const text = extractPdfText(bytes).replace(/\s+/g, " ");
    expect(text).toContain("This consent has been withdrawn.");
    const passport = (extractJsonAttachments(bytes) as ConsentPassportJson[])[0];
    expect(passport.status).toBe("withdrawn");
    expect(passport.withdrawal.withdrawn).toBe(true);
  });

  it("is deterministic: same snapshot produces byte-identical passport", async () => {
    const first = await renderConsentPassportPdf(baseInput());
    const second = await renderConsentPassportPdf(baseInput());
    expect(Buffer.compare(Buffer.from(first), Buffer.from(second))).toBe(0);
  });
});

describe("buildPassportJson", () => {
  it("never includes free-text withdrawal reasons or snapshot internals", () => {
    const passport = buildPassportJson(baseInput({ withdrawal: { withdrawnAt: "2026-08-11T08:00:00.000Z", withdrawalEventHash: "evt" } }));
    const serialized = JSON.stringify(passport);
    expect(serialized).not.toContain("reason");
    expect(serialized).not.toContain("identityHash");
  });
});
