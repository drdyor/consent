import { describe, expect, it } from "vitest";
import { getMarketEvidenceGate, sourceMatchesMarket } from "./marketCompliance";

const verifiedSource = (jurisdiction: string, authority: string) => ({ jurisdiction, registryAuthority: authority, registryIdentifier: "REG-100", registryVerifiedAt: new Date("2026-08-21T00:00:00Z") });
const baseDevice = { productClassification: "medical_device" as const, ukMarketRoute: "unresolved" as const, fdaMarketingAuthorizationType: "unresolved" as const };

describe("market compliance evidence gates", () => {
  it("keeps regulated source jurisdictions separated by clinic market", () => {
    expect(sourceMatchesMarket("PL", "pl_eu")).toBe(true);
    expect(sourceMatchesMarket("EU", "pl_eu")).toBe(true);
    expect(sourceMatchesMarket("UK", "pl_eu")).toBe(false);
    expect(sourceMatchesMarket("GB", "uk_gb")).toBe(true);
    expect(sourceMatchesMarket("US", "usa")).toBe(true);
  });

  it("requires an MHRA-attested source and UK market route for a Great Britain device", () => {
    const incomplete = getMarketEvidenceGate({ complianceMarket: "uk_gb" }, verifiedSource("UK", "MHRA"), baseDevice);
    expect(incomplete).toMatchObject({ eligible: false, code: "uk_device_evidence_missing" });
    const complete = getMarketEvidenceGate({ complianceMarket: "uk_gb" }, verifiedSource("UK", "MHRA"), { ...baseDevice, ukMarketRoute: "ukca", ukMhRARegistrationIdentifier: "MHRA-100", ukMhRARegistrationUrl: "https://example.test/mhra", ukConformityCertificateUrl: "https://example.test/ukca", ukEvidenceVerifiedAt: new Date() });
    expect(complete).toMatchObject({ eligible: true, code: "ready" });
  });

  it("requires both state-practice and FDA evidence for USA patient-ready device use", () => {
    const fdaSource = verifiedSource("US", "FDA");
    const withoutState = getMarketEvidenceGate({ complianceMarket: "usa" }, fdaSource, baseDevice);
    expect(withoutState).toMatchObject({ eligible: false, code: "us_state_evidence_missing" });
    const withoutFdaDeviceEvidence = getMarketEvidenceGate({ complianceMarket: "usa", usStateCode: "CA", usStateAuthority: "Medical Board", usStateEvidenceUrl: "https://example.test/state", usStateEvidenceVerifiedAt: new Date() }, fdaSource, baseDevice);
    expect(withoutFdaDeviceEvidence).toMatchObject({ eligible: false, code: "fda_device_evidence_missing" });
    const complete = getMarketEvidenceGate({ complianceMarket: "usa", usStateCode: "CA", usStateAuthority: "Medical Board", usStateEvidenceUrl: "https://example.test/state", usStateEvidenceVerifiedAt: new Date() }, fdaSource, { ...baseDevice, fdaMarketingAuthorizationType: "510k", fdaMarketingAuthorizationNumber: "K123456", fdaRegistrationListingUrl: "https://example.test/fda", fdaEvidenceVerifiedAt: new Date() });
    expect(complete).toMatchObject({ eligible: true, code: "ready" });
  });
});
