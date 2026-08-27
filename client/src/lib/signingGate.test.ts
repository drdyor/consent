import { describe, expect, it } from "vitest";
import { canSignConsent } from "./signingGate";

describe("canSignConsent — blank-signature gate (QA fix: toDataURL truthy-blank bug)", () => {
  const base = { allAcknowledged: true, signerName: "Zofia Testowa" };

  it("REFUSES a drawn signature while the pad is empty, even with name and acknowledgements complete", () => {
    expect(canSignConsent({ ...base, method: "drawn", signatureEmpty: true })).toBe(false);
  });

  it("allows a drawn signature once at least one stroke exists", () => {
    expect(canSignConsent({ ...base, method: "drawn", signatureEmpty: false })).toBe(true);
  });

  it("allows a typed signature regardless of the pad state", () => {
    expect(canSignConsent({ ...base, method: "typed", signatureEmpty: true })).toBe(true);
  });

  it("still refuses when required disclosures are not acknowledged", () => {
    expect(canSignConsent({ ...base, allAcknowledged: false, method: "drawn", signatureEmpty: false })).toBe(false);
  });

  it("still refuses when the signer name is too short", () => {
    expect(canSignConsent({ ...base, signerName: " Z ", method: "typed", signatureEmpty: true })).toBe(false);
  });
});
