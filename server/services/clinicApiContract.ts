import { createHash } from "node:crypto";
import { z } from "zod";

const opaqueRef = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/, "must be a controlled opaque reference");

export const clinicConsentPackageInput = z.object({
  contractVersion: z.literal("v1"),
  originApp: z.enum(["dental", "aesthetics", "md"]),
  originTenantRef: opaqueRef,
  correlationId: opaqueRef,
  idempotencyKey: opaqueRef,
  originCaseRef: opaqueRef,
  subjectRef: opaqueRef,
  procedureKey: opaqueRef,
  jurisdiction: z.string().regex(/^[A-Za-z]{2,8}$/, "must be a controlled market code"),
  language: z.enum(["en", "pl"]),
  catalogueItemRef: opaqueRef,
  lotRef: opaqueRef,
  treatmentSiteRefs: z.array(opaqueRef).min(1).max(64),
  disclosureChoiceIds: z.array(opaqueRef).max(128),
});

export type ClinicConsentPackageInput = z.infer<typeof clinicConsentPackageInput>;

export type GovernedProductForPackage = {
  productId: number;
  lotId: number;
  catalogueItemRef: string;
  lotRef: string;
  productRevision: string;
  evidenceApproved: boolean;
  lotUsable: boolean;
};

export type TemplateForPackage = {
  id: number;
  revision: number;
  procedureKey: string;
  jurisdiction: string;
  language: "en" | "pl";
};

export type DraftConsentPackage = {
  status: "draft";
  packageVersion: "v1";
  templateRevision: number;
  renderedDocumentHash: string;
  expiresAt: string;
};

export function createDraftConsentPackage(
  rawInput: unknown,
  product: GovernedProductForPackage,
  template: TemplateForPackage,
): { input: ClinicConsentPackageInput; package: DraftConsentPackage } {
  const input = clinicConsentPackageInput.parse(rawInput);
  if (!product.evidenceApproved) throw new Error("Selected product evidence is not approved for consent generation");
  if (!product.lotUsable) throw new Error("Selected product lot is unavailable or expired");
  if (input.catalogueItemRef !== product.catalogueItemRef || input.lotRef !== product.lotRef) throw new Error("Selected product or lot reference does not match governed Aegis state");
  if (input.procedureKey !== template.procedureKey || input.jurisdiction !== template.jurisdiction || input.language !== template.language) throw new Error("The selected Aegis template is not governed for the requested procedure, market, or language");

  const canonical = JSON.stringify({
    contractVersion: input.contractVersion,
    originApp: input.originApp,
    originTenantRef: input.originTenantRef,
    correlationId: input.correlationId,
    originCaseRef: input.originCaseRef,
    subjectRef: input.subjectRef,
    procedureKey: input.procedureKey,
    jurisdiction: input.jurisdiction,
    language: input.language,
    catalogueItemRef: input.catalogueItemRef,
    lotRef: input.lotRef,
    treatmentSiteRefs: [...input.treatmentSiteRefs].sort(),
    disclosureChoiceIds: [...input.disclosureChoiceIds].sort(),
    productRevision: product.productRevision,
    templateId: template.id,
    templateRevision: template.revision,
  });
  return {
    input,
    package: {
      status: "draft",
      packageVersion: "v1",
      templateRevision: template.revision,
      renderedDocumentHash: createHash("sha256").update(canonical).digest("hex"),
      expiresAt: "2099-12-31T23:59:59.000Z",
    },
  };
}
