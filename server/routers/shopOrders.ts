import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { auditEvents, productInventoryLots, products, salesInvoices, salesOrderLines, salesOrders } from "../../drizzle/schema";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { requireAdmin, requireWorkspace } from "../services/workspace";
import { applyStockWithdrawal, assertLotSellable, lotOnHand } from "../services/shopInventory";
import { assertLineShippable, assertOrderTransition, buildSalesInvoiceSnapshot } from "../services/salesOrders";
import { loadSellableContext } from "./shop";

/**
 * WINDOW S2A — outbound sales orders to clinics: order → confirm → ship → deliver, each
 * shipped line drawing down a SPECIFIC stock lot (order_lot_traceability, fail-closed +
 * logged), and an immutable hash-backed invoice that ends at issued-not-collected.
 *
 * no_charge gate: this router contains NO payment, charge, or collection code path, and
 * every mutation input is a STRICT schema — a wired payment field is rejected at the
 * contract boundary. Prices are operator content; the system never invents an amount.
 */

const currencyCode = z.string().regex(/^[A-Z]{3}$/, "Currency must be a 3-letter ISO code");
const quantityUnit = z.enum(["units", "ml", "other"]);

async function loadOrderForUpdate(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, clinicId: number, salesOrderId: number) {
  const order = (await db.select().from(salesOrders).where(and(eq(salesOrders.id, salesOrderId), eq(salesOrders.clinicId, clinicId))).limit(1))[0];
  if (!order) throw new Error("Sales order not found in this clinic");
  const lines = await db.select().from(salesOrderLines).where(eq(salesOrderLines.salesOrderId, order.id));
  return { order, lines };
}

/** Validates that a lot can back this order line: same clinic, same product, listed, sellable, enough on hand. */
async function assertLotAllocatable(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, clinic: any, inventoryLotId: number, productId: number, quantity: number) {
  const { lot, product, source, gate } = await loadSellableContext(db, clinic, inventoryLotId);
  if (lot.productId !== productId) throw new Error("Order lot traceability failure: the allocated lot belongs to a different product than the order line");
  if (!lot.listedForSaleAt || lot.delistedAt) throw new Error("Order lot traceability failure: only a lot listed on the seller catalog can be allocated to a sales order");
  assertLotSellable({ lot, sourceReviewStatus: source.reviewStatus, evidenceGate: gate });
  if (quantity > lotOnHand(lot) + 1e-9) throw new Error(`Order lot traceability failure: lot ${lot.lotNumber} has only ${lotOnHand(lot)} on hand — cannot allocate ${quantity}`);
  return { lot, product };
}

export const shopOrdersRouter = router({
  salesOrders: protectedProcedure.query(async ({ ctx }) => {
    const workspace = await requireWorkspace(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable");
    const orders = await db.select().from(salesOrders).where(eq(salesOrders.clinicId, workspace.clinic.id));
    const lines = await db.select({ line: salesOrderLines, product: products }).from(salesOrderLines).innerJoin(products, eq(salesOrderLines.productId, products.id));
    const lots = await db.select().from(productInventoryLots).where(eq(productInventoryLots.clinicId, workspace.clinic.id));
    const invoices = await db.select().from(salesInvoices).where(eq(salesInvoices.clinicId, workspace.clinic.id));
    return orders.map(order => ({
      order,
      invoice: invoices.find(invoice => invoice.salesOrderId === order.id) || null,
      lines: lines.filter(item => item.line.salesOrderId === order.id).map(item => ({ ...item, lot: item.line.inventoryLotId ? lots.find(lot => lot.id === item.line.inventoryLotId) || null : null })),
    }));
  }),

  createSalesOrder: protectedProcedure.input(z.strictObject({
    orderNumber: z.string().min(2).max(120),
    buyerName: z.string().min(2).max(200),
    buyerClinicId: z.number().int().positive().optional(),
    shippingAddress: z.string().min(5).max(500),
    lines: z.array(z.strictObject({ productId: z.number().int().positive(), quantity: z.number().positive(), quantityUnit, inventoryLotId: z.number().int().positive().optional() })).min(1),
  })).mutation(async ({ ctx, input }) => {
    const workspace = await requireAdmin(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable");
    for (const line of input.lines) {
      if (line.inventoryLotId) await assertLotAllocatable(db, workspace.clinic, line.inventoryLotId, line.productId, line.quantity);
    }
    const inserted = await db.insert(salesOrders).values({ clinicId: workspace.clinic.id, orderNumber: input.orderNumber, buyerClinicId: input.buyerClinicId || null, buyerName: input.buyerName.trim(), shippingAddress: input.shippingAddress.trim(), orderedAt: new Date(), createdByUserId: ctx.user.id }).$returningId();
    const salesOrderId = inserted[0]?.id; if (!salesOrderId) throw new Error("Unable to create the sales order");
    await db.insert(salesOrderLines).values(input.lines.map(line => ({ salesOrderId, productId: line.productId, inventoryLotId: line.inventoryLotId || null, quantity: String(line.quantity), quantityUnit: line.quantityUnit, allocatedAt: line.inventoryLotId ? new Date() : null })));
    await db.insert(auditEvents).values({ clinicId: workspace.clinic.id, actorUserId: ctx.user.id, action: "shop.sales_order_created", entityType: "salesOrder", entityId: String(salesOrderId), summary: `Sales order ${input.orderNumber} created for ${input.buyerName.trim()} with ${input.lines.length} line(s)` });
    return { salesOrderId };
  }),

  /** Allocate a SPECIFIC stock lot to an order line (required before shipping). */
  allocateOrderLine: protectedProcedure.input(z.strictObject({ salesOrderLineId: z.number().int().positive(), inventoryLotId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const workspace = await requireAdmin(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable");
    const line = (await db.select().from(salesOrderLines).where(eq(salesOrderLines.id, input.salesOrderLineId)).limit(1))[0];
    if (!line) throw new Error("Sales order line not found");
    const { order } = await loadOrderForUpdate(db, workspace.clinic.id, line.salesOrderId);
    if (order.status !== "ordered" && order.status !== "confirmed") throw new Error("Lots can only be allocated before the order ships");
    const { lot, product } = await assertLotAllocatable(db, workspace.clinic, input.inventoryLotId, line.productId, Number(line.quantity));
    await db.update(salesOrderLines).set({ inventoryLotId: lot.id, allocatedAt: new Date() }).where(eq(salesOrderLines.id, line.id));
    await db.insert(auditEvents).values({ clinicId: workspace.clinic.id, actorUserId: ctx.user.id, action: "shop.order_line_allocated", entityType: "salesOrderLine", entityId: String(line.id), summary: `Order ${order.orderNumber} line ${line.id} allocated to lot ${lot.lotNumber} (${product.name}), expiry ${lot.expiryDate ? new Date(lot.expiryDate).toISOString().slice(0, 10) : "?"}` });
    return { success: true };
  }),

  /** Operator-content price per line. The system never invents an amount. */
  setLineSellPrice: protectedProcedure.input(z.strictObject({ salesOrderLineId: z.number().int().positive(), unitSellPrice: z.number().positive().nullable(), sellCurrency: currencyCode.optional() })).mutation(async ({ ctx, input }) => {
    const workspace = await requireAdmin(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable");
    const line = (await db.select().from(salesOrderLines).where(eq(salesOrderLines.id, input.salesOrderLineId)).limit(1))[0];
    if (!line) throw new Error("Sales order line not found");
    const { order } = await loadOrderForUpdate(db, workspace.clinic.id, line.salesOrderId);
    if (input.unitSellPrice !== null && !input.sellCurrency) throw new Error("A recorded price needs its currency");
    await db.update(salesOrderLines).set({ unitSellPrice: input.unitSellPrice === null ? null : String(input.unitSellPrice), sellCurrency: input.unitSellPrice === null ? null : input.sellCurrency }).where(eq(salesOrderLines.id, line.id));
    await db.insert(auditEvents).values({ clinicId: workspace.clinic.id, actorUserId: ctx.user.id, action: "shop.line_price_recorded", entityType: "salesOrderLine", entityId: String(line.id), summary: input.unitSellPrice === null ? `Operator cleared the price on order ${order.orderNumber} line ${line.id}` : `Operator recorded ${input.unitSellPrice} ${input.sellCurrency}/unit on order ${order.orderNumber} line ${line.id}` });
    return { success: true };
  }),

  confirmSalesOrder: protectedProcedure.input(z.strictObject({ salesOrderId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const workspace = await requireAdmin(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable");
    const { order } = await loadOrderForUpdate(db, workspace.clinic.id, input.salesOrderId);
    assertOrderTransition(order.status, "confirmed");
    await db.update(salesOrders).set({ status: "confirmed", confirmedAt: new Date() }).where(eq(salesOrders.id, order.id));
    await db.insert(auditEvents).values({ clinicId: workspace.clinic.id, actorUserId: ctx.user.id, action: "shop.sales_order_confirmed", entityType: "salesOrder", entityId: String(order.id), summary: `Sales order ${order.orderNumber} confirmed` });
    return { success: true };
  }),

  /**
   * order_lot_traceability gate: shipping REFUSES (fail-closed, logged) when any line has
   * no allocated lot, when a lot stopped being sellable (e.g. expired since allocation),
   * or when the drawdown would drive stock negative. On success every line draws down its
   * specific lot's soldQuantity.
   */
  shipSalesOrder: protectedProcedure.input(z.strictObject({ salesOrderId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const workspace = await requireAdmin(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable");
    const { order, lines } = await loadOrderForUpdate(db, workspace.clinic.id, input.salesOrderId);
    assertOrderTransition(order.status, "shipped");
    if (!lines.length) throw new Error("A sales order with no lines cannot ship");
    const drawdowns: { lotId: number; newSoldQuantity: number; lotNumber: string; expiryDate: Date | null; productName: string; lineId: number }[] = [];
    const runningLots = new Map<number, { quantity: string | number; soldQuantity: string | number }>();
    try {
      for (const line of lines) {
        assertLineShippable(line);
        const { lot, product, source, gate } = await loadSellableContext(db, workspace.clinic, line.inventoryLotId!);
        assertLotSellable({ lot, sourceReviewStatus: source.reviewStatus, evidenceGate: gate });
        const running = runningLots.get(lot.id) || { quantity: lot.quantity, soldQuantity: lot.soldQuantity };
        const newSoldQuantity = applyStockWithdrawal(running, Number(line.quantity));
        runningLots.set(lot.id, { quantity: running.quantity, soldQuantity: newSoldQuantity });
        drawdowns.push({ lotId: lot.id, newSoldQuantity, lotNumber: lot.lotNumber, expiryDate: lot.expiryDate, productName: product.name, lineId: line.id });
      }
    } catch (error: any) {
      await db.insert(auditEvents).values({ clinicId: workspace.clinic.id, actorUserId: ctx.user.id, action: "shop.ship_refused", entityType: "salesOrder", entityId: String(order.id), summary: `Shipment refused for order ${order.orderNumber}: ${error?.message || "blocked"}` });
      throw error;
    }
    const shippedAt = new Date();
    for (const drawdown of drawdowns) {
      await db.update(productInventoryLots).set({ soldQuantity: String(drawdown.newSoldQuantity) }).where(eq(productInventoryLots.id, drawdown.lotId));
    }
    await db.update(salesOrderLines).set({ shippedAt }).where(eq(salesOrderLines.salesOrderId, order.id));
    await db.update(salesOrders).set({ status: "shipped", shippedAt }).where(eq(salesOrders.id, order.id));
    await db.insert(auditEvents).values({ clinicId: workspace.clinic.id, actorUserId: ctx.user.id, action: "shop.sales_order_shipped", entityType: "salesOrder", entityId: String(order.id), summary: `Sales order ${order.orderNumber} shipped to ${order.buyerName}: ${drawdowns.map(item => `${item.productName} lot ${item.lotNumber} (expiry ${item.expiryDate ? new Date(item.expiryDate).toISOString().slice(0, 10) : "?"})`).join("; ")}` });
    return { success: true, shippedLines: drawdowns.map(item => ({ lineId: item.lineId, lotId: item.lotId, lotNumber: item.lotNumber })) };
  }),

  deliverSalesOrder: protectedProcedure.input(z.strictObject({ salesOrderId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const workspace = await requireAdmin(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable");
    const { order } = await loadOrderForUpdate(db, workspace.clinic.id, input.salesOrderId);
    assertOrderTransition(order.status, "delivered");
    await db.update(salesOrders).set({ status: "delivered", deliveredAt: new Date() }).where(eq(salesOrders.id, order.id));
    await db.insert(auditEvents).values({ clinicId: workspace.clinic.id, actorUserId: ctx.user.id, action: "shop.sales_order_delivered", entityType: "salesOrder", entityId: String(order.id), summary: `Sales order ${order.orderNumber} delivered to ${order.buyerName}` });
    return { success: true };
  }),

  /**
   * Immutable invoice: sealed JSON snapshot + sha256 hash (the signed-consent pattern).
   * Terminal state is issued_not_collected — there is no payment path and no status beyond it.
   * STRICT input: any extra field (e.g. a wired payment flag) is rejected (no_charge trap).
   */
  issueInvoice: protectedProcedure.input(z.strictObject({ salesOrderId: z.number().int().positive(), invoiceNumber: z.string().min(2).max(120) })).mutation(async ({ ctx, input }) => {
    const workspace = await requireAdmin(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable");
    const { order, lines } = await loadOrderForUpdate(db, workspace.clinic.id, input.salesOrderId);
    if (order.status !== "shipped" && order.status !== "delivered") throw new Error("An invoice can only be issued for a shipped or delivered order");
    const existing = (await db.select().from(salesInvoices).where(eq(salesInvoices.salesOrderId, order.id)).limit(1))[0];
    if (existing) throw new Error(`Invoice ${existing.invoiceNumber} already exists for this order — invoices are immutable and never reissued`);
    const lots = await db.select().from(productInventoryLots).where(eq(productInventoryLots.clinicId, workspace.clinic.id));
    const productRows = await db.select().from(products);
    const issuedAt = new Date();
    const { snapshot, snapshotHash } = buildSalesInvoiceSnapshot({
      invoiceNumber: input.invoiceNumber,
      order: { id: order.id, orderNumber: order.orderNumber, buyerName: order.buyerName, buyerClinicId: order.buyerClinicId, shippingAddress: order.shippingAddress, orderedAt: order.orderedAt, shippedAt: order.shippedAt, deliveredAt: order.deliveredAt },
      sellerClinic: { id: workspace.clinic.id, name: workspace.clinic.name, jurisdiction: workspace.clinic.jurisdiction || null },
      lines: lines.map(line => {
        const lot = line.inventoryLotId ? lots.find(item => item.id === line.inventoryLotId) : null;
        const product = productRows.find(item => item.id === line.productId);
        return { lineId: line.id, productName: product?.name || "", manufacturer: product?.manufacturer || null, lotNumber: lot?.lotNumber || "", expiryDate: lot?.expiryDate as Date, quantity: Number(line.quantity), quantityUnit: line.quantityUnit, unitSellPrice: line.unitSellPrice === null ? null : Number(line.unitSellPrice), sellCurrency: line.sellCurrency };
      }),
      issuedAt,
    });
    const inserted = await db.insert(salesInvoices).values({ clinicId: workspace.clinic.id, salesOrderId: order.id, invoiceNumber: input.invoiceNumber, snapshot, snapshotHash, issuedAt, issuedByUserId: ctx.user.id }).$returningId();
    const invoiceId = inserted[0]?.id; if (!invoiceId) throw new Error("Unable to store the invoice");
    await db.insert(auditEvents).values({ clinicId: workspace.clinic.id, actorUserId: ctx.user.id, action: "shop.invoice_issued", entityType: "salesInvoice", entityId: String(invoiceId), summary: `Invoice ${input.invoiceNumber} issued (not collected) for order ${order.orderNumber}, hash ${snapshotHash.slice(0, 16)}…` });
    return { invoiceId, snapshotHash, status: "issued_not_collected" as const };
  }),
});
