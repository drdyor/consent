export type TreatmentPointForSigning = {
  id: number;
  consentRecordId: number;
  productId: number;
  areaKey: string;
  coordinateX: string;
  coordinateY: string;
  measureType: "units" | "ml" | "other";
  amount: string;
  clinicalNote: string | null;
};

export function bindTreatmentMapForSigning(
  entries: TreatmentPointForSigning[],
  context: {
    product: { id: number; name: string };
    lotNumber: string;
    expiryDate: Date;
    practitioner: { id: number | null; displayName: string | null; registrationNumber: string | null };
  },
) {
  return entries.map(entry => ({ ...entry, product: context.product, lotNumber: context.lotNumber, expiryDate: context.expiryDate, practitioner: context.practitioner }));
}
