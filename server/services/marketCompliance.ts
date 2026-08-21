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
  ukConformityEvidenceType: "certificate" | "declaration_of_conformity" | "self_declaration" | "unresolved";
  ukCeTransitionalBasis: "eu_mdr_ivdr" | "mdd_aimdd" | "ivdd" | "unresolved";
  ukCeTransitionalExpiryAt?: Date | null;
  ukResponsiblePerson?: string | null;
  ukResponsiblePersonStatus: "appointed" | "not_required" | "unresolved";
  ukResponsiblePersonEvidenceUrl?: string | null;
  ukEvidenceVerifiedAt?: Date | null;
  fdaMarketingAuthorizationType: "510k" | "de_novo" | "pma" | "hde" | "exempt" | "not_applicable" | "unresolved";
  fdaMarketingAuthorizationNumber?: string | null;
  fdaMarketingAuthorizationUrl?: string | null;
  fdaExemptionRationale?: string | null;
  fdaExemptionEvidenceUrl?: string | null;
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
      const mhraReady = Boolean(catalogue.ukMhRARegistrationIdentifier && hasHttps(catalogue.ukMhRARegistrationUrl) && catalogue.ukEvidenceVerifiedAt);
      const conformityReady = catalogue.ukConformityEvidenceType !== "unresolved" && hasHttps(catalogue.ukConformityCertificateUrl);
      const responsiblePersonReady = catalogue.ukResponsiblePersonStatus === "not_required" || (catalogue.ukResponsiblePersonStatus === "appointed" && Boolean(catalogue.ukResponsiblePerson?.trim()) && hasHttps(catalogue.ukResponsiblePersonEvidenceUrl));
      if (!mhraReady || !conformityReady || !responsiblePersonReady) return { eligible: false, code: "uk_device_evidence_missing", message: "Great Britain device use requires verified MHRA registration, conformity evidence, and a documented UK Responsible Person status." } as const;
      if (catalogue.ukMarketRoute === "ukca" && catalogue.ukConformityEvidenceType === "unresolved") return { eligible: false, code: "ukca_evidence_missing", message: "UKCA route evidence must record the relevant conformity evidence type." } as const;
      if (catalogue.ukMarketRoute === "ce_transitional") {
        const transitionReady = catalogue.ukCeTransitionalBasis !== "unresolved" && Boolean(catalogue.ukCeTransitionalExpiryAt && catalogue.ukCeTransitionalExpiryAt.getTime() >= Date.now());
        if (!transitionReady) return { eligible: false, code: "uk_ce_transition_missing", message: "CE transitional-route evidence requires the EU legal basis and an unexpired administrator-reviewed transition date." } as const;
      }
      if (catalogue.ukMarketRoute === "unresolved" || catalogue.ukMarketRoute === "not_applicable") return { eligible: false, code: "uk_route_missing", message: "Great Britain device use requires a documented UKCA or CE transitional route." } as const;
    }
    return { eligible: true, code: "ready", message: "Great Britain MHRA and market-route evidence is present." } as const;
  }
  const stateReady = Boolean(profile.usStateCode && profile.usStateAuthority && hasHttps(profile.usStateEvidenceUrl) && profile.usStateEvidenceVerifiedAt);
  if (!stateReady) return { eligible: false, code: "us_state_evidence_missing", message: "USA patient-ready use requires a selected state and administrator-verified official state-practice evidence." } as const;
  const fdaSource = normalized(source.registryAuthority).includes("FDA") && Boolean(source.registryIdentifier && source.registryVerifiedAt);
  if (!fdaSource) return { eligible: false, code: "fda_source_missing", message: "USA patient-ready use requires administrator-verified FDA evidence on the source." } as const;
  if (!catalogue || catalogue.productClassification === "unresolved") return { eligible: false, code: "us_product_classification_missing", message: "USA patient-ready use requires an administrator-reviewed product classification before FDA evidence can be evaluated." } as const;
  if (catalogue.productClassification !== "medical_device") return { eligible: false, code: "us_non_device_review_required", message: "USA drug, biologic, or other product authorization is not inferred from a device record; retain a jurisdiction-specific regulatory review before patient-ready use." } as const;
  const listingReady = hasHttps(catalogue.fdaRegistrationListingUrl);
  const authorizationReady = catalogue.fdaMarketingAuthorizationType !== "unresolved" && catalogue.fdaMarketingAuthorizationType !== "not_applicable" && catalogue.fdaEvidenceVerifiedAt && (catalogue.fdaMarketingAuthorizationType === "exempt" ? Boolean(catalogue.fdaExemptionRationale?.trim()) && hasHttps(catalogue.fdaExemptionEvidenceUrl) : Boolean(catalogue.fdaMarketingAuthorizationNumber?.trim()) && hasHttps(catalogue.fdaMarketingAuthorizationUrl));
  if (!listingReady || !authorizationReady) return { eligible: false, code: "fda_device_evidence_missing", message: "USA device use requires separate administrator-verified FDA authorization or exemption evidence and registration/listing evidence; a listing alone is not authorization." } as const;
  return { eligible: true, code: "ready", message: "USA FDA and state-practice evidence is present." } as const;
}
