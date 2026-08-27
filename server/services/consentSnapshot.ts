import { createHash } from "node:crypto";

type Disclosure = { id: number; title: string; requiredAcknowledgement: boolean; [key: string]: unknown };

export function hasAllRequiredAcknowledgements(disclosures: Disclosure[], acknowledgedIds: number[]) {
  return disclosures.filter(disclosure => disclosure.requiredAcknowledgement).every(disclosure => acknowledgedIds.includes(disclosure.id));
}

export function buildSignedSnapshot(input: {
  record: Record<string, unknown>;
  template: { name: string; revision: number; sections: unknown };
  product: unknown;
  source: unknown;
  inventoryLot?: unknown;
  materials?: unknown[];
  educationResources?: unknown[];
  practitioner: unknown;
  clinic: unknown;
  disclosures: Disclosure[];
  signerName: string;
  signingMethod: "typed" | "drawn";
  signatureUrl: string | null;
  signedAt: Date;
  treatmentMap?: unknown[];
}) {
  const snapshot = {
    record: { ...input.record, signedAt: input.signedAt, signatureUrl: input.signatureUrl },
    template: input.template,
    product: input.product,
    source: input.source,
    inventoryLot: input.inventoryLot || null,
    materials: input.materials || [],
    educationResources: input.educationResources || [],
    practitioner: input.practitioner,
    clinic: input.clinic,
    disclosures: input.disclosures,
    signer: { name: input.signerName, method: input.signingMethod, signatureUrl: input.signatureUrl, signedAt: input.signedAt },
    acknowledgements: input.disclosures.filter(disclosure => disclosure.requiredAcknowledgement).map(disclosure => ({ disclosureBlockId: disclosure.id, title: disclosure.title, acknowledgedAt: input.signedAt })),
    treatmentMap: input.treatmentMap || [],
  };
  const snapshotHash = createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
  return { snapshot, snapshotHash };
}
