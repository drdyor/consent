import { desc, eq } from "drizzle-orm";
import { z } from "zod";
import { marketCatalogueProducts } from "../../drizzle/schema";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { requireAdmin, requireWorkspace } from "../services/workspace";

const catalogueFilter = z.object({ category: z.enum(["all", "neuromodulator", "ha_filler", "biostimulator", "polynucleotide", "lipolysis", "other"]).default("all"), researchStatus: z.enum(["all", "research", "needs_evidence", "curation_ready", "restricted"]).default("all") });
const supplierEvidence = z.object({
  catalogueProductId: z.number().int().positive(),
  authorisedDistributorName: z.string().min(2).max(200),
  authorisedDistributorUrl: z.string().url().refine(url => url.startsWith("https://"), "Distributor URL must use HTTPS"),
  authorisedDistributorEvidenceUrl: z.string().url().refine(url => url.startsWith("https://"), "Distributor evidence URL must use HTTPS"),
  distributorVerificationNote: z.string().min(30).max(1000),
  udiDi: z.string().max(160).optional(),
  ceMarkingNumber: z.string().max(100).optional(),
  ceCertificateUrl: z.string().url().refine(url => url.startsWith("https://"), "CE certificate URL must use HTTPS").optional(),
  notifiedBody: z.string().max(200).optional(),
});

export const marketCatalogueRouter = router({
  list: protectedProcedure.input(catalogueFilter).query(async ({ ctx, input }) => {
    await requireWorkspace(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable");
    const records = await db.select().from(marketCatalogueProducts).orderBy(desc(marketCatalogueProducts.retrievedAt));
    return records.filter(record => (input.category === "all" || record.category === input.category) && (input.researchStatus === "all" || record.researchStatus === input.researchStatus));
  }),
  summary: protectedProcedure.query(async ({ ctx }) => {
    await requireWorkspace(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable");
    const records = await db.select({ researchStatus: marketCatalogueProducts.researchStatus, distributionStatus: marketCatalogueProducts.distributionStatus }).from(marketCatalogueProducts);
    return { total: records.length, curationReady: records.filter(record => record.researchStatus === "curation_ready").length, restricted: records.filter(record => record.researchStatus === "restricted").length, evidenceIncomplete: records.filter(record => record.distributionStatus === "evidence_incomplete").length };
  }),
  recordSupplierEvidence: protectedProcedure.input(supplierEvidence).mutation(async ({ ctx, input }) => {
    await requireAdmin(ctx.user); const db = await getDb(); if (!db) throw new Error("Database unavailable");
    const rows = await db.select().from(marketCatalogueProducts).where(eq(marketCatalogueProducts.id, input.catalogueProductId)).limit(1); const record = rows[0];
    if (!record) throw new Error("Catalogue record not found");
    if (record.researchStatus !== "curation_ready") throw new Error("Supplier evidence can be marked diligence-ready only for curation-ready records");
    if (record.productClassification === "medical_device" && !(input.udiDi && input.ceMarkingNumber && input.ceCertificateUrl && input.notifiedBody)) throw new Error("Medical-device supplier evidence requires UDI/DI, CE marking, certificate URL, and notified body");
    const now = new Date();
    const { catalogueProductId: _catalogueProductId, ...evidence } = input;
    await db.update(marketCatalogueProducts).set({ ...evidence, distributorVerifiedAt: now, deviceEvidenceVerifiedAt: record.productClassification === "medical_device" ? now : record.deviceEvidenceVerifiedAt, distributionStatus: "due_diligence", reviewedAt: now }).where(eq(marketCatalogueProducts.id, record.id));
    return { success: true, reviewedAt: now };
  }),
});
