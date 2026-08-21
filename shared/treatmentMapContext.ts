export type TreatmentMapConsentContext = {
  product: { id: number; name: string };
  lotNumber: string;
  expiryDate: Date;
  practitioner: { id: number | null; displayName: string | null; registrationNumber: string | null };
};

export function buildTreatmentMapConsentContext(record: { lotNumber: string; expiryDate: Date }, product: { id: number; name: string }, practitioner?: { id?: number | null; displayName?: string | null; registrationNumber?: string | null } | null): TreatmentMapConsentContext {
  return { product: { id: product.id, name: product.name }, lotNumber: record.lotNumber, expiryDate: record.expiryDate, practitioner: { id: practitioner?.id ?? null, displayName: practitioner?.displayName ?? null, registrationNumber: practitioner?.registrationNumber ?? null } };
}
