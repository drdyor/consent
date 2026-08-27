import { createHash } from "node:crypto";

/**
 * WINDOW S2A — outbound sales-order gate logic (order → confirm → ship → deliver → invoice).
 *
 * Pure functions only; the tRPC shopOrders router feeds these with rows it loaded.
 * Gates implemented here:
 * - order_lot_traceability: a product line may only SHIP against a specific allocated stock
 *   lot carrying lot number + expiry; a line with no lot FAILS (fail-closed).
 * - no_charge: there is NO payment/charge code path in this module or anywhere downstream.
 *   Invoices are sealed at "issued_not_collected" and that is the terminal state; collection
 *   is an operator/seam decision outside this system.
 *
 * The invoice reuses the immutable-snapshot pattern of the signed consent
 * (server/services/consentSnapshot.ts): a plain JSON snapshot hashed with sha256. The
 * snapshot NEVER invents a price — a line without an operator-recorded price carries an
 * explicit "price not recorded" statement instead of a number.
 */

export const SALES_ORDER_TRANSITIONS: Record<string, string[]> = {
  ordered: ["confirmed", "cancelled"],
  confirmed: ["shipped", "cancelled"],
  shipped: ["delivered"],
  delivered: [],
  cancelled: [],
};

export function assertOrderTransition(from: string, to: string) {
  const allowed = SALES_ORDER_TRANSITIONS[from] || [];
  if (!allowed.includes(to)) throw new Error(`Sales order cannot move from ${from} to ${to}`);
}

export type ShippableLineLike = {
  id: number;
  inventoryLotId: number | null;
  quantity: string | number;
};

/** order_lot_traceability gate: shipping a line with no allocated lot FAILS. */
export function assertLineShippable(line: ShippableLineLike) {
  if (!line.inventoryLotId) throw new Error(`Order lot traceability failure: line ${line.id} has no allocated stock lot — a shipped product line must reference a specific lot with expiry`);
  const quantity = Number(line.quantity);
  if (!Number.isFinite(quantity) || quantity <= 0) throw new Error(`Order lot traceability failure: line ${line.id} has no positive quantity`);
}

export type InvoiceLineInput = {
  lineId: number;
  productName: string;
  manufacturer: string | null;
  lotNumber: string;
  expiryDate: Date | string;
  quantity: number;
  quantityUnit: string;
  /** Operator content; null means the price was deliberately not recorded. */
  unitSellPrice: number | null;
  sellCurrency: string | null;
};

export const PRICE_NOT_RECORDED_STATEMENT = "Price not recorded. Pricing is operator content and no amount was entered.";

/**
 * Builds the immutable invoice snapshot + sha256 hash. Every line MUST carry a specific
 * lot number and expiry (order_lot_traceability travels into the sealed document).
 * The snapshot's own charge slot states plainly that nothing was or will be charged here.
 */
export function buildSalesInvoiceSnapshot(input: {
  invoiceNumber: string;
  order: { id: number; orderNumber: string; buyerName: string; buyerClinicId: number | null; shippingAddress: string; orderedAt: Date | string; shippedAt: Date | string | null; deliveredAt: Date | string | null };
  sellerClinic: { id: number; name: string; jurisdiction: string | null };
  lines: InvoiceLineInput[];
  issuedAt: Date;
}) {
  if (!input.lines.length) throw new Error("An invoice needs at least one shipped line");
  const lines = input.lines.map(line => {
    if (!line.lotNumber?.trim()) throw new Error(`Order lot traceability failure: invoice line ${line.lineId} carries no lot number`);
    const expiry = new Date(line.expiryDate);
    if (!Number.isFinite(expiry.getTime())) throw new Error(`Order lot traceability failure: invoice line ${line.lineId} carries no valid expiry date`);
    const priced = line.unitSellPrice !== null && Number.isFinite(line.unitSellPrice) && line.unitSellPrice > 0 && Boolean(line.sellCurrency);
    return {
      lineId: line.lineId,
      product: { name: line.productName, manufacturer: line.manufacturer },
      lot: { lotNumber: line.lotNumber, expiryDate: expiry.toISOString() },
      quantity: line.quantity,
      quantityUnit: line.quantityUnit,
      price: priced
        ? { unitSellPrice: line.unitSellPrice, currency: line.sellCurrency, lineTotal: Math.round(Number(line.unitSellPrice) * line.quantity * 100) / 100 }
        : { statement: PRICE_NOT_RECORDED_STATEMENT },
    };
  });
  const pricedLines = lines.filter(line => "lineTotal" in line.price);
  const currencies = Array.from(new Set(pricedLines.map(line => (line.price as { currency: string }).currency)));
  const total = pricedLines.length === lines.length && currencies.length === 1
    ? { amount: Math.round(pricedLines.reduce((sum, line) => sum + (line.price as { lineTotal: number }).lineTotal, 0) * 100) / 100, currency: currencies[0] }
    : { statement: "No total computed: one or more lines have no recorded price, or currencies differ." };
  const snapshot = {
    kind: "sales_invoice",
    invoiceNumber: input.invoiceNumber,
    seller: input.sellerClinic,
    buyer: { name: input.order.buyerName, clinicId: input.order.buyerClinicId },
    order: { id: input.order.id, orderNumber: input.order.orderNumber, shippingAddress: input.order.shippingAddress, orderedAt: new Date(input.order.orderedAt).toISOString(), shippedAt: input.order.shippedAt ? new Date(input.order.shippedAt).toISOString() : null, deliveredAt: input.order.deliveredAt ? new Date(input.order.deliveredAt).toISOString() : null },
    lines,
    total,
    charge: { status: "issued_not_collected", statement: "Nothing was charged and nothing will be charged by this system. Collection is an operator decision outside this software." },
    issuedAt: input.issuedAt.toISOString(),
  };
  const snapshotHash = createHash("sha256").update(JSON.stringify(snapshot)).digest("hex");
  return { snapshot, snapshotHash };
}
