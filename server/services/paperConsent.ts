import { createHash } from "node:crypto";

export const PAPER_WITNESS_ATTESTATION = "I witnessed the named patient sign the printed paper package identified by the recorded hash.";

export function buildPaperConsentPackage(input: {
  packageReference: string;
  preparedAt: Date;
  record: Record<string, unknown>;
  template: { name: string; revision: number; sections: unknown };
  product: unknown;
  source: unknown;
  inventoryLot?: unknown;
  materials: unknown[];
  educationResources: unknown[];
  practitioner: unknown;
  clinic: unknown;
  disclosures: unknown[];
  treatmentMap: unknown[];
}) {
  const packageSnapshot = {
    format: "aegis-paper-consent-v1",
    packageReference: input.packageReference,
    preparedAt: input.preparedAt,
    record: input.record,
    template: input.template,
    product: input.product,
    source: input.source,
    inventoryLot: input.inventoryLot || null,
    materials: input.materials,
    educationResources: input.educationResources,
    practitioner: input.practitioner,
    clinic: input.clinic,
    disclosures: input.disclosures,
    treatmentMap: input.treatmentMap,
    paperSigning: {
      instruction: "Print this exact package, collect the physical signatures outside Aegis, then have an authorised clinic user append the witnessed-signature event. The witness record does not replace local legal or clinical retention requirements.",
      witnessAttestation: PAPER_WITNESS_ATTESTATION,
    },
  };
  return { packageSnapshot, packageHash: createHash("sha256").update(JSON.stringify(packageSnapshot)).digest("hex") };
}
