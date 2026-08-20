import { and, eq, or } from "drizzle-orm";
import { z } from "zod";
import { auditEvents, consentTemplates, disclosureBlocks, products, productSources } from "../../drizzle/schema";
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
  createTemplate: protectedProcedure.input(z.object({ name: z.string().min(3).max(160), procedureKey: z.string().min(3).max(100), description: z.string().max(1000).optional(), jurisdiction: z.string().min(2).max(32).default("PL"), language: z.enum(["pl", "en"]).default("pl"), sections: templateSections })).mutation(async ({ ctx, input }) => {
    const workspace = await requireAdmin(ctx.user);
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const result = await db.insert(consentTemplates).values({ clinicId: workspace.clinic.id, createdByUserId: ctx.user.id, name: input.name, procedureKey: input.procedureKey, description: input.description, jurisdiction: input.jurisdiction, language: input.language, sections: input.sections, status: "active" }).$returningId();
    return { id: result[0]?.id };
  }),
  sources: protectedProcedure.query(async ({ ctx }) => {
    await requireWorkspace(ctx.user);
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    return db.select({ product: products, source: productSources }).from(products).innerJoin(productSources, eq(products.sourceId, productSources.id));
  }),
  approveSource: protectedProcedure.input(z.object({ sourceId: z.number().int().positive() })).mutation(async ({ ctx, input }) => {
    const workspace = await requireAdmin(ctx.user);
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const productRow = await db.select({ product: products, source: productSources }).from(products).innerJoin(productSources, eq(products.sourceId, productSources.id)).where(eq(productSources.id, input.sourceId)).limit(1);
    const row = productRow[0];
    if (!row) throw new Error("Product source not found");
    if (!row.source.canonicalVerifiedAt || !row.source.canonicalVerifiedByUserId || !row.source.canonicalVerificationNote) throw new Error("An administrator must verify and attest to the canonical SPC, IFU, PI, or DFU document before source approval");
    const sourceBlocks = await db.select({ id: disclosureBlocks.id }).from(disclosureBlocks).where(eq(disclosureBlocks.sourceId, input.sourceId)).limit(1);
    if (!sourceBlocks.length) throw new Error("A patient-ready source must contain at least one curated canonical disclosure excerpt");
    if (row.source.jurisdiction === "PL" && row.product.registryStatus !== "verified") throw new Error("Poland-ready consent use requires verified product registry evidence before source approval");
    await db.update(productSources).set({ reviewStatus: "approved", reviewedByUserId: ctx.user.id, reviewedAt: new Date() }).where(eq(productSources.id, input.sourceId));
    await db.insert(auditEvents).values({ clinicId: workspace.clinic.id, actorUserId: ctx.user.id, action: "source.approved", entityType: "productSource", entityId: String(input.sourceId), summary: "Product source approved for patient-ready consent use" });
    return { success: true };
  }),
  verifyCanonicalSource: protectedProcedure.input(z.object({ sourceId: z.number().int().positive(), note: z.string().min(30).max(1000) })).mutation(async ({ ctx, input }) => {
    const workspace = await requireAdmin(ctx.user);
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const sourceRows = await db.select().from(productSources).where(eq(productSources.id, input.sourceId)).limit(1);
    const source = sourceRows[0];
    if (!source) throw new Error("Product source not found");
    if (!source.documentTitle || !source.documentVersion || !source.retrievedAt || !source.documentUrl.startsWith("https://")) throw new Error("Canonical source verification requires an HTTPS URL, title, version or date, and retrieval timestamp");
    const verifiedAt = new Date();
    await db.update(productSources).set({ canonicalVerifiedAt: verifiedAt, canonicalVerifiedByUserId: ctx.user.id, canonicalVerificationNote: input.note }).where(eq(productSources.id, input.sourceId));
    await db.insert(auditEvents).values({ clinicId: workspace.clinic.id, actorUserId: ctx.user.id, action: "source.canonical_verified", entityType: "productSource", entityId: String(input.sourceId), summary: `${source.documentKind.toUpperCase()} canonical document verified for source ${input.sourceId}` });
    return { success: true, verifiedAt };
  }),
  verifyProductRegistry: protectedProcedure.input(z.object({ productId: z.number().int().positive(), jurisdiction: z.string().min(2).max(32).default("PL"), registryAuthority: z.string().min(2).max(160), registryIdentifier: z.string().min(2).max(160) })).mutation(async ({ ctx, input }) => {
    const workspace = await requireAdmin(ctx.user);
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const rows = await db.select().from(products).where(eq(products.id, input.productId)).limit(1);
    const product = rows[0];
    if (!product) throw new Error("Product not found");
    const verifiedAt = new Date();
    await db.update(products).set({ registryIdentifier: input.registryIdentifier, registryStatus: "verified" }).where(eq(products.id, input.productId));
    await db.update(productSources).set({ jurisdiction: input.jurisdiction, registryAuthority: input.registryAuthority, registryIdentifier: input.registryIdentifier, registryVerifiedAt: verifiedAt }).where(eq(productSources.id, product.sourceId));
    await db.insert(auditEvents).values({ clinicId: workspace.clinic.id, actorUserId: ctx.user.id, action: "product.registry_verified", entityType: "product", entityId: String(input.productId), summary: `${input.registryAuthority} registry evidence verified for product ${input.registryIdentifier}` });
    return { success: true, verifiedAt };
  }),
  createProductSource: protectedProcedure.input(z.object({
    productName: z.string().min(2).max(160), manufacturer: z.string().min(2).max(160), category: z.enum(["neuromodulator", "ha_filler", "biostimulator", "other"]), activeIngredient: z.string().max(255).optional(), jurisdiction: z.string().min(2).max(32).default("PL"), language: z.enum(["pl", "en"]).default("pl"), registryAuthority: z.string().max(160).optional(), registryIdentifier: z.string().max(160).optional(), documentTitle: z.string().min(3).max(255), documentUrl: z.string().url().refine(url => url.startsWith("https://"), "Canonical document URL must use HTTPS"), documentVersion: z.string().min(2).max(100), documentKind: z.enum(["spc", "ifu", "pi", "dfu"]), disclosures: z.array(sourceDisclosure).min(1),
  })).mutation(async ({ ctx, input }) => {
    await requireAdmin(ctx.user);
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const hasRegistryEvidence = Boolean(input.registryAuthority && input.registryIdentifier);
    const source = await db.insert(productSources).values({ manufacturer: input.manufacturer, productName: input.productName, jurisdiction: input.jurisdiction, language: input.language, registryAuthority: input.registryAuthority || null, registryIdentifier: input.registryIdentifier || null, registryVerifiedAt: hasRegistryEvidence ? new Date() : null, documentTitle: input.documentTitle, documentUrl: input.documentUrl, documentVersion: input.documentVersion, documentKind: input.documentKind, retrievedAt: new Date(), reviewStatus: "pending" }).$returningId();
    const sourceId = source[0]?.id;
    if (!sourceId) throw new Error("Unable to register product source");
    const product = await db.insert(products).values({ sourceId, name: input.productName, manufacturer: input.manufacturer, category: input.category, activeIngredient: input.activeIngredient, registryIdentifier: input.registryIdentifier || null, registryStatus: hasRegistryEvidence ? "verified" : "unverified", isActive: true }).$returningId();
    const productId = product[0]?.id;
    if (!productId) throw new Error("Unable to register product");
    await db.insert(disclosureBlocks).values(input.disclosures.map(block => ({ ...block, language: input.language, treatmentAreaKey: block.scope === "area" ? block.treatmentAreaKey || null : null, productId, sourceId })));
    return { productId, sourceId };
  }),
  disclosures: protectedProcedure.input(z.object({ productId: z.number().int().positive(), treatmentAreaKey: z.string().max(64), language: z.enum(["pl", "en"]).default("pl") })).query(async ({ ctx, input }) => {
    await requireWorkspace(ctx.user);
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const blocks = await db.select().from(disclosureBlocks).where(and(eq(disclosureBlocks.productId, input.productId), eq(disclosureBlocks.language, input.language), or(eq(disclosureBlocks.scope, "product"), and(eq(disclosureBlocks.scope, "area"), eq(disclosureBlocks.treatmentAreaKey, input.treatmentAreaKey)))));
    return blocks.filter(block => block.productId === input.productId && block.language === input.language && (block.scope === "product" || (block.scope === "area" && block.treatmentAreaKey === input.treatmentAreaKey)));
  }),
  sourceAudit: protectedProcedure.query(async ({ ctx }) => {
    await requireAdmin(ctx.user);
    const db = await getDb();
    if (!db) throw new Error("Database unavailable");
    const records = await db.select({ product: products, source: productSources }).from(products).innerJoin(productSources, eq(products.sourceId, productSources.id));
    const blocks = await db.select({ sourceId: disclosureBlocks.sourceId, id: disclosureBlocks.id }).from(disclosureBlocks);
    const sources = records.map(({ product, source }) => {
      const disclosureCount = blocks.filter(block => block.sourceId === source.id).length;
      const canonicalReady = Boolean(source.canonicalVerifiedAt && source.canonicalVerifiedByUserId && source.canonicalVerificationNote);
      const registryReady = source.jurisdiction !== "PL" || product.registryStatus === "verified";
      const eligibleForApproval = canonicalReady && registryReady && disclosureCount > 0;
      return { sourceId: source.id, productId: product.id, productName: product.name, documentKind: source.documentKind, reviewStatus: source.reviewStatus, disclosureCount, canonicalReady, registryReady, eligibleForApproval };
    });
    const disclosureBlockAudits = records.flatMap(({ product, source }) => {
      const canonicalReady = Boolean(source.canonicalVerifiedAt && source.canonicalVerifiedByUserId && source.canonicalVerificationNote);
      const registryReady = source.jurisdiction !== "PL" || product.registryStatus === "verified";
      return blocks.filter(block => block.sourceId === source.id).map(block => ({
        disclosureBlockId: block.id,
        sourceId: source.id,
        productId: product.id,
        productName: product.name,
        canonicalReady,
        registryReady,
        sourceReviewStatus: source.reviewStatus,
        eligibleForApproval: canonicalReady && registryReady,
        patientReady: source.reviewStatus === "approved" && canonicalReady && registryReady,
      }));
    });
    return { sources, disclosureBlockAudits };
  }),
});
