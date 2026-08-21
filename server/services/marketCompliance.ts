export type ComplianceMarket = "pl_eu" | "uk_gb" | "usa";

type ClinicMarketProfile = {
  complianceMarket: ComplianceMarket;
  usStateCode?: string | null;
  usStateAuthority?: string | null;
  usStateEvidenceUrl?: string | null;
  usStateEvidenceVerifiedAt?: Date | null;
};

type SourceEvidence = {
  jurisdiction: string;
  registryAuthority?: string | null;
  registryIdentifier?: string | null;
  registryVerifiedAt?: Date | null;
};

type CatalogueEvidence = {
  productClassification: "medicinal_product" | "medical_device" | "unresolved";
  ukMarketRoute: "ukca" | "ce_transitional" | "not_applicable" | "unresolved";
  ukMhRARegistrationIdentifier?: string | null;
  ukMhRARegistrationUrl?: string | null;
  ukConformityCertificateUrl?: string | null;
  ukEvidenceVerifiedAt?: Date | null;
  fdaMarketingAuthorizationType: "510k" | "de_novo" | "pma" | "hde" | "exempt" | "not_applicable" | "unresolved";
  fdaMarketingAuthorizationNumber?: string | null;
  fdaRegistrationListingUrl?: string | null;
  fdaEvidenceVerifiedAt?: Date | null;
};

function normalized(value?: string | null) { return (value || "").trim().toUpperCase(); }
function hasHttps(value?: string | null) { return Boolean(value?.startsWith("https://")); }

export function marketJurisdictionLabel(market: ComplianceMarket) { return market === "pl_eu" ? "Poland/EU" : market === "uk_gb" ? "Great Britain" : "USA"; }

export function sourceMatchesMarket(sourceJurisdiction: string, market: ComplianceMarket) {
  const jurisdiction = normalized(sourceJurisdiction);
  if (market === "pl_eu") return jurisdiction === "PL" || jurisdiction === "EU";
  if (market === "uk_gb") return jurisdiction === "UK" || jurisdiction === "GB";
  return jurisdiction === "US" || jurisdiction === "USA";
}

export function getMarketEvidenceGate(profile: ClinicMarketProfile, source: SourceEvidence, catalogue?: CatalogueEvidence | null) {
  const market = (profile.complianceMarket || "pl_eu") as ComplianceMarket;
  if (!sourceMatchesMarket(source.jurisdiction, market)) return { eligible: false, code: "source_market_mismatch", message: `This source is not governed for the clinic's ${marketJurisdictionLabel(market)} market profile.` } as const;
  if (market === "pl_eu") {
    if (!source.registryVerifiedAt || !source.registryIdentifier) return { eligible: false, code: "eu_registry_missing", message: "Poland/EU patient-ready use requires verified registry evidence for the selected source." } as const;
    return { eligible: true, code: "ready", message: "Poland/EU registry evidence is present." } as const;
  }
  if (market === "uk_gb") {
    const mhraSource = normalized(source.registryAuthority).includes("MHRA") && Boolean(source.registryIdentifier && source.registryVerifiedAt);
    if (!mhraSource) return { eligible: false, code: "mhra_source_missing", message: "Great Britain patient-ready use requires administrator-verified MHRA registration evidence on the source." } as const;
    if (catalogue?.productClassification === "medical_device") {
      const routeReady = catalogue.ukMarketRoute !== "unresolved" && catalogue.ukMarketRoute !== "not_applicable";
      const deviceReady = routeReady && Boolean(catalogue.ukMhRARegistrationIdentifier && hasHttps(catalogue.ukMhRARegistrationUrl) && hasHttps(catalogue.ukConformityCertificateUrl) && catalogue.ukEvidenceVerifiedAt);
      if (!deviceReady) return { eligible: false, code: "uk_device_evidence_missing", message: "Great Britain device use requires verified MHRA registration and UKCA or valid CE transitional-route evidence." } as const;
    }
    return { eligible: true, code: "ready", message: "Great Britain MHRA and market-route evidence is present." } as const;
  }
  const stateReady = Boolean(profile.usStateCode && profile.usStateAuthority && hasHttps(profile.usStateEvidenceUrl) && profile.usStateEvidenceVerifiedAt);
  if (!stateReady) return { eligible: false, code: "us_state_evidence_missing", message: "USA patient-ready use requires a selected state and administrator-verified official state-practice evidence." } as const;
  const fdaSource = normalized(source.registryAuthority).includes("FDA") && Boolean(source.registryIdentifier && source.registryVerifiedAt);
  if (!fdaSource) return { eligible: false, code: "fda_source_missing", message: "USA patient-ready use requires administrator-verified FDA evidence on the source." } as const;
  if (catalogue?.productClassification === "medical_device") {
    const authorizationReady = catalogue.fdaMarketingAuthorizationType !== "unresolved" && catalogue.fdaMarketingAuthorizationType !== "not_applicable" && hasHttps(catalogue.fdaRegistrationListingUrl) && catalogue.fdaEvidenceVerifiedAt && (catalogue.fdaMarketingAuthorizationType === "exempt" || Boolean(catalogue.fdaMarketingAuthorizationNumber));
    if (!authorizationReady) return { eligible: false, code: "fda_device_evidence_missing", message: "USA device use requires verified FDA marketing-authorization or documented exemption evidence plus registration/listing evidence." } as const;
  }
  return { eligible: true, code: "ready", message: "USA FDA and state-practice evidence is present." } as const;
}
