import { createHash } from "node:crypto";

export const CONTROLLED_REFERENCE = /^[A-Za-z0-9][A-Za-z0-9._:-]{2,127}$/;
export const AEGIS_PRODUCT_REFERENCE = /^aegis-product:(\d+)$/;
export const AEGIS_LOT_REFERENCE = /^aegis-lot:(\d+)$/;
export const AEGIS_LOCATION_REFERENCE = /^aegis-location:[A-Za-z0-9._:-]{3,48}$/;
export const ORIGIN_APPS = ["dental", "aesthetics", "md"] as const;

export type OriginApp = (typeof ORIGIN_APPS)[number];

export function requireControlledReference(value: string, label: string) {
  if (!CONTROLLED_REFERENCE.test(value)) throw new Error(`${label} must be an opaque controlled reference`);
  return value;
}

export function parseAegisProductReference(value: string) {
  const match = AEGIS_PRODUCT_REFERENCE.exec(value);
  if (!match) throw new Error("catalogueItemRef must be an Aegis product reference");
  return Number(match[1]);
}

export function parseAegisLotReference(value: string) {
  const match = AEGIS_LOT_REFERENCE.exec(value);
  if (!match) throw new Error("lotRef must be an Aegis lot reference");
  return Number(match[1]);
}

export function makeAegisProductReference(productId: number) { return `aegis-product:${productId}`; }
export function makeAegisLotReference(lotId: number) { return `aegis-lot:${lotId}`; }
export function makeAegisPackageReference(eventId: number) { return `aegis-consent-package:${eventId}`; }
function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([left], [right]) => left.localeCompare(right)).map(([key, nested]) => [key, canonicalize(nested)]));
  return value;
}

export function stablePayloadHash(payload: unknown) { return createHash("sha256").update(JSON.stringify(canonicalize(payload))).digest("hex"); }

export function getLotOperationalStatus(lot: { expiryDate: Date; quantity: string | number }) {
  if (lot.expiryDate.getTime() <= Date.now()) return "expired" as const;
  if (Number(lot.quantity) <= 0) return "depleted" as const;
  return "usable" as const;
}

export function productRevision(input: { productId: number; sourceId: number; documentVersion?: string | null }) {
  return `product-${input.productId}:source-${input.sourceId}:document-${input.documentVersion || "unversioned"}`;
}

export function readinessState(input: { evidenceStatus: "approved" | "blocked"; lotStatus: "usable" | "expired" | "depleted"; availableQuantity: number; requestedQuantity: number; quantityUnitMatches: boolean }) {
  if (input.evidenceStatus !== "approved") return { status: "blocked" as const, code: "evidence_not_approved", reason: "The governed source or market-evidence gate is not approved for this clinic." };
  if (input.lotStatus === "expired") return { status: "blocked" as const, code: "lot_expired", reason: "The selected recorded lot is expired." };
  if (input.lotStatus === "depleted") return { status: "blocked" as const, code: "lot_depleted", reason: "The selected recorded lot has no usable quantity." };
  if (!input.quantityUnitMatches) return { status: "attention_required" as const, code: "quantity_unit_mismatch", reason: "The requested quantity unit differs from the recorded lot unit." };
  if (input.availableQuantity < input.requestedQuantity) return { status: "attention_required" as const, code: "insufficient_quantity", reason: "The selected recorded lot has less usable quantity than requested." };
  return { status: "ready" as const, code: "ready", reason: "The selected governed lot is approved, unexpired, and has the requested recorded quantity." };
}
