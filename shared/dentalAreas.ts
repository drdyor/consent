/**
 * Dental treatment-area keys using FDI two-digit tooth notation.
 * Quadrants: 1x upper right, 2x upper left, 3x lower left, 4x lower right.
 * These are area KEYS for consent documentation only. They are not a dental
 * chart; charting is owned by the Clinic application (D1 boundary ruling).
 * Free-text area keys remain supported everywhere these are offered.
 */

const FDI_QUADRANT_LABELS: Record<string, string> = {
  "1": "upper right",
  "2": "upper left",
  "3": "lower left",
  "4": "lower right",
};

/** All permanent-dentition FDI tooth numbers: 11-18, 21-28, 31-38, 41-48. */
export const FDI_TOOTH_NUMBERS: string[] = ["1", "2", "3", "4"].flatMap(quadrant =>
  Array.from({ length: 8 }, (_, index) => `${quadrant}${index + 1}`),
);

/** Area-key form stored on records and map entries, e.g. "tooth-36". */
export const DENTAL_AREA_KEYS: string[] = FDI_TOOTH_NUMBERS.map(tooth => `tooth-${tooth}`);

const DENTAL_AREA_PATTERN = /^tooth-([1-4][1-8])$/;

export function isDentalAreaKey(areaKey: string): boolean {
  return DENTAL_AREA_PATTERN.test(areaKey);
}

/** "tooth-36" -> "Tooth 36 (FDI)". Non-dental keys keep the existing dash-to-space rendering. */
export function formatTreatmentAreaKey(areaKey: string): string {
  const match = DENTAL_AREA_PATTERN.exec(areaKey);
  if (match) return `Tooth ${match[1]} (FDI)`;
  return areaKey.replaceAll("-", " ");
}

/** Selector option label, e.g. "Tooth 36 — lower left (FDI)". */
export function dentalAreaOptionLabel(areaKey: string): string {
  const match = DENTAL_AREA_PATTERN.exec(areaKey);
  if (!match) return areaKey;
  return `Tooth ${match[1]} — ${FDI_QUADRANT_LABELS[match[1][0]]} (FDI)`;
}
