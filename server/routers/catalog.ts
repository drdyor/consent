import { and, eq, or } from "drizzle-orm";
import { z } from "zod";
import { consentTemplates, disclosureBlocks, products, productSources } from "../../drizzle/schema";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { requireAdmin, requireWorkspace } from "../services/workspace";

const templateSections = z.array(z.object({ id: z.string(), title: z.string().min(1), body: z.string().min(1), required: z.boolean() }));
const sourceDisclosure = z.object({ scope: z.enum(["product", "area"]), treatmentAreaKey: z.string().max(64).optional(), kind: z.enum(["contraindication", "warning", "precaution", "adverse_event"]), title: z.string().min(2).max(255), body: z.string().min(2).max(16000), requiredAcknowledgement: z.boolean().default(true) });

export const catalogRouter = router({
  templates: protectedProcedure.query(async ({ ctx }) => {
    const workspace = await requireWorkspace(ctx.user);
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    return db.select().from(consentTemplates).where(and(eq(consentTemplates.status, "active"), or(eq(consentTemplates.clinicId, workspace.clinic.id), eq(consentTemplates.isStarterTemplate, true))));
  }),
  createTemplate: protectedProcedure.input(z.object({ name: z.string().min(3).max(160), procedureKey: z.string().min(3).max(100), description: z.string().max(1000).optional(), sections: templateSections })).mutation(async ({ ctx, input }) => {
    const workspace = await requireAdmin(ctx.user);
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const result = await db.insert(consentTemplates).values({ clinicId: workspace.clinic.id, createdByUserId: ctx.user.id, name: input.name, procedureKey: input.procedureKey, description: input.description, sections: input.sections, status: "active" }).$returningId();
    return { id: result[0]?.id };
  }),
  sources: protectedProcedure.query(async ({ ctx }) => {
    await requireWorkspace(ctx.user);
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    return db.select({ product: products, source: productSources }).from(products).innerJoin(productSources, eq(products.sourceId, productSources.id));
  }),
  approveSource: protectedProcedure.input(z.object({ sourceId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    await requireAdmin(ctx.user);
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    await db.update(productSources).set({ reviewStatus: "approved", reviewedByUserId: ctx.user.id, reviewedAt: new Date() }).where(eq(productSources.id, input.sourceId));
    return { success: true };
  }),
  createProductSource: protectedProcedure.input(z.object({
    productName: z.string().min(2).max(160), manufacturer: z.string().min(2).max(160), category: z.enum(["neuromodulator", "ha_filler", "biostimulator", "other"]), activeIngredient: z.string().max(255).optional(), documentTitle: z.string().min(3).max(255), documentUrl: z.string().url(), documentVersion: z.string().max(100).optional(), disclosures: z.array(sourceDisclosure).min(1),
  })).mutation(async ({ ctx, input }) => {
    await requireAdmin(ctx.user);
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const source = await db.insert(productSources).values({ manufacturer: input.manufacturer, productName: input.productName, documentTitle: input.documentTitle, documentUrl: input.documentUrl, documentVersion: input.documentVersion, retrievedAt: new Date(), reviewStatus: "pending" }).$returningId();
    const sourceId = source[0]?.id;
    if (!sourceId) throw new Error("Unable to register product source");
    const product = await db.insert(products).values({ sourceId, name: input.productName, manufacturer: input.manufacturer, category: input.category, activeIngredient: input.activeIngredient, isActive: true }).$returningId();
    const productId = product[0]?.id;
    if (!productId) throw new Error("Unable to register product");
    await db.insert(disclosureBlocks).values(input.disclosures.map(block => ({ ...block, treatmentAreaKey: block.scope === "area" ? block.treatmentAreaKey || null : null, productId, sourceId })));
    return { productId, sourceId };
  }),
  disclosures: protectedProcedure.input(z.object({ productId: z.number().int().positive(), treatmentAreaKey: z.string().max(64) })).query(async ({ ctx, input }) => {
    await requireWorkspace(ctx.user);
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    return db.select().from(disclosureBlocks).where(and(eq(disclosureBlocks.productId, input.productId), or(eq(disclosureBlocks.scope, "product"), and(eq(disclosureBlocks.scope, "area"), eq(disclosureBlocks.treatmentAreaKey, input.treatmentAreaKey)))));
  }),
});
