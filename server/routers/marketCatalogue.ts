import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { marketCatalogueProducts } from "../../drizzle/schema";
import { getDb } from "../db";
import { protectedProcedure, router } from "../_core/trpc";
import { requireWorkspace } from "../services/workspace";

const catalogueFilter = z.object({
  category: z.enum(["all", "neuromodulator", "ha_filler", "biostimulator", "polynucleotide", "lipolysis", "other"]).default("all"),
  researchStatus: z.enum(["all", "research", "needs_evidence", "curation_ready", "restricted"]).default("all"),
});

export const marketCatalogueRouter = router({
  list: protectedProcedure.input(catalogueFilter).query(async ({ ctx, input }) => {
    await requireWorkspace(ctx.user);
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const conditions = [];
    if (input.category !== "all") conditions.push(eq(marketCatalogueProducts.category, input.category));
    if (input.researchStatus !== "all") conditions.push(eq(marketCatalogueProducts.researchStatus, input.researchStatus));
    return db.select().from(marketCatalogueProducts).where(conditions.length ? and(...conditions) : undefined).orderBy(desc(marketCatalogueProducts.retrievedAt));
  }),
  summary: protectedProcedure.query(async ({ ctx }) => {
    await requireWorkspace(ctx.user);
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const records = await db.select({ researchStatus: marketCatalogueProducts.researchStatus, distributionStatus: marketCatalogueProducts.distributionStatus }).from(marketCatalogueProducts);
    return {
      total: records.length,
      curationReady: records.filter(record => record.researchStatus === "curation_ready").length,
      restricted: records.filter(record => record.researchStatus === "restricted").length,
      evidenceIncomplete: records.filter(record => record.distributionStatus === "evidence_incomplete").length,
    };
  }),
});
