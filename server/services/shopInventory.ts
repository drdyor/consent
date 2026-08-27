/**
 * WINDOW S1 — shop inventory gate logic (seller catalog + purchase-in + batch/expiry).
 *
 * Pure functions only: the tRPC shop router feeds these with rows it loaded and with the
 * existing market evidence gate result (server/services/marketCompliance.ts — called, never
 * modified). All refusals are fail-closed: missing data is treated as NOT sellable.
 *
 * Gates implemented here:
 * - expiry_blocks_sale: an expired (or expiry-less, or evidence-unapproved) lot cannot be
 *   listed for sale, and cannot be sold even if it was listed before it expired.
 * - stock_integrity: received (quantity) − sold (soldQuantity) = on-hand, never negative.
 * - cost_provenance: every shop-received lot carries supplier + unit cost + expiry or FAILS.
 */

export const NEAR_EXPIRY_DAYS_DEFAULT = 90;
export const LOW_STOCK_THRESHOLD_DEFAULT = 5;

export type ShopLotLike = {
  quantity: string | number;
  soldQuantity: string | number | null;
  expiryDate: Date | null;
  supplierName?: string | null;
  unitCostBought?: string | number | null;
};

export type LotExpiryState = "ok" | "near_expiry" | "expired" | "no_expiry_recorded";
export type LotStockState = "in_stock" | "low_stock" | "out_of_stock";

export function lotOnHand(lot: Pick<ShopLotLike, "quantity" | "soldQuantity">) {
  const received = Number(lot.quantity);
  const sold = Number(lot.soldQuantity || 0);
  if (!Number.isFinite(received) || !Number.isFinite(sold)) throw new Error("Stock integrity failure: lot quantities are not numeric");
  const onHand = Math.round((received - sold) * 100) / 100;
  if (onHand < 0) throw new Error("Stock integrity failure: sold quantity exceeds received quantity for this lot");
  return onHand;
}

export function lotExpiryState(lot: Pick<ShopLotLike, "expiryDate">, now = new Date(), nearExpiryDays = NEAR_EXPIRY_DAYS_DEFAULT): LotExpiryState {
  if (!lot.expiryDate) return "no_expiry_recorded";
  const expiry = new Date(lot.expiryDate).getTime();
  if (!Number.isFinite(expiry)) return "no_expiry_recorded";
  if (expiry <= now.getTime()) return "expired";
  if (expiry <= now.getTime() + nearExpiryDays * 24 * 60 * 60 * 1000) return "near_expiry";
  return "ok";
}

export function lotStockState(onHand: number, lowStockThreshold = LOW_STOCK_THRESHOLD_DEFAULT): LotStockState {
  if (onHand <= 0) return "out_of_stock";
  if (onHand <= lowStockThreshold) return "low_stock";
  return "in_stock";
}

/** cost_provenance gate: a lot without supplier + unit cost + expiry FAILS. */
export function assertCostProvenance(lot: { supplierName?: string | null; unitCostBought?: string | number | null; expiryDate?: Date | null }) {
  const missing: string[] = [];
  if (!lot.supplierName?.trim()) missing.push("supplier");
  const cost = lot.unitCostBought === null || lot.unitCostBought === undefined || lot.unitCostBought === "" ? NaN : Number(lot.unitCostBought);
  if (!Number.isFinite(cost) || cost <= 0) missing.push("unit cost bought");
  if (!lot.expiryDate || !Number.isFinite(new Date(lot.expiryDate).getTime())) missing.push("expiry date");
  if (missing.length) throw new Error(`Cost provenance failure: a stock lot must carry ${missing.join(", ")} before it can be received into the shop`);
}

type EvidenceGateResult = { eligible: boolean; code: string; message: string };

/**
 * expiry_blocks_sale gate. Throws (fail-closed) when the lot may not be offered for sale.
 * The caller is responsible for logging the refusal to auditEvents before rethrowing.
 */
export function assertLotSellable(input: {
  lot: ShopLotLike;
  sourceReviewStatus: string;
  evidenceGate: EvidenceGateResult;
  now?: Date;
}) {
  const now = input.now || new Date();
  const expiryState = lotExpiryState(input.lot, now);
  if (expiryState === "expired") throw new Error("Expired lot blocked from sale: this batch is past its expiry date and cannot be listed or sold");
  if (expiryState === "no_expiry_recorded") throw new Error("Lot blocked from sale (fail-closed): no valid expiry date is recorded for this batch");
  if (input.sourceReviewStatus !== "approved") throw new Error("Lot blocked from sale: the product source has not been approved for patient-ready use");
  if (!input.evidenceGate.eligible) throw new Error(`Lot blocked from sale: market evidence gate refused (${input.evidenceGate.code}) — ${input.evidenceGate.message}`);
  if (lotOnHand(input.lot) <= 0) throw new Error("Lot blocked from sale: no on-hand stock remains in this batch");
}

/** stock_integrity gate for an outbound movement. Returns the new sold quantity. */
export function applyStockWithdrawal(lot: Pick<ShopLotLike, "quantity" | "soldQuantity">, withdrawQuantity: number) {
  if (!Number.isFinite(withdrawQuantity) || withdrawQuantity <= 0) throw new Error("Stock integrity failure: withdrawal quantity must be a positive number");
  const onHand = lotOnHand(lot);
  if (withdrawQuantity > onHand + 1e-9) throw new Error(`Stock integrity failure: cannot sell ${withdrawQuantity} from a lot with only ${onHand} on hand — stock never goes negative`);
  return Math.round((Number(lot.soldQuantity || 0) + withdrawQuantity) * 100) / 100;
}
