import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { auditEvents, marketCatalogueProducts, productInventoryLots, products, productSources, supplierPurchaseOrderLines, supplierPurchaseOrders } from "../../drizzle/schema";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { requireAdmin, requireWorkspace } from "../services/workspace";
import { getMarketEvidenceGate } from "../services/marketCompliance";
import { applyStockWithdrawal, assertCostProvenance, assertLotSellable, lotExpiryState, lotOnHand, lotStockState, LOW_STOCK_THRESHOLD_DEFAULT, NEAR_EXPIRY_DAYS_DEFAULT } from "../services/shopInventory";

/**
 * WINDOW S1 — B2B shop INBOUND side: seller catalog over the existing products/productSources
 * tables, purchase-in that creates provenanced stock lots, and batch/expiry as first class.
 * Evidence + expiry refusals are FAIL-CLOSED and logged to auditEvents before rethrowing.
 * Sell price is operator content: this router stores an operator-written note and never
 * invents a number.
 */

const currencyCode = z.string().regex(/^[A-Z]{3}$/, "Currency must be a 3-letter ISO code");

/** Mirror of the legacy-evidence fallback used by catalog.approveSource / consents.create. */
const sourceForMarketGate = (source: typeof productSources.$inferSelect, product: typeof products.$inferSelect) => ({
  ...source,
  registryIdentifier: source.registryIdentifier || product.registryIdentifier || (product.registryStatus === "verified" ? "legacy-verified" : null),
  registryVerifiedAt: source.registryVerifiedAt || (product.registryStatus === "verified" ? new Date() : null),
});

export async function loadSellableContext(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, clinic: any, lotId: number) {
  const lot = (await db.select().from(productInventoryLots).where(and(eq(productInventoryLots.id, lotId), eq(productInventoryLots.clinicId, clinic.id))).limit(1))[0];
  if (!lot) throw new Error("Clinic inventory lot not found");
  const row = (await db.select({ product: products, source: productSources }).from(products).innerJoin(productSources, eq(products.sourceId, productSources.id)).where(eq(products.id, lot.productId)).limit(1))[0];
  if (!row) throw new Error("Product for this lot no longer resolves to a governed source");
  const catalogue = row.source.marketCatalogueProductId ? (await db.select().from(marketCatalogueProducts).where(eq(marketCatalogueProducts.id, row.source.marketCatalogueProductId)).limit(1))[0] || null : null;
  const gate = getMarketEvidenceGate(clinic, sourceForMarketGate(row.source, row.product), catalogue);
  return { lot, product: row.product, source: row.source, gate };
}

async function logShopRefusal(db: NonNullable<Awaited<ReturnType<typeof getDb>>>, clinicId: number, actorUserId: number, action: string, entityId: string, summary: string) {
  await db.insert(auditEvents).values({ clinicId, actorUserId, action, entityType: "productInventoryLot", entityId, summary });
}

export const shopRouter = router({
  /** Seller catalog: sellable-product view over products, with market evidence + per-lot batch states. */
  sellerCatalog: protectedProcedure.query(async ({ ctx }) => {
    const workspace = await requireWorkspace(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable");
    const rows = await db.select({ product: products, source: productSources }).from(products).innerJoin(productSources, eq(products.sourceId, productSources.id));
    const catalogueRecords = await db.select().from(marketCatalogueProducts);
    const lots = await db.select().from(productInventoryLots).where(eq(productInventoryLots.clinicId, workspace.clinic.id));
    const now = new Date();
    return rows.map(({ product, source }) => {
      const gate = getMarketEvidenceGate(workspace.clinic, sourceForMarketGate(source, product), source.marketCatalogueProductId ? catalogueRecords.find(item => item.id === source.marketCatalogueProductId) || null : null);
      const productLots = lots.filter(lot => lot.productId === product.id).map(lot => {
        const onHand = Math.max(0, Number(lot.quantity) - Number(lot.soldQuantity || 0));
        const expiryState = lotExpiryState(lot, now);
        return {
          id: lot.id, lotNumber: lot.lotNumber, expiryDate: lot.expiryDate, quantityUnit: lot.quantityUnit,
          receivedQuantity: Number(lot.quantity), soldQuantity: Number(lot.soldQuantity || 0), onHand,
          supplierName: lot.supplierName, unitCostBought: lot.unitCostBought, costCurrency: lot.costCurrency,
          expiryState, stockState: lotStockState(onHand, LOW_STOCK_THRESHOLD_DEFAULT),
          listedForSaleAt: lot.listedForSaleAt, delistedAt: lot.delistedAt, delistReason: lot.delistReason,
          isListed: Boolean(lot.listedForSaleAt) && !lot.delistedAt,
          saleBlocked: expiryState === "expired" || expiryState === "no_expiry_recorded" || !gate.eligible || source.reviewStatus !== "approved" || onHand <= 0,
        };
      });
      return {
        product: { id: product.id, name: product.name, manufacturer: product.manufacturer, category: product.category, isActive: product.isActive, sellerListingStatus: product.sellerListingStatus, sellPriceNote: product.sellPriceNote },
        source: { id: source.id, reviewStatus: source.reviewStatus, jurisdiction: source.jurisdiction, documentKind: source.documentKind },
        evidenceGate: gate,
        sellable: gate.eligible && source.reviewStatus === "approved",
        lots: productLots,
        nearExpiryDays: NEAR_EXPIRY_DAYS_DEFAULT,
        lowStockThreshold: LOW_STOCK_THRESHOLD_DEFAULT,
      };
    });
  }),

  /** Batch/expiry work queue: low-stock, near-expiry, and expired lots for the clinic. */
  stockAlerts: protectedProcedure.query(async ({ ctx }) => {
    const workspace = await requireWorkspace(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable");
    const lots = await db.select({ lot: productInventoryLots, product: products }).from(productInventoryLots).innerJoin(products, eq(productInventoryLots.productId, products.id)).where(eq(productInventoryLots.clinicId, workspace.clinic.id));
    const now = new Date();
    const decorated = lots.map(({ lot, product }) => {
      const onHand = Math.max(0, Number(lot.quantity) - Number(lot.soldQuantity || 0));
      return { lotId: lot.id, productName: product.name, lotNumber: lot.lotNumber, expiryDate: lot.expiryDate, onHand, quantityUnit: lot.quantityUnit, expiryState: lotExpiryState(lot, now), stockState: lotStockState(onHand, LOW_STOCK_THRESHOLD_DEFAULT), isListed: Boolean(lot.listedForSaleAt) && !lot.delistedAt };
    });
    return {
      expired: decorated.filter(item => item.expiryState === "expired"),
      nearExpiry: decorated.filter(item => item.expiryState === "near_expiry"),
      lowStock: decorated.filter(item => item.stockState !== "in_stock" && item.expiryState !== "expired"),
      missingExpiry: decorated.filter(item => item.expiryState === "no_expiry_recorded"),
    };
  }),

  /**
   * Purchase-in: receive a purchase-order line into a provenanced stock lot.
   * cost_provenance gate: supplier + unit cost + expiry are required or the receipt FAILS.
   */
  receivePurchaseLine: protectedProcedure.input(z.object({
    purchaseOrderLineId: z.number().int().positive(),
    receivedQuantity: z.number().positive(),
    lotNumber: z.string().min(1).max(128),
    expiryDate: z.date(),
    unitCostBought: z.number().positive(),
    costCurrency: currencyCode.default("PLN"),
    supplierName: z.string().min(2).max(200).optional(),
  })).mutation(async ({ ctx, input }) => {
    const workspace = await requireAdmin(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable");
    const line = (await db.select().from(supplierPurchaseOrderLines).where(eq(supplierPurchaseOrderLines.id, input.purchaseOrderLineId)).limit(1))[0];
    if (!line) throw new Error("Purchase-order line not found");
    const order = (await db.select().from(supplierPurchaseOrders).where(and(eq(supplierPurchaseOrders.id, line.purchaseOrderId), eq(supplierPurchaseOrders.clinicId, workspace.clinic.id))).limit(1))[0];
    if (!order) throw new Error("Purchase order not found in this clinic");
    const supplierName = input.supplierName?.trim() || order.supplierName;
    // cost_provenance gate — fail-closed before any write.
    assertCostProvenance({ supplierName, unitCostBought: input.unitCostBought, expiryDate: input.expiryDate });
    const inserted = await db.insert(productInventoryLots).values({
      clinicId: workspace.clinic.id, productId: line.productId, lotNumber: input.lotNumber, expiryDate: input.expiryDate,
      quantity: String(input.receivedQuantity), quantityUnit: line.quantityUnit, purchaseOrderLineId: line.id,
      supplierName, unitCostBought: String(input.unitCostBought), costCurrency: input.costCurrency, soldQuantity: "0",
      createdByUserId: ctx.user.id,
    }).$returningId();
    const lotId = inserted[0]?.id; if (!lotId) throw new Error("Unable to create the stock lot for this receipt");
    await db.update(supplierPurchaseOrderLines).set({ receivedQuantity: String(input.receivedQuantity), unitCostBought: String(input.unitCostBought), costCurrency: input.costCurrency }).where(eq(supplierPurchaseOrderLines.id, line.id));
    const lines = await db.select().from(supplierPurchaseOrderLines).where(eq(supplierPurchaseOrderLines.purchaseOrderId, order.id));
    const adjusted = lines.map(item => item.id === line.id ? { ...item, receivedQuantity: String(input.receivedQuantity) } : item);
    const status = adjusted.every(item => Number(item.receivedQuantity || 0) >= Number(item.expectedQuantity)) ? "received" : adjusted.some(item => Number(item.receivedQuantity || 0) > 0) ? "partially_received" : "ordered";
    await db.update(supplierPurchaseOrders).set({ status, receivedAt: status === "received" ? new Date() : null }).where(eq(supplierPurchaseOrders.id, order.id));
    const expiryState = lotExpiryState({ expiryDate: input.expiryDate });
    await db.insert(auditEvents).values({ clinicId: workspace.clinic.id, actorUserId: ctx.user.id, action: "shop.purchase_received", entityType: "productInventoryLot", entityId: String(lotId), summary: `Lot ${input.lotNumber} received: ${input.receivedQuantity} ${line.quantityUnit} from ${supplierName} at ${input.unitCostBought} ${input.costCurrency}/unit, expiry ${input.expiryDate.toISOString().slice(0, 10)}${expiryState === "expired" ? " (ALREADY EXPIRED — blocked from sale)" : ""}` });
    return { lotId, orderStatus: status, expiryState };
  }),

  /**
   * expiry_blocks_sale gate: list a lot on the seller catalog. An expired, expiry-less,
   * evidence-unapproved, or empty lot is REFUSED fail-closed, and the refusal is logged.
   */
  listLotForSale: protectedProcedure.input(z.object({ inventoryLotId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const workspace = await requireAdmin(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable");
    const { lot, product, source, gate } = await loadSellableContext(db, workspace.clinic, input.inventoryLotId);
    try {
      assertLotSellable({ lot, sourceReviewStatus: source.reviewStatus, evidenceGate: gate });
    } catch (error: any) {
      await logShopRefusal(db, workspace.clinic.id, ctx.user.id, "shop.listing_refused", String(lot.id), `Listing refused for lot ${lot.lotNumber} (${product.name}): ${error?.message || "blocked"}`);
      throw error;
    }
    await db.update(productInventoryLots).set({ listedForSaleAt: new Date(), listedByUserId: ctx.user.id, delistedAt: null, delistReason: null }).where(eq(productInventoryLots.id, lot.id));
    await db.update(products).set({ sellerListingStatus: "listed" }).where(eq(products.id, product.id));
    await db.insert(auditEvents).values({ clinicId: workspace.clinic.id, actorUserId: ctx.user.id, action: "shop.lot_listed", entityType: "productInventoryLot", entityId: String(lot.id), summary: `Lot ${lot.lotNumber} (${product.name}) listed for sale after evidence and expiry gates passed` });
    return { success: true, lotId: lot.id };
  }),

  delistLot: protectedProcedure.input(z.object({ inventoryLotId: z.number().int().positive(), reason: z.string().min(3).max(255) })).mutation(async ({ ctx, input }) => {
    const workspace = await requireAdmin(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable");
    const lot = (await db.select().from(productInventoryLots).where(and(eq(productInventoryLots.id, input.inventoryLotId), eq(productInventoryLots.clinicId, workspace.clinic.id))).limit(1))[0];
    if (!lot) throw new Error("Clinic inventory lot not found");
    if (!lot.listedForSaleAt || lot.delistedAt) throw new Error("Only a currently listed lot can be delisted");
    await db.update(productInventoryLots).set({ delistedAt: new Date(), delistReason: input.reason.trim() }).where(eq(productInventoryLots.id, lot.id));
    await db.insert(auditEvents).values({ clinicId: workspace.clinic.id, actorUserId: ctx.user.id, action: "shop.lot_delisted", entityType: "productInventoryLot", entityId: String(lot.id), summary: `Lot ${lot.lotNumber} delisted: ${input.reason.trim()}` });
    return { success: true };
  }),

  /** Operator-content sell price note. The system never invents a price. */
  setSellPriceNote: protectedProcedure.input(z.object({ productId: z.number().int().positive(), sellPriceNote: z.string().max(160).nullable() })).mutation(async ({ ctx, input }) => {
    const workspace = await requireAdmin(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable");
    const product = (await db.select().from(products).where(eq(products.id, input.productId)).limit(1))[0];
    if (!product) throw new Error("Product not found");
    await db.update(products).set({ sellPriceNote: input.sellPriceNote?.trim() || null }).where(eq(products.id, product.id));
    await db.insert(auditEvents).values({ clinicId: workspace.clinic.id, actorUserId: ctx.user.id, action: "shop.sell_price_note_set", entityType: "product", entityId: String(product.id), summary: input.sellPriceNote?.trim() ? `Operator price note recorded for ${product.name}` : `Operator price note cleared for ${product.name}` });
    return { success: true };
  }),

  /**
   * stock_integrity gate: record an outbound sale movement against a listed lot.
   * Re-runs the sellable gate at sale time (a lot that expired after listing is refused,
   * fail-closed and logged). Stock never goes negative.
   */
  recordSale: protectedProcedure.input(z.object({ inventoryLotId: z.number().int().positive(), quantity: z.number().positive(), buyerReference: z.string().max(200).optional() })).mutation(async ({ ctx, input }) => {
    const workspace = await requireAdmin(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable");
    const { lot, product, source, gate } = await loadSellableContext(db, workspace.clinic, input.inventoryLotId);
    if (!lot.listedForSaleAt || lot.delistedAt) throw new Error("This lot is not listed on the seller catalog");
    let newSoldQuantity: number;
    try {
      assertLotSellable({ lot, sourceReviewStatus: source.reviewStatus, evidenceGate: gate });
      newSoldQuantity = applyStockWithdrawal(lot, input.quantity);
    } catch (error: any) {
      await logShopRefusal(db, workspace.clinic.id, ctx.user.id, "shop.sale_refused", String(lot.id), `Sale refused for lot ${lot.lotNumber} (${product.name}): ${error?.message || "blocked"}`);
      throw error;
    }
    await db.update(productInventoryLots).set({ soldQuantity: String(newSoldQuantity) }).where(eq(productInventoryLots.id, lot.id));
    const onHand = Math.round((Number(lot.quantity) - newSoldQuantity) * 100) / 100;
    await db.insert(auditEvents).values({ clinicId: workspace.clinic.id, actorUserId: ctx.user.id, action: "shop.stock_sold", entityType: "productInventoryLot", entityId: String(lot.id), summary: `Sold ${input.quantity} ${lot.quantityUnit} from lot ${lot.lotNumber} (${product.name})${input.buyerReference ? ` to ${input.buyerReference.trim()}` : ""}; ${onHand} remain on hand` });
    return { success: true, soldQuantity: newSoldQuantity, onHand };
  }),
});
